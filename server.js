const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const MAPS = require('./public/maps.js');
const GEN = require('./generator.js');
const CUSTOM = require('./custom.js');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 1e5 });

app.disable('x-powered-by');
// custom.js is shared with the server (validation), so it lives in the project root: serve it to the browser too
app.get('/custom.js', (req, res) => res.sendFile(path.join(__dirname, 'custom.js')));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');   // set DATA_DIR to a persistent disk path on hosts that offer one
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* read-only: data stays in memory */ }
app.get('/healthz', (req, res) => res.type('text').send('ok'));   // for the host's health check and an uptime pinger
app.use(express.static(path.join(__dirname, 'public')));
const THREE_DIR = path.join(__dirname, 'node_modules/three');
if (!fs.existsSync(THREE_DIR)) console.error('WARNING: node_modules/three is missing. Run "npm install" or the 3D scene will not load.');
app.use('/three', express.static(THREE_DIR));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
app.use((req, res) => res.status(404).type('text').send('Not found'));
app.use((err, req, res, next) => { console.error(err); res.status(500).type('text').send('Server error'); });
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

const ROUND_MS = 10 * 60 * 1000;
const MAX_PLAYERS = 12;
const REACH = 4.5;
const BOUND = 58;
const SKINS = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#4cc9f0', '#7b2cbf',
  '#f72585', '#80ed99', '#ffffff', '#adb5bd', '#fb8500', '#90be6d'];

const rooms = new Map();

/* ---------- mystery picker: never repeat for a room, nor for the same detectives ---------- */
const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
let seenByName = {};
try { seenByName = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')); } catch (e) { seenByName = {}; }
// the most recent cases played on this server (all rooms), used to avoid similar cases back to back
const RECENT_FILE = path.join(DATA_DIR, 'recent.json');
let recentCases = [];
try { recentCases = JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8')).slice(-40); } catch (e) { recentCases = []; }
let saveTimer = null;
function saveSeen() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(SEEN_FILE, JSON.stringify(seenByName)); fs.writeFileSync(RECENT_FILE, JSON.stringify(recentCases)); } catch (e) { /* read-only disk: keep in memory */ }
  }, 1500);
}
const seenOf = (name) => (seenByName[name.toLowerCase()] = seenByName[name.toLowerCase()] || []);

function pickMystery(r) {
  const names = [...r.players.values()].map(p => p.name);
  // ids this room already played, or any detective in it has played before, are off the table
  const banned = new Set(r.usedIds);
  for (const n of names) for (const id of seenOf(n)) banned.add(id);
  if (banned.size >= GEN.TOTAL - 20) { banned.clear(); for (const id of r.usedIds) banned.add(id); }
  // similarity memory: what the whole server played lately, then this room's own rounds (weighted extra)
  // about 1 round in 3 is a player-made mystery the room has not played (liked ones come up more often)
  let pool = customs.filter(c => !c.hidden && !banned.has(c.id));
  const otherMap = pool.filter(c => c.locId !== r.lastLoc); if (otherMap.length) pool = otherMap;
  if (pool.length && Math.random() < 0.34) {
    let roll = Math.random() * pool.reduce((a, c) => a + 1 + Math.max(0, c.likes - c.reports), 0), pick = pool[0];
    for (const c of pool) { roll -= 1 + Math.max(0, c.likes - c.reports); if (roll <= 0) { pick = c; break; } }
    pick.plays++; saveCustom();
    return CUSTOM.toMystery(pick, MAPS);
  }
  const recent = recentCases.slice(-16).concat(r.history.slice(-8).map(m => ({ ...m, boost: 1.5 })));
  return GEN.pickFresh({ locs: MAPS, recent, banned });
}

/* ---------- player-made mysteries ---------- */
const CUSTOM_FILE = path.join(DATA_DIR, 'custom.json');
const MAX_CUSTOM = 500, MAKE_PER_HOUR = 5, HIDE_AT_REPORTS = 3;
let customs = [];
try { customs = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8')); } catch (e) { customs = []; }
let customTimer = null;
function saveCustom() {
  clearTimeout(customTimer);
  customTimer = setTimeout(() => { try { fs.writeFileSync(CUSTOM_FILE, JSON.stringify(customs)); } catch (e) { /* read-only disk: kept in memory only */ } }, 1000);
}
const hashTok = (t) => crypto.createHash('sha256').update(String(t || '')).digest('hex').slice(0, 32);
const goodToken = (t) => typeof t === 'string' && t.length >= 16 && t.length <= 64;
const publicCustom = (c) => ({ id: c.id, title: c.title, locId: c.locId, likes: c.likes, plays: c.plays, reports: c.reports, hidden: c.hidden });

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const noop = () => {};

function newCode() {
  let c;
  do { c = Math.random().toString(36).slice(2, 8).toUpperCase(); } while (rooms.has(c));
  return c;
}

function lobbyView(r) {
  return {
    code: r.code, name: r.name, isPrivate: r.isPrivate, hostId: r.hostId, state: r.state,
    max: MAX_PLAYERS,
    players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, skin: p.skin, skinIndex: p.skinIndex }))
  };
}

function publicRooms() {
  return [...rooms.values()]
    .filter(r => !r.isPrivate && r.state === 'lobby')
    .map(r => ({ code: r.code, name: r.name, count: r.players.size, max: MAX_PLAYERS }));
}

function broadcastList() { io.to('browser').emit('rooms', publicRooms()); }
function sendLobby(r) { io.to(r.code).emit('lobby', lobbyView(r)); broadcastList(); }

function freeSkin(r) {
  const used = new Set([...r.players.values()].map(p => p.skinIndex));
  for (let i = 0; i < SKINS.length; i++) if (!used.has(i)) return i;
  return 0;
}

function addPlayer(socket, r, name) {
  const skinIndex = freeSkin(r);
  r.players.set(socket.id, { id: socket.id, name, skinIndex, skin: SKINS[skinIndex], x: 0, z: 14, ry: 0, vote: undefined });
  socket.join(r.code);
  socket.leave('browser');
  socket.data.room = r.code;
}

function votesView(r) {
  const v = {};
  for (const p of r.players.values()) if (p.vote !== undefined) v[p.id] = p.vote;
  return v;
}

function checkVotes(r) {
  if (r.state !== 'playing' || r.players.size === 0) return;
  const ps = [...r.players.values()];
  if (ps.every(p => p.vote !== undefined && p.vote === ps[0].vote)) finish(r, 'submitted', ps[0].vote);
}

function clearEvents(r) { (r.eventTimers || []).forEach(clearTimeout); r.eventTimers = []; }
function fireEvent(r, kind) {
  if (r.state !== 'playing' || !r.round) return;
  const m = r.round.m;
  if (kind === 'bonus') {
    if (m.bonus && !r.round.bonusOut) {      // a spare clue turns up somewhere on the map
      r.round.bonusOut = true; m.clues.push(m.bonus);
      return io.to(r.code).emit('event', { kind: 'bonus', clue: { id: m.bonus.id, type: m.bonus.type, label: m.bonus.label, x: m.bonus.x, z: m.bonus.z } });
    }
    return io.to(r.code).emit('event', { kind: 'bell' });
  }
  io.to(r.code).emit('event', { kind });
}

function startGame(r) {
  const m = pickMystery(r);
  const loc = MAPS.find(l => l.id === m.locId);
  r.usedIds.add(m.id); r.history.push(m.meta); r.lastLoc = m.locId;
  recentCases.push(m.meta); if (recentCases.length > 40) recentCases.shift();
  for (const p of r.players.values()) { const a = seenOf(p.name); a.push(m.id); if (a.length > GEN.TOTAL - 50) a.splice(0, a.length - (GEN.TOTAL - 50)); }
  saveSeen();
  r.round = { loc, m, found: new Set(), bonusOut: false, startedAt: Date.now(), holds: {} };
  const weather = GEN.pickWeather(loc.id);
  r.state = 'playing';
  const n = r.players.size;
  let i = 0;
  for (const p of r.players.values()) {
    const a = (i++ / n) * Math.PI * 2;
    p.x = Math.cos(a) * 2.5; p.z = 14 + Math.sin(a) * 2.5; p.ry = Math.PI; p.vote = undefined;
  }
  io.to(r.code).emit('started', {
    location: { id: loc.id, name: loc.name, intro: loc.intro },
    mystery: { id: m.id, title: m.title, question: m.question, options: m.options, briefing: m.briefing },
    clues: m.clues.map(c => ({ id: c.id, type: c.type, label: c.label, x: c.x, z: c.z })),
    remaining: ROUND_MS, weather, seed: String(m.id),
    npcs: m.npcs.map(n => ({ name: n.name, role: n.role })),
    custom: m.custom ? { id: m.id, by: m.by } : null,
    players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, skin: p.skin, skinIndex: p.skinIndex, x: p.x, z: p.z, ry: p.ry }))
  });
  r.timer = setTimeout(() => finish(r, 'time', null), ROUND_MS);
  clearEvents(r); r.eventTimers = GEN.EVENT_PLAN.map(ev => setTimeout(() => fireEvent(r, ev.kind), ev.at * 1000));
  broadcastList();
}

function finish(r, reason, chosen) {
  if (r.state !== 'playing') return;
  clearTimeout(r.timer); clearEvents(r);
  r.state = 'ended';
  const m = r.round.m;
  io.to(r.code).emit('ended', {
    reason, chosen, correct: chosen === m.answer, answer: m.answer, explanation: m.explanation,
    custom: m.custom ? { id: m.id, by: m.by } : null,
    allClues: m.clues.map(c => ({ id: c.id, type: c.type, label: c.label, heading: c.heading, body: c.body, sign: c.sign }))
  });
}

// suspects being questioned stand still. holds[npc] = ids of the players currently talking to them
function setHold(r, npc, id, on) {
  if (!r.round) return;
  const holds = r.round.holds || (r.round.holds = {}), set = holds[npc] || (holds[npc] = new Set()), before = set.size > 0;
  if (on) set.add(id); else set.delete(id);
  if (before !== set.size > 0) io.to(r.code).emit('npcHold', { npc, held: set.size > 0, at: (Date.now() - r.round.startedAt) / 1000 });
}
function releaseHolds(r, id) { if (r.round && r.round.holds) for (const i of Object.keys(r.round.holds)) if (r.round.holds[i].has(id)) setHold(r, Number(i), id, false); }

// ICE servers for voice. Public STUN works for most home networks; behind strict NATs a TURN relay is needed:
//   TURN_URL="turn:turn.example.com:3478" TURN_USER=name TURN_PASS=secret npm start
function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) list.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
  return list;
}
const CHAT_MAX = 200, CHAT_KEEP = 40;

function leave(socket) {
  const code = socket.data.room;
  const r = rooms.get(code);
  if (!r) return;
  releaseHolds(r, socket.id);
  const gone = r.players.get(socket.id); if (gone && gone.voice) io.to(code).emit('voice:gone', { id: socket.id });
  r.players.delete(socket.id);
  socket.leave(code);
  socket.data.room = null;
  if (r.players.size === 0) {
    clearTimeout(r.timer); clearEvents(r);
    rooms.delete(code);
  } else {
    if (r.hostId === socket.id) r.hostId = r.players.keys().next().value;
    io.to(code).emit('left', socket.id);
    sendLobby(r);
    if (r.state === 'playing') { io.to(code).emit('votes', votesView(r)); checkVotes(r); }
  }
  broadcastList();
}

io.on('connection', (socket) => {
  // any handler that throws is logged and ignored instead of taking the server down
  const _on = socket.on.bind(socket);
  socket.on = (ev, fn) => _on(ev, (...args) => { try { return fn(...args); } catch (e) { console.error('handler error in', ev, e); const cb = args[args.length - 1]; if (typeof cb === 'function') cb({ ok: false, error: 'Something went wrong on the server. Please try again.' }); } });
  socket.on('browse', () => { socket.join('browser'); socket.emit('rooms', publicRooms()); });

  socket.on('create', (opts, cb = noop) => {
    if (socket.data.room) leave(socket);
    const name = clean(opts && opts.name, 16);
    if (!name) return cb({ ok: false, error: 'Enter a name first.' });
    const code = newCode();
    const r = {
      code, name: clean(opts.roomName, 28) || `${name}'s case`, isPrivate: !!opts.isPrivate,
      hostId: socket.id, state: 'lobby', players: new Map(), round: null, timer: null,
      usedIds: new Set(), history: [], lastLoc: null
    };
    rooms.set(code, r);
    addPlayer(socket, r, name);
    cb({ ok: true, id: socket.id, code });
    sendLobby(r);
  });

  socket.on('join', (opts, cb = noop) => {
    if (socket.data.room) leave(socket);
    const name = clean(opts && opts.name, 16);
    const r = rooms.get(clean(opts && opts.code, 8).toUpperCase());
    if (!name) return cb({ ok: false, error: 'Enter a name first.' });
    if (!r) return cb({ ok: false, error: 'Server not found.' });
    if (r.state !== 'lobby') return cb({ ok: false, error: 'That case is already in progress.' });
    if (r.players.size >= MAX_PLAYERS) return cb({ ok: false, error: 'Server is full.' });
    addPlayer(socket, r, name);
    cb({ ok: true, id: socket.id, code: r.code });
    sendLobby(r);
  });

  socket.on('leave', () => leave(socket));

  socket.on('start', () => {
    const r = rooms.get(socket.data.room);
    if (r && r.hostId === socket.id && r.state === 'lobby') startGame(r);
  });

  socket.on('backToLobby', () => {
    const r = rooms.get(socket.data.room);
    if (r && r.hostId === socket.id && r.state === 'ended') {
      r.state = 'lobby'; r.round = null;
      for (const p of r.players.values()) p.vote = undefined;
      sendLobby(r);
    }
  });

  socket.on('move', (d) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.state !== 'playing' || !d) return;
    const p = r.players.get(socket.id);
    const x = Number(d.x), z = Number(d.z), ry = Number(d.ry);
    if (!p || !isFinite(x) || !isFinite(z)) return;
    p.x = Math.max(-BOUND, Math.min(BOUND, x));
    p.z = Math.max(-BOUND, Math.min(BOUND, z));
    p.ry = isFinite(ry) ? ry : 0;
    socket.to(r.code).volatile.emit('moved', { id: p.id, x: p.x, z: p.z, ry: p.ry });
  });

  socket.on('search', () => {
    const r = rooms.get(socket.data.room);
    if (!r || r.state !== 'playing') return;
    const p = r.players.get(socket.id);
    let best = null, bd = REACH;
    for (const c of r.round.m.clues) {
      if (r.round.found.has(c.id)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d <= bd) { best = c; bd = d; }
    }
    if (!best) return socket.emit('nothing');
    r.round.found.add(best.id);
    io.to(r.code).emit('clueFound', { id: best.id, type: best.type, label: best.label, heading: best.heading, body: best.body, sign: best.sign, by: p.name, byId: p.id });
  });

  socket.on('vote', (idx) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.state !== 'playing') return;
    const p = r.players.get(socket.id);
    idx = Number(idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= r.round.m.options.length) return;
    p.vote = idx;
    io.to(r.code).emit('votes', votesView(r));
    checkVotes(r);
  });

  // questioning a suspect: the answer is shown to the whole room (it goes on everyone's evidence board)
  socket.on('talk', (d) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.state !== 'playing' || !d) return;
    const now = Date.now(); if (now - (socket.data.lastTalk || 0) < 400) return; socket.data.lastTalk = now;
    const p = r.players.get(socket.id), i = Number(d.npc), n = r.round.m.npcs[i];
    if (!p || !n || !['where', 'saw', 'suspect'].includes(d.q)) return;
    io.to(r.code).emit('npcSays', { npc: i, q: d.q, text: n.lines[d.q], by: p.name, byId: p.id });
  });

  /* ---------- chat ---------- */
  socket.on('chat', (d, cb = noop) => {
    const r = rooms.get(socket.data.room), p = r && r.players.get(socket.id);
    if (!p || !d) return cb({ ok: false });
    const now = Date.now(), log = (socket.data.chatLog = (socket.data.chatLog || []).filter(t => now - t < 10000));
    if (log.length >= 6 || now - (socket.data.lastChat || 0) < 500) return cb({ ok: false, error: 'You are typing too fast. Slow down a little.' });
    const text = CUSTOM.censor(String(d.text == null ? '' : d.text).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX));
    if (!text) return cb({ ok: false });
    socket.data.lastChat = now; log.push(now);
    const msg = { id: p.id, name: p.name, text, t: now };
    (r.chat = r.chat || []).push(msg); if (r.chat.length > CHAT_KEEP) r.chat.shift();
    io.to(r.code).emit('chat', msg);
    cb({ ok: true });
  });
  socket.on('chatSync', (d, cb = noop) => { const r = rooms.get(socket.data.room); cb({ ok: !!r, log: r ? (r.chat || []) : [] }); });

  /* ---------- voice: the server only relays WebRTC set-up messages, the audio itself goes player to player ---------- */
  socket.on('voice:join', (d, cb = noop) => {
    const r = rooms.get(socket.data.room), p = r && r.players.get(socket.id);
    if (!p) return cb({ ok: false });
    p.voice = true; p.muted = false;
    const peers = [...r.players.values()].filter(x => x.voice && x.id !== p.id).map(x => ({ id: x.id, name: x.name, muted: !!x.muted }));
    io.to(r.code).emit('voice:peer', { id: p.id, name: p.name });
    cb({ ok: true, peers, ice: iceServers() });
  });
  socket.on('voice:leave', () => {
    const r = rooms.get(socket.data.room), p = r && r.players.get(socket.id);
    if (p && p.voice) { p.voice = false; io.to(r.code).emit('voice:gone', { id: p.id }); }
  });
  socket.on('voice:state', (d) => {
    const r = rooms.get(socket.data.room), p = r && r.players.get(socket.id);
    if (p && p.voice && d) { p.muted = !!d.muted; io.to(r.code).emit('voice:state', { id: p.id, muted: p.muted }); }
  });
  socket.on('voice:signal', (d) => {
    const r = rooms.get(socket.data.room), me = r && r.players.get(socket.id);
    if (!me || !me.voice || !d || typeof d.to !== 'string') return;
    const to = r.players.get(d.to);
    if (!to || !to.voice || to.id === me.id) return;                 // only between players of the same room who are both in voice
    let size = 0; try { size = JSON.stringify(d.data).length; } catch (e) { return; }
    if (!d.data || size > 12000) return;
    io.to(to.id).emit('voice:signal', { from: me.id, data: d.data });
  });

  socket.on('talkHold', (d) => {
    const r = rooms.get(socket.data.room);
    if (!r || r.state !== 'playing' || !d || !r.players.has(socket.id)) return;
    const i = Number(d.npc); if (!Number.isInteger(i) || !r.round.m.npcs[i]) return;
    setHold(r, i, socket.id, !!d.on);
  });

  socket.on('createMystery', (d, cb = noop) => {
    d = d || {};
    if (!goodToken(d.token)) return cb({ ok: false, errors: ['Your browser could not create an author id. Reload and try again.'] });
    const now = Date.now(); socket.data.made = (socket.data.made || []).filter(t => now - t < 3600e3);
    if (socket.data.made.length >= MAKE_PER_HOUR) return cb({ ok: false, errors: ['You can publish ' + MAKE_PER_HOUR + ' mysteries per hour. Try again later.'] });
    const v = CUSTOM.validate(d.case, MAPS);
    if (!v.ok) return cb({ ok: false, errors: v.errors });
    const owner = hashTok(d.token);
    if (customs.some(c => c.owner === owner && c.title === v.clean.title && c.question === v.clean.question)) return cb({ ok: false, errors: ['You already published this mystery.'] });
    if (customs.length >= MAX_CUSTOM) { const i = customs.findIndex(c => c.hidden); customs.splice(i >= 0 ? i : 0, 1); }
    const rec = { ...v.clean, id: 'u' + crypto.randomBytes(5).toString('hex'), author: clean(d.author, 16) || 'a detective', owner, likes: 0, reports: 0, plays: 0, hidden: false, voters: [], reporters: [], createdAt: now };
    customs.push(rec); socket.data.made.push(now); saveCustom();
    cb({ ok: true, id: rec.id });
  });
  socket.on('myMysteries', (d, cb = noop) => { if (!goodToken(d && d.token)) return cb({ ok: true, list: [] }); const o = hashTok(d.token); cb({ ok: true, list: customs.filter(c => c.owner === o).map(publicCustom) }); });
  socket.on('deleteMystery', (d, cb = noop) => {
    if (!goodToken(d && d.token)) return cb({ ok: false });
    const i = customs.findIndex(c => c.id === d.id && c.owner === hashTok(d.token));
    if (i < 0) return cb({ ok: false }); customs.splice(i, 1); saveCustom(); cb({ ok: true });
  });
  const vote = (field, then) => (d, cb = noop) => {
    const c = customs.find(x => x.id === (d && d.id)); if (!c || !goodToken(d.token)) return cb({ ok: false });
    const h = hashTok(d.token); if (c.owner === h) return cb({ ok: false, error: 'You cannot do that to your own mystery.' });
    if (c[field].includes(h)) return cb({ ok: false, error: 'Already done.' });
    c[field].push(h); if (c[field].length > 1000) c[field].shift(); then(c); saveCustom(); cb({ ok: true });
  };
  socket.on('rateMystery', vote('voters', (c) => { c.likes++; }));
  socket.on('reportMystery', vote('reporters', (c) => { c.reports++; if (c.reports >= HIDE_AT_REPORTS) c.hidden = true; }));

  socket.on('disconnect', () => leave(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Mystery Atlas running at http://localhost:${PORT}`));
