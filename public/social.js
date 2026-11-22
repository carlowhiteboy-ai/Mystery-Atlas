/* Chat + voice for multiplayer rooms.
   Chat: text messages (server filtered and rate limited) with speech bubbles over avatars.
   Voice: WebRTC peer to peer. The server only relays the set-up messages ('voice:signal'); every player sends their
   microphone straight to every other player in voice (a mesh, fine for a handful of detectives). */
export function initSocial(ctx) {
  const { socket, $, show, toast, avatars, THREE, getState } = ctx;
  const box = $('#social'), logEl = $('#chatLog'), input = $('#chatInput'), minBtn = $('#chatMin'), dot = $('#chatDot');
  const joinBtn = $('#voiceJoin'), muteBtn = $('#voiceMute'), nearBtn = $('#voiceNear'), statusEl = $('#voiceStatus'), whoEl = $('#voiceWho');
  let active = false, minimized = false;

  /* ================= chat ================= */
  function addMessage(m) {
    const near = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
    const row = document.createElement('div'); row.className = 'msg' + (m.id === getState().myId ? ' mine' : '');
    const b = document.createElement('b'); b.textContent = m.name + ': ';
    row.append(b, document.createTextNode(m.text)); logEl.append(row);
    while (logEl.children.length > 80) logEl.firstChild.remove();
    if (near) logEl.scrollTop = logEl.scrollHeight;
    if (minimized && m.id !== getState().myId) dot.classList.remove('hidden');
  }
  function sendChat() {
    const text = input.value.trim(); if (!text) return;
    if (!socket.connected) return toast('You are offline. Your message was not sent.');
    socket.emit('chat', { text }, (r) => { if (r && !r.ok && r.error) toast(r.error); });
    input.value = '';
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();                                   // typing never moves your detective or triggers shortcuts
    if (e.code === 'Enter') { sendChat(); input.blur(); } else if (e.code === 'Escape') input.blur();
  });
  addEventListener('keydown', (e) => {
    if (!active || minimized || document.activeElement === input || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (document.body.classList.contains('creating') || !$('#docView').classList.contains('hidden')) return;
    if (e.code === 'Enter') { input.focus(); e.preventDefault(); }
    else if (e.code === 'KeyV' && !e.repeat && inVoice) { toggleMute(); }
  });
  input.addEventListener('focus', () => { const k = getState().keys; if (k) for (const c in k) k[c] = false; });   // stop walking while typing
  $('#chatSend').onclick = () => { sendChat(); };
  minBtn.onclick = () => { minimized = !minimized; box.classList.toggle('min', minimized); if (!minimized) dot.classList.add('hidden'); const lbl = minimized ? 'Show chat' : 'Hide chat'; minBtn.setAttribute('aria-label', lbl); minBtn.title = lbl; minBtn.setAttribute('aria-expanded', String(!minimized)); };
  socket.on('chat', (m) => { if (!active) return; addMessage(m); bubble(m.id, m.text); });

  // speech bubble above the speaker's head for a few seconds
  function bubble(id, text) {
    const a = avatars.get(id); if (!a || !a.obj) return;
    if (a.bubble) { a.obj.remove(a.bubble); a.bubble.material.map.dispose(); a.bubble.material.dispose(); clearTimeout(a.bubbleT); }
    const words = text.slice(0, 80).split(' '), lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 22 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    const c = document.createElement('canvas'), g = c.getContext('2d'), lh = 30; c.width = 360; c.height = lines.length * lh + 26;
    g.fillStyle = 'rgba(12,14,24,.82)';   // soft filled bubble, no outline
    g.beginPath(); g.roundRect ? g.roundRect(2, 2, c.width - 4, c.height - 4, 14) : g.rect(2, 2, c.width - 4, c.height - 4); g.fill();
    g.font = '22px "Special Elite", monospace'; g.fillStyle = '#fff'; g.textAlign = 'center'; lines.forEach((l, i) => g.fillText(l, c.width / 2, 32 + i * lh));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, fog: false }));
    s.renderOrder = 10; s.scale.set(c.width / 120, c.height / 120, 1); s.position.y = 3.9 + s.scale.y / 2; a.obj.add(s); a.bubble = s;
    a.bubbleT = setTimeout(() => { if (a.bubble === s) { a.obj.remove(s); s.material.map.dispose(); s.material.dispose(); a.bubble = null; } }, 6000);
  }

  /* ================= voice ================= */
  let localStream = null, inVoice = false, muted = false, nearby = false, ice = [], actx = null, levelTimer = null;
  const peers = new Map();                       // id -> { pc, pending, audio, gain, pan, an, level }
  const roster = new Map();                      // id -> { name, muted }
  const setStatus = (t) => { statusEl.textContent = t || ''; };
  const nameOf = (id) => (roster.get(id) && roster.get(id).name) || 'a player';
  const signal = (to, data) => socket.emit('voice:signal', { to, data });

  function renderRoster() {
    whoEl.innerHTML = '';
    const myId = getState().myId;
    for (const [id, p] of roster) {
      const chip = document.createElement('span'); chip.className = 'chip' + (p.muted ? ' muted' : '') + (p.talking ? ' talking' : '');
      chip.textContent = (id === myId ? 'You' : p.name); whoEl.append(chip);
    }
    show(whoEl, roster.size > 0);
  }
  function paintButtons() {
    joinBtn.textContent = inVoice ? 'Leave voice' : 'Join voice'; joinBtn.classList.toggle('on', inVoice);
    muteBtn.disabled = !inVoice; muteBtn.classList.toggle('off', muted); nearBtn.disabled = !inVoice;
    nearBtn.textContent = 'Nearby only: ' + (nearby ? 'on' : 'off'); nearBtn.classList.toggle('on', nearby);
    muteBtn.title = muted ? 'Unmute microphone (V)' : 'Mute microphone (V)';
  }

  async function joinVoice() {
    if (inVoice) return;
    if (!socket.connected) return toast('You are offline.');
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) {
      return setStatus('Voice needs a secure page (https:// or localhost) and a browser with microphone support.');
    }
    // create the audio engine now, while the click still counts as a user gesture (the permission prompt can take a while)
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
    setStatus('Asking for your microphone…');
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch (e) {
      const why = e && e.name === 'NotAllowedError' ? 'Microphone blocked. Allow it with the lock icon in the address bar, then try again.'
        : e && e.name === 'NotFoundError' ? 'No microphone found. Plug one in and try again.' : 'Could not open the microphone (' + ((e && e.name) || 'error') + ').';
      return setStatus(why);
    }
    socket.emit('voice:join', {}, (r) => {
      if (!r || !r.ok) { stopLocal(); return setStatus('Could not join voice. Try again.'); }
      inVoice = true; muted = false; ice = r.ice || [];
      roster.clear(); roster.set(getState().myId, { name: 'You', muted: false });
      for (const p of r.peers) roster.set(p.id, { name: p.name, muted: p.muted });
      watchLevel(getState().myId, localStream);
      for (const p of r.peers) connect(p.id, true);       // the newcomer calls everyone who is already in voice
      levelTimer = setInterval(tick, 100);
      setStatus(r.peers.length ? 'Connecting…' : 'You are in voice. Waiting for others to join.'); paintButtons(); renderRoster();
    });
  }
  function stopLocal() { if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; } }
  function leaveVoice(silent) {
    if (!inVoice && !localStream) return;
    if (inVoice && !silent && socket.connected) socket.emit('voice:leave');
    for (const id of [...peers.keys()]) closePeer(id);
    stopLocal(); inVoice = false; muted = false; clearInterval(levelTimer); levelTimer = null; roster.clear(); levels.clear();
    setStatus(''); paintButtons(); renderRoster();
  }
  function toggleMute() {
    if (!inVoice || !localStream) return; muted = !muted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    const me = roster.get(getState().myId); if (me) me.muted = muted;
    socket.emit('voice:state', { muted }); paintButtons(); renderRoster();
    setStatus(muted ? 'Microphone muted.' : '');
  }

  function connect(id, initiator) {
    closePeer(id);
    const pc = new RTCPeerConnection({ iceServers: ice }), P = { id, pc, pending: [], audio: null, gain: null, pan: null };
    peers.set(id, P);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = (e) => { if (e.candidate) signal(id, { candidate: e.candidate }); };
    pc.ontrack = (e) => attach(P, e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('');
      if (pc.connectionState === 'failed') { setStatus('Could not connect voice with ' + nameOf(id) + '. Strict networks need a TURN server (see the README).'); try { pc.restartIce(); } catch (e) { /* ignore */ } }
    };
    if (initiator) pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => signal(id, { sdp: pc.localDescription })).catch(() => setStatus('Voice set-up failed.'));
    return P;
  }
  function closePeer(id) {
    const P = peers.get(id); if (!P) return; peers.delete(id);
    try { P.pc.close(); } catch (e) { /* ignore */ }
    if (P.audio) { P.audio.srcObject = null; P.audio = null; }
    levels.delete(id);
  }
  function attach(P, stream) {
    const el = new Audio(); el.srcObject = stream; el.autoplay = true; P.audio = el;
    try {
      if (!actx) throw new Error('no audio context');
      el.muted = true; el.play().catch(() => {});          // Chrome only delivers WebRTC audio to Web Audio while an element plays it
      const src = actx.createMediaStreamSource(stream); P.gain = actx.createGain(); P.pan = actx.createStereoPanner ? actx.createStereoPanner() : null;
      src.connect(P.gain); if (P.pan) { P.gain.connect(P.pan); P.pan.connect(actx.destination); } else P.gain.connect(actx.destination);
      watchLevel(P.id, stream);
    } catch (e) { el.muted = false; el.play().catch(() => {}); }   // fallback: plain playback (no distance effect)
  }
  socket.on('voice:signal', async ({ from, data }) => {
    if (!inVoice || !data) return;
    try {
      let P = peers.get(from);
      if (data.sdp && data.sdp.type === 'offer') {
        P = connect(from, false); await P.pc.setRemoteDescription(data.sdp);
        for (const c of P.pending.splice(0)) await P.pc.addIceCandidate(c).catch(() => {});
        const ans = await P.pc.createAnswer(); await P.pc.setLocalDescription(ans); signal(from, { sdp: P.pc.localDescription });
      } else if (data.sdp && data.sdp.type === 'answer' && P) {
        await P.pc.setRemoteDescription(data.sdp);
        for (const c of P.pending.splice(0)) await P.pc.addIceCandidate(c).catch(() => {});
      } else if (data.candidate && P) {
        if (P.pc.remoteDescription) await P.pc.addIceCandidate(data.candidate).catch(() => {}); else P.pending.push(data.candidate);
      }
    } catch (e) { setStatus('Voice connection problem with ' + nameOf(from) + '.'); }
  });
  socket.on('voice:peer', (p) => { if (inVoice && p.id !== getState().myId) { roster.set(p.id, { name: p.name, muted: false }); renderRoster(); toast(p.name + ' joined voice.'); } });
  socket.on('voice:gone', (p) => { closePeer(p.id); if (roster.delete(p.id)) renderRoster(); });
  socket.on('voice:state', (p) => { const r = roster.get(p.id); if (r) { r.muted = p.muted; renderRoster(); } });
  socket.on('disconnect', () => leaveVoice(true));        // the server forgets us on a dropped connection

  // who is speaking (and, with "Nearby only", fade voices with distance and pan them left/right)
  const levels = new Map();
  function watchLevel(id, stream) {
    if (!actx) return; try { const an = actx.createAnalyser(); an.fftSize = 512; actx.createMediaStreamSource(stream).connect(an); levels.set(id, { an, buf: new Uint8Array(an.fftSize) }); } catch (e) { /* ignore */ }
  }
  function tick() {
    const S = getState(); let changed = false;
    if (actx && actx.state === 'suspended') actx.resume();
    for (const [id, L] of levels) {
      L.an.getByteTimeDomainData(L.buf); let s = 0; for (const v of L.buf) { const x = (v - 128) / 128; s += x * x; }
      const talking = Math.sqrt(s / L.buf.length) > 0.03 && !(id === S.myId && muted), r = roster.get(id);
      if (r && r.talking !== talking) { r.talking = talking; changed = true; }
    }
    if (changed) renderRoster();
    for (const [id, P] of peers) {
      if (!P.gain) continue;
      let g = 1, pan = 0; const a = avatars.get(id);
      if (nearby && a && S.mode === 'playing') {
        const dx = a.obj.position.x - S.local.x, dz = a.obj.position.z - S.local.z, d = Math.hypot(dx, dz);
        g = Math.pow(Math.max(0, 1 - d / 32), 1.3); pan = Math.max(-1, Math.min(1, (dx * Math.cos(S.camYaw) - dz * Math.sin(S.camYaw)) / 16));
      }
      P.gain.gain.value = g; if (P.pan) P.pan.pan.value = pan;
    }
  }
  joinBtn.onclick = () => { if (inVoice) leaveVoice(false); else joinVoice(); };
  muteBtn.onclick = toggleMute;
  nearBtn.onclick = () => { nearby = !nearby; paintButtons(); };
  paintButtons(); renderRoster();

  return {
    // called when you enter / leave a room (lobby, round or results all count as "in a room")
    setActive(on) {
      if (on === active) return; active = on; show(box, on);
      logEl.innerHTML = ''; dot.classList.add('hidden');
      if (on) { if (socket.connected) socket.emit('chatSync', {}, (r) => { if (r && r.ok) r.log.forEach(addMessage); }); }
      else { leaveVoice(true); input.blur(); }
    }
  };
}
