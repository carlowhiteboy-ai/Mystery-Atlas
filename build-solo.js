// Builds mystery-atlas-solo.html: one file, no server needed (three.js comes from a CDN).
// Run: node build-solo.js
const fs = require('fs');
const rd = (f) => fs.readFileSync(f, 'utf8');
const game = rd('public/game.js');
const start = game.indexOf('/* ---------- helpers ---------- */');
const end = game.indexOf('/* ---------- UI flow ---------- */');
if (start < 0 || end < 0) throw new Error('markers not found in public/game.js');
const core = game.slice(start, end)
  .replace(/\/\*@SOCKET\*\/[\s\S]*?\/\*@END-SOCKET\*\//,
    "let netMissing = false;\nconst socket = { connected: true, emit(ev) { if (ev === 'search') trySearch(); }, volatile: { emit() {} } };")
  .replace('const MAPS = window.MAPS;', '');
const evidence = rd('public/evidence.js').replace(/^export /gm, '');
const creator = rd('public/creator.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const importmap = '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>';

const body = `
<div id="loading" role="status" aria-live="polite">
  <div class="ld-box">
    <div class="ld-title">Mystery Atlas</div>
    <div class="ld-lens" aria-hidden="true"></div>
    <div class="ld-bar"><i id="ldFill"></i></div>
    <div id="ldMsg">Loading…</div>
    <div id="ldTip" class="small"></div>
    <div id="ldErr" class="hidden"><div id="ldErrTitle"></div><p id="ldErrText"></p><button id="ldRetry" class="primary">Try again</button></div>
  </div>
</div>
<script>
${rd('public/loader.js')}
</script>
<div id="stage"></div>
<h1 id="title">Mystery Atlas</h1>
<button id="mute" title="Sound on/off" aria-label="Sound on/off" aria-pressed="true">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path class="body" d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path class="waves" d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.6a8 8 0 0 1 0 10.8"/><path class="slash" d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>
</button>

<section id="home" class="screen">
  <div class="card">
    <label>Your name</label>
    <input id="name" maxlength="16" placeholder="Detective name" autocomplete="off">
    <p class="small">Solo mode: a fresh case from 1500 mysteries on 10 maps every time. Find the letters, photos and tickets, then name the culprit within 10 minutes.</p>
    <button id="playBtn" class="primary">Start mystery</button>
    <button id="createMysteryBtn" class="wide">Create a mystery</button>
    <div class="small">Write your own case. It is saved in this browser and mixed into your rounds (export it to share a file).</div>
  </div>
</section>

<div id="hud" class="hidden">
  <div id="timer">10:00</div>
  <div id="case" class="panel"><div id="caseLoc"></div><div id="caseIntro" class="small"></div><div id="caseTitle"></div><div id="caseWx" class="small"></div></div>
  <div id="board" class="panel"><h3>Evidence board</h3><ul id="evidence"></ul></div>
  <div id="votes" class="panel">
    <div id="voteQ"></div><div id="voteOpts"></div>
    <div class="row tight" style="margin-top:8px"><button id="submitBtn" class="primary">Submit answer</button><span id="voteStatus" class="small"></span></div>
  </div>
  <div id="talk" class="panel hidden"><div id="talkHead"></div><div id="talkBtns"></div><div id="talkText" class="small"></div><button id="talkClose">Close (Esc)</button></div>
  <div id="prompt" class="hidden">Press <b>E</b> to search</div>
  <div id="help" class="small">WASD / Arrows move &middot; Drag mouse to look &middot; E search</div>
</div>

<section id="end" class="screen hidden">
  <div class="card">
    <h2 id="endTitle"></h2><p id="endAnswer"></p><p id="endExplain" class="small"></p>
    <div id="endCredit" class="small hidden"></div>
    <ul id="endClues" class="small"></ul>
    <button id="againBtn" class="primary">Play again</button>
  </div>
</section>
<div id="docView" class="hidden"><div id="docBox"><div id="docTitle"></div><div id="docCanvas"></div><button id="docClose" class="primary">Close (Esc)</button></div></div>
<div id="toast"></div>
`;

const flow = `
/* ---------- single-player flow ---------- */
const KIND = { letter: 'a letter', diary: 'a diary page', note: 'a scribbled note', photo: 'a photograph', receipt: 'a receipt', ticket: 'a ticket' };
const docs = new Map(); let viewing = false;
function openDoc(id) { const d = docs.get(id); if (!d) return; const box = $('#docCanvas'); box.innerHTML = ''; d.cv.className = 'docimg'; box.append(d.cv); $('#docTitle').textContent = d.c.label + ': ' + (KIND[d.c.type] || 'evidence'); show($('#docView'), true); viewing = true; }
function closeDoc() { show($('#docView'), false); viewing = false; }
$('#docClose').onclick = closeDoc;
$('#docView').addEventListener('pointerdown', (e) => { if (e.target.id === 'docView') closeDoc(); });
addEventListener('keydown', (e) => { if (viewing && (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Enter')) { closeDoc(); e.preventDefault(); } });

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: keep going without history */ } }
};
const nameInput = $('#name');
nameInput.value = store.get('ma_name', 'Detective');
function setScreen(m) {
  mode = m;
  show($('#home'), m === 'home'); show($('#hud'), m === 'playing'); show($('#end'), m === 'ended');
  document.body.classList.toggle('playing', m === 'playing');
}
let M = null, LOC = null, chosen = null, found = new Set(), soloTimers = [], bonusOut = false;
function fireSoloEvent(kind) {
  if (mode !== 'playing') return;
  if (kind === 'bonus') {
    if (M.bonus && !bonusOut) { bonusOut = true; M.clues.push(M.bonus); return onEvent({ kind, clue: { id: M.bonus.id, type: M.bonus.type, label: M.bonus.label, x: M.bonus.x, z: M.bonus.z } }); }
    return onEvent({ kind: 'bell' });
  }
  onEvent({ kind });
}
function sendHold(i, on) { if (mode === 'playing') applyHold({ npc: i, held: on, at: roundSeconds() }); }
function sendTalk(i, q) { showNpcSays({ npc: i, q, text: M.npcs[i].lines[q], by: 'you', byId: myId }); }
const myCases = () => store.get('ma_custom', []);
function pickCase() {
  const seen = new Set(store.get('ma_seen', []));
  if (seen.size >= MAGEN.TOTAL - 20) seen.clear();
  const own = myCases().filter(c => !seen.has(c.id));          // about 1 round in 3 is one of your own mysteries
  if (own.length && Math.random() < 0.34) { const c = own[Math.floor(Math.random() * own.length)]; seen.add(c.id); store.set('ma_seen', [...seen]); return window.MACUSTOM.toMystery(c, MAPS); }
  const recent = store.get('ma_recent', []);
  const m = MAGEN.pickFresh({ locs: MAPS, recent: recent.slice(-16), banned: seen });
  seen.add(m.id); recent.push(m.meta);
  store.set('ma_seen', [...seen]); store.set('ma_recent', recent.slice(-30));
  return m;
}
function startSolo() {
  const name = nameInput.value.trim() || 'Detective';
  store.set('ma_name', name);
  M = pickCase(); LOC = MAPS.find(l => l.id === M.locId);
  clearWorldState(); loadMap(LOC.id); docs.clear(); found = new Set(); chosen = null;
  myId = 'me'; room = { players: [{ id: 'me' }], hostId: 'me' };
  round = { endsAt: Date.now() + 10 * 60 * 1000, mystery: M, votes: {} };
  local = { x: 0, z: 14, ry: Math.PI, y: 0 };
  addAvatar({ id: 'me', name, skin: '#e63946', skinIndex: 0, x: local.x, z: local.z, ry: local.ry });
  camYaw = 0; camera.position.set(local.x, 6, local.z + 8);
  applyRoundWorld({ weather: MAGEN.pickWeather(LOC.id), npcs: M.npcs.map(n => ({ name: n.name, role: n.role })), seed: String(M.id) });
  bonusOut = false; soloTimers.forEach(clearTimeout); soloTimers = MAGEN.EVENT_PLAN.map(ev => setTimeout(() => fireSoloEvent(ev.kind), ev.at * 1000));
  for (const c of M.clues) addClueMarker(c);
  $('#caseLoc').textContent = LOC.name; $('#caseIntro').textContent = LOC.intro + ' ' + M.briefing; $('#caseTitle').textContent = M.title;
  $('#evidence').innerHTML = ''; $('#voteQ').textContent = M.question;
  renderVotes(); setScreen('playing');
  toast('Search the grounds. Press E at the little tables to pick up letters, photos and tickets.');
}
function trySearch() {
  if (mode !== 'playing' || viewing) return;
  let best = null, bd = 4.5;
  for (const c of M.clues) { if (found.has(c.id)) continue; const d = Math.hypot(c.x - local.x, c.z - local.z); if (d <= bd) { best = c; bd = d; } }
  if (!best) return toast('Nothing to find here.');
  found.add(best.id);
  removeClueMarker(best.id);
  const cv = makeDoc(best); docs.set(best.id, { c: best, cv });
  const li = document.createElement('li');
  const th = document.createElement('canvas'); th.width = 150; th.height = Math.round(cv.height * 150 / cv.width); th.getContext('2d').drawImage(cv, 0, 0, th.width, th.height); th.className = 'thumb';
  const b = document.createElement('b'); b.textContent = best.label + ': ' + (KIND[best.type] || 'evidence');
  const by = document.createElement('div'); by.className = 'by'; by.textContent = 'click to read again';
  li.append(th, b, by); li.onclick = () => openDoc(best.id); $('#evidence').append(li);
  openDoc(best.id);
}
function renderVotes() {
  const box = $('#voteOpts'); box.innerHTML = '';
  M.options.forEach((opt, i) => { const b = document.createElement('button'); b.textContent = opt; if (chosen === i) b.classList.add('mine'); b.onclick = () => { chosen = i; renderVotes(); }; box.append(b); });
  $('#voteStatus').textContent = chosen === null ? 'Pick a suspect, then submit your answer.' : 'Ready to submit.';
}
function finishSolo(pick, reason) {
  if (mode !== 'playing') return;
  soloTimers.forEach(clearTimeout); closeTalk();
  setScreen('ended'); show($('#endCredit'), !!M.custom); $('#endCredit').textContent = M.custom ? 'Your own mystery: ' + M.title : '';
  const win = pick === M.answer, t = $('#endTitle');
  t.textContent = win ? 'Case solved!' : (reason === 'time' ? 'Time ran out' : 'Wrong answer'); t.className = win ? 'win' : 'lose';
  $('#endAnswer').textContent = 'The answer: ' + M.options[M.answer]; $('#endExplain').textContent = M.explanation;
  const ul = $('#endClues'); ul.innerHTML = '';
  for (const c of M.clues) { const li = document.createElement('li'); li.textContent = c.label + ' (' + (KIND[c.type] || c.type) + '): ' + c.body.replace(/\\n/g, ' / ') + (c.sign ? ' ' + c.sign : ''); ul.append(li); }
  show($('#prompt'), false);
}
setInterval(() => { if (mode === 'playing' && round && Date.now() >= round.endsAt) finishSolo(chosen, 'time'); }, 500);
$('#playBtn').onclick = startSolo;
$('#createMysteryBtn').onclick = () => openCreator({ solo: true,
  save: async (c) => { const v = window.MACUSTOM.validate(c, MAPS); if (!v.ok) return { ok: false, errors: v.errors }; const list = myCases(); list.push({ ...v.clean, id: 'u' + Math.random().toString(36).slice(2, 9), author: 'you' }); store.set('ma_custom', list.slice(-100)); return { ok: true }; },
  mine: async () => myCases().map(c => ({ id: c.id, title: c.title, locId: c.locId })),
  remove: async (id) => { store.set('ma_custom', myCases().filter(c => c.id !== id)); } });
$('#submitBtn').onclick = () => { if (chosen === null) return toast('Pick an answer first.'); finishSolo(chosen, 'submitted'); };
$('#againBtn').onclick = startSolo;
setScreen('home');
LOAD.set(90, 'Warming up the lanterns…'); composer.render(); await tick();
try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts are optional */ }
LOAD.done();
`;

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mystery Atlas (Solo)</title>
<meta name="theme-color" content="#0a0a14">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${Buffer.from(rd('public/favicon.svg')).toString('base64')}">
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Special+Elite&family=Caveat:wght@500;700&display=swap" rel="stylesheet">
<style>
${rd('public/style.css')}
</style>
${importmap}
</head>
<body>
${body}
<script>
${rd('public/maps.js')}
</script>
<script>
${rd('custom.js')}
</script>
<script>
${rd('public/npc.js')}
</script>
<script>
${rd('generator.js')}
</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const MAPS = window.MAPS, MAGEN = window.MAGEN;
${evidence}
${creator}
${core}
${flow}
</script>
</body>
</html>
`;
fs.writeFileSync('mystery-atlas-solo.html', out);
console.log('solo built', (out.length / 1024).toFixed(0) + ' KB');
