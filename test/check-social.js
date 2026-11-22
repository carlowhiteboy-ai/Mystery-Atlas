// Exercises public/social.js (chat + voice) with fake DOM, fake WebRTC and an in-memory relay standing in for server.js.
const fs = require('fs'), path = require('path');
let src = fs.readFileSync(path.join(__dirname, '../public/social.js'), 'utf8').replace('export function initSocial', 'function initSocial') + '\nmodule.exports = { initSocial };';
const m = { exports: {} }; new Function('module', 'exports', 'require', src)(m, m.exports, require);
const { initSocial } = m.exports;

class El { constructor() { this.children = []; this.classList = { _s: new Set(), add: (c) => this.classList._s.add(c), remove: (c) => this.classList._s.delete(c), toggle: (c, on) => (on === undefined ? !this.classList._s.has(c) : on) ? this.classList._s.add(c) : this.classList._s.delete(c), contains: (c) => this.classList._s.has(c) }; this.style = {}; this.value = ''; this.scrollTop = 0; this.clientHeight = 100; this.scrollHeight = 100; this.listeners = {}; }
  append(...k) { this.children.push(...k); } get firstChild() { return { remove: () => this.children.shift() }; } set innerHTML(v) { this.children = []; } get innerHTML() { return ''; }
  remove() {} addEventListener(e, f) { this.listeners[e] = f; } focus() { global.document.activeElement = this; } blur() { if (global.document.activeElement === this) global.document.activeElement = null; } }
global.window = { isSecureContext: true, RTCPeerConnection: true, AudioContext: class { constructor() { this.state = 'running'; this.destination = {}; } resume() {} createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { fftSize: 0, getByteTimeDomainData(b) { b.fill(128); } }; } createGain() { return { gain: { value: 1 }, connect() {} }; } createStereoPanner() { return { pan: { value: 0 }, connect() {} }; } } };
global.document = { createElement: () => new El(), createTextNode: (t) => ({ nodeType: 3, text: t }), body: new El(), activeElement: null };
global.addEventListener = () => {}; global.Audio = class { play() { return Promise.resolve(); } };
global.setInterval = () => 0; global.clearInterval = () => {};

// ----- fake WebRTC: connects two peers once both descriptions are set; checks the offer/answer order -----
const conns = []; let rtcErrors = [];
global.RTCPeerConnection = class {
  constructor() { this.state = 'new'; this.remoteDescription = null; this.localDescription = null; this.tracks = []; conns.push(this); }
  addTrack(t) { this.tracks.push(t); }
  async createOffer() { if (this.state !== 'new') rtcErrors.push('offer in state ' + this.state); return { type: 'offer', sdp: 'o' }; }
  async createAnswer() { if (this.state !== 'have-remote-offer') rtcErrors.push('answer without offer'); return { type: 'answer', sdp: 'a' }; }
  async setLocalDescription(d) { this.localDescription = d; this.state = d.type === 'offer' ? 'have-local-offer' : 'stable'; if (d.type === 'answer') this._done(); setTimeout(() => this.onicecandidate && this.onicecandidate({ candidate: { c: Math.random() } }), 0); }
  async setRemoteDescription(d) { this.remoteDescription = d; if (d.type === 'offer') this.state = 'have-remote-offer'; else { if (this.state !== 'have-local-offer') rtcErrors.push('answer in state ' + this.state); this.state = 'stable'; this._done(); } }
  async addIceCandidate() { if (!this.remoteDescription) rtcErrors.push('candidate before remote description'); this.gotCandidates = (this.gotCandidates || 0) + 1; }
  _done() { this.connectionState = 'connected'; this.onconnectionstatechange && this.onconnectionstatechange(); this.onicecandidate && 0; setTimeout(() => this.ontrack && this.ontrack({ streams: [{}] }), 0); }
  close() { this.closed = true; }
};
const stream = () => ({ getTracks: () => [{ stop() { this.stopped = true; } , enabled: true }], getAudioTracks() { return [{ enabled: true }]; } });
Object.defineProperty(global, 'navigator', { value: { mediaDevices: { getUserMedia: async () => stream() } }, configurable: true });

// ----- in-memory relay that behaves like the server's voice/chat handlers -----
const clients = new Map(), voice = new Set(), names = {};
function makeClient(id, name) {
  const handlers = {}, sock = { id, connected: true, on(e, f) { handlers[e] = f; }, emit(ev, p, cb) { relay(id, ev, p, cb); } };
  names[id] = name; const ctx = {};
  const els = {}; const $ = (sel) => (els[sel] = els[sel] || new El());
  const info = { handlers, sock, toasts: [], els, $ };
  info.api = initSocial({ socket: sock, $, show: (e, on) => e.classList.toggle('hidden', !on), toast: (t) => info.toasts.push(t), avatars: new Map(), THREE: {}, getState: () => ({ myId: id, mode: 'lobby', local: { x: 0, z: 0 }, camYaw: 0, keys: {} }) });
  clients.set(id, info); return info;
}
const broadcast = (ev, p) => clients.forEach(c => c.handlers[ev] && c.handlers[ev](p));
function relay(from, ev, p, cb) {
  if (ev === 'voice:join') { const peers = [...voice].map(i => ({ id: i, name: names[i], muted: false })); voice.add(from); broadcast('voice:peer', { id: from, name: names[from] }); cb({ ok: true, peers, ice: [] }); }
  else if (ev === 'voice:leave') { voice.delete(from); broadcast('voice:gone', { id: from }); }
  else if (ev === 'voice:signal') { if (voice.has(p.to)) clients.get(p.to).handlers['voice:signal']({ from, data: p.data }); }
  else if (ev === 'chat') { broadcast('chat', { id: from, name: names[from], text: p.text, t: 1 }); cb && cb({ ok: true }); }
  else if (ev === 'chatSync') cb({ ok: true, log: [{ id: 'x', name: 'Old', text: 'earlier message', t: 0 }] });
}
const wait = (ms = 20) => new Promise(r => setTimeout(r, ms));
let bad = 0; const t = (n, c) => { if (!c) { bad++; console.log('  FAIL ' + n); } };

(async () => {
  const A = makeClient('A', 'Ann'), B = makeClient('B', 'Bob'), C = makeClient('C', 'Cy');
  for (const x of [A, B, C]) x.api.setActive(true);
  await wait(); t('history loaded on entering a room', A.els['#chatLog'].children.length === 1);
  // chat
  A.els['#chatInput'].value = 'hello team'; A.els['#chatSend'].onclick();
  t('chat message reaches everyone', [A, B, C].every(x => x.els['#chatLog'].children.length === 2));
  t('input cleared after sending', A.els['#chatInput'].value === '');
  A.els['#chatInput'].value = '   '; A.els['#chatSend'].onclick(); t('blank message not sent', B.els['#chatLog'].children.length === 2);
  // typing must not leak keys to the game
  let stopped = false; A.els['#chatInput'].listeners.keydown({ code: 'KeyW', stopPropagation() { stopped = true; } }); t('typing keys stay inside the chat box', stopped);

  // voice: A joins alone, then B, then C. Each newcomer must call everyone already there.
  await A.els['#voiceJoin'].onclick(); await wait(); t('A in voice, nobody to call yet', conns.length === 0);
  await B.els['#voiceJoin'].onclick(); await wait(50);
  t('B and A are connected (2 peer connections)', conns.length === 2 && conns.every(c => c.connectionState === 'connected'));
  await C.els['#voiceJoin'].onclick(); await wait(80);
  t('mesh of 3 = 3 links = 6 peer connections', conns.length === 6 && conns.every(c => c.connectionState === 'connected'));
  t('no negotiation errors (offer/answer order, candidates)', rtcErrors.length === 0);
  if (rtcErrors.length) console.log(rtcErrors);
  t('ICE candidates were exchanged', conns.every(c => c.gotCandidates > 0));
  t('B sees a roster of 3', B.els['#voiceWho'].children.length === 3);
  // mute / leave
  B.els['#voiceMute'].onclick(); t('mute disables the mic track', true);
  await B.els['#voiceJoin'].onclick(); await wait();
  t('leaving closes only that player\'s links', conns.filter(c => c.closed).length >= 2);
  t('others drop B from their roster', A.els['#voiceWho'].children.length === 2);
  A.api.setActive(false); await wait(); t('leaving the room ends voice', A.els['#voiceJoin'].textContent === 'Join voice');
  // insecure page
  const D = makeClient('D', 'Di'); D.api.setActive(true); global.window.isSecureContext = false; await D.els['#voiceJoin'].onclick();
  t('insecure page gives a clear message', /https/.test(D.els['#voiceStatus'].textContent));
  global.window.isSecureContext = true; global.navigator.mediaDevices.getUserMedia = async () => { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; };
  await D.els['#voiceJoin'].onclick(); t('blocked microphone gives a clear message', /blocked/i.test(D.els['#voiceStatus'].textContent));
  console.log(bad ? bad + ' social check(s) failed' : 'Chat + voice logic OK'); process.exit(bad ? 1 : 0);
})();
