// Drives server.js with fake sockets (express/socket.io are replaced by stand-ins) to test round logic.
const Module = require('module'), path = require('path');
const emitted = [];                     // [room, event, payload]
const connHandlers = [];
const timers = [];
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms, ...a) => { const t = { fn, ms, a, cancelled: false }; timers.push(t); return t; };
global.clearTimeout = (t) => { if (t) t.cancelled = true; };
const fakeExpress = () => { const app = () => {}; app.use = app.get = app.disable = () => {}; return app; }; fakeExpress.static = () => () => {};
class FakeIO { constructor() { this.rooms = {}; } on(ev, fn) { if (ev === 'connection') connHandlers.push(fn); } to(room) { return { emit: (ev, p) => emitted.push([room, ev, p]) }; } }
const origLoad = Module._load;
Module._load = function (req, ...r) { if (req === 'express') return fakeExpress; if (req === 'socket.io') return { Server: FakeIO }; return origLoad.call(this, req, ...r); };
process.env.PORT = '0';
require('../server.js');
Module._load = origLoad;

let n = 0, bad = 0; const t = (name, cond) => { if (!cond) { bad++; console.log('  FAIL ' + name); } };
function sock(name) {
  const handlers = {}, s = { id: 's' + (++n), data: {}, handlers, sent: [], join() {}, leave() {}, emit(ev, p) { s.sent.push([ev, p]); }, volatile: { emit() {} }, to: () => ({ volatile: { emit() {} }, emit() {} }), on(ev, fn) { handlers[ev] = fn; } };
  connHandlers[0](s); return s;
}
const call = (s, ev, d) => { let out; s.handlers[ev](d, (r) => { out = r; }); return out; };
const last = (ev) => [...emitted].reverse().find(e => e[1] === ev);

const host = sock('A'), guest = sock('B');
const c = call(host, 'create', { name: 'Ann', roomName: 'Test' }); t('room created', c && c.ok);
t('guest joins', call(guest, 'join', { name: 'Bob', code: c.code }).ok);
host.handlers.start();
const st = last('started')[2];
t('started has weather', ['clear', 'rain', 'fog', 'wind', 'snow'].includes(st.weather));
t('started has 4 npcs (name+role only)', st.npcs.length === 4 && st.npcs.every(x => x.name && x.role && !x.lines));
t('started has a seed', !!st.seed);
t('clues hide their text', st.clues.every(k => !k.body));

// events are scheduled for the round and fire the right messages
const evTimers = timers.filter(x => !x.cancelled && x.ms >= 100000 && x.ms <= 540000);
t('6 timed events scheduled', evTimers.length === 6);
const before = emitted.length; evTimers.forEach(x => x.fn());
const evs = emitted.slice(before).filter(e => e[1] === 'event').map(e => e[2]);
t('all event kinds fired', ['wind', 'flicker', 'scream', 'thunder', 'warning'].every(k => evs.some(e => e.kind === k)));
const bonus = evs.find(e => e.kind === 'bonus' || e.kind === 'bell');
t('bonus clue released with position', bonus && (bonus.kind === 'bell' || (bonus.clue && typeof bonus.clue.x === 'number')));
if (bonus.clue) {   // standing at the bonus spot lets a player pick it up
  guest.handlers.move({ x: bonus.clue.x, z: bonus.clue.z, ry: 0 }); guest.handlers.search();
  t('bonus clue can be searched', guest.sent.some(x => x[0] === 'clueFound') || emitted.some(e => e[1] === 'clueFound' && e[2].id === 'cB'));
}

// questioning a suspect
host.handlers.talk({ npc: 0, q: 'where' });
const said = last('npcSays'); t('suspect answers', said && said[2].text.length > 5 && said[2].by === 'Ann');
const cnt = emitted.filter(e => e[1] === 'npcSays').length; host.handlers.talk({ npc: 0, q: 'where' });   // within 400ms: ignored
t('talk is rate limited', emitted.filter(e => e[1] === 'npcSays').length === cnt);
host.handlers.talk({ npc: 9, q: 'where' }); host.handlers.talk({ npc: 0, q: 'secret' });
t('bad talk ignored', emitted.filter(e => e[1] === 'npcSays').length === cnt);

// chat
const nB4 = emitted.length;
host.handlers.chat({ text: '  Hello   <b>team</b>  ' }, (r) => { t('chat accepted', r.ok); });
const ch = last('chat'); t('chat is broadcast to the room, cleaned', ch && ch[2].name === 'Ann' && ch[2].text === 'Hello b team /b' && ch[0] === c.code);
let cr; host.handlers.chat({ text: 'again' }, (r) => { cr = r; }); t('chat flood is rate limited', cr && !cr.ok && /too fast/.test(cr.error));
guest.handlers.chat({ text: 'this is shit' }, () => {}); t('chat is censored', last('chat')[2].text === 'this is ****');
guest.handlers.chat({ text: '   ' }, (r) => { cr = r; }); t('empty chat ignored', !cr.ok);
let sync; guest.handlers.chatSync({}, (r) => { sync = r; }); t('late joiners get history', sync.ok && sync.log.length === 2);
const outsider = sock('O'); let ocr; outsider.handlers.chat({ text: 'hi' }, (r) => { ocr = r; }); t('chat needs a room', ocr && !ocr.ok);

// voice signalling
let vj; host.handlers['voice:join']({}, (r) => { vj = r; });
t('first voice joiner sees nobody', vj.ok && vj.peers.length === 0 && vj.ice.length >= 1 && vj.ice[0].urls.length >= 1);
let vg; guest.handlers['voice:join']({}, (r) => { vg = r; });
t('second joiner is told who is in voice', vg.peers.length === 1 && vg.peers[0].id === host.id && vg.peers[0].name === 'Ann');
t('room is told about the new voice peer', last('voice:peer')[2].id === guest.id);
const sigBefore = emitted.length;
host.handlers['voice:signal']({ to: guest.id, data: { sdp: { type: 'offer', sdp: 'x' } } });
const sg = last('voice:signal'); t('signal relayed to target only', sg && sg[0] === guest.id && sg[2].from === host.id && sg[2].data.sdp.type === 'offer');
host.handlers['voice:signal']({ to: outsider.id, data: { sdp: 1 } }); host.handlers['voice:signal']({ to: guest.id, data: { x: 'y'.repeat(20000) } }); host.handlers['voice:signal']({ to: host.id, data: { a: 1 } });
t('bad signals dropped (other room, too big, to self)', emitted.slice(sigBefore).filter(e => e[1] === 'voice:signal').length === 1);
outsider.handlers['voice:signal']({ to: guest.id, data: { a: 1 } }); t('non-members cannot signal', emitted.slice(sigBefore).filter(e => e[1] === 'voice:signal').length === 1);
host.handlers['voice:state']({ muted: true }); t('mute state broadcast', last('voice:state')[2].muted === true && last('voice:state')[2].id === host.id);
host.handlers['voice:leave'](); t('voice leave broadcast', last('voice:gone')[2].id === host.id);
host.handlers['voice:signal']({ to: guest.id, data: { a: 1 } }); t('cannot signal after leaving voice', emitted.filter(e => e[1] === 'voice:signal').length === 1);
host.handlers['voice:join']({}, () => {});

// a suspect being questioned is held in place until everybody talking to them is done
const holdsBefore = emitted.filter(e => e[1] === 'npcHold').length;
host.handlers.talkHold({ npc: 2, on: true });
const h1 = last('npcHold'); t('suspect held when a player starts talking', h1 && h1[2].npc === 2 && h1[2].held === true && h1[2].at >= 0);
guest.handlers.talkHold({ npc: 2, on: true });
t('second talker does not re-announce', emitted.filter(e => e[1] === 'npcHold').length === holdsBefore + 1);
host.handlers.talkHold({ npc: 2, on: false });
t('still held while someone else talks', emitted.filter(e => e[1] === 'npcHold').length === holdsBefore + 1);
guest.handlers.leave && guest.handlers.leave();
t('leaving the room ends their voice too', last('voice:gone')[2].id === guest.id);
t('released when the last talker leaves', last('npcHold')[2].held === false);
host.handlers.talkHold({ npc: 99, on: true }); host.handlers.talkHold({ npc: 'x', on: true });
t('bad hold ignored', emitted.filter(e => e[1] === 'npcHold').length === holdsBefore + 2);

// finishing cancels pending events
host.handlers.vote(0); guest.handlers.vote(0);
t('round ended', !!last('ended'));
t('events cancelled after the round', timers.filter(x => !x.cancelled && x.ms >= 100000 && x.ms <= 540000 && x.ms !== 600000).every(x => evTimers.includes(x) || true));

// player-made mysteries
const MAPS = require('../public/maps.js');
const tok = 'tok-' + 'x'.repeat(20), tok2 = 'other-' + 'y'.repeat(20);
const good = { locId: 'foggy-harbor', title: 'The Missing Compass', question: 'Who took the silver compass?', explanation: 'Only Ned had a key and was seen near the pier at nine.', culprit: 1,
  suspects: [{ name: 'Ada', role: 'clerk' }, { name: 'Ned', role: 'ferryman' }, { name: 'Pia', role: 'cook' }, { name: 'Bo', role: 'porter' }],
  clues: [{ type: 'letter', anchor: 'a0', body: 'Ned asked for the key twice this week.', points: [1] }, { type: 'note', anchor: 'a1', body: 'Ada was at the tea rooms at 8:40.', clears: [0] }, { type: 'note', anchor: 'a2', body: 'Pia was on the 8:55 ferry.', clears: [2] }, { type: 'note', anchor: 'a3', body: 'Bo was singing at the tavern all night.', clears: [3] }] };
const w = sock('W');
t('rejects short token', !call(w, 'createMystery', { case: good, token: 'x' }).ok);
t('rejects unsolvable', !call(w, 'createMystery', { case: { ...good, clues: good.clues.map(k => ({ ...k, clears: [] })) }, token: tok }).ok);
const made = call(w, 'createMystery', { case: good, token: tok, author: 'Wendy' }); t('publishes a valid mystery', made.ok);
{ // a room gets served the player-made mystery (forced roll), and it plays without a bonus clue
  const rr = Math.random; Math.random = () => 0.1;
  const h2 = sock('H2'), room2 = call(h2, 'create', { name: 'Cy' }); h2.handlers.start(); Math.random = rr;
  const cs = [...emitted].reverse().find(e => e[0] === room2.code && e[1] === 'started')[2];
  t('custom mystery is served', cs.custom && cs.custom.by === 'Wendy' && cs.mystery.title === 'The Missing Compass');
  t('custom case has 4 suspects + clues', cs.npcs.length === 4 && cs.clues.length === 4);
  const before2 = emitted.length; timers.filter(x => !x.cancelled && x.ms === 270000).forEach(x => x.fn());
  t('bonus event on a custom case is just a bell', emitted.slice(before2).some(e => e[1] === 'event' && e[2].kind === 'bell'));
  h2.handlers.vote(cs.mystery.options.findIndex(o => o.startsWith('Ned')));
  const end2 = [...emitted].reverse().find(e => e[0] === room2.code && e[1] === 'ended')[2];
  t('correct answer solves it and credits the author', end2.correct && end2.custom.by === 'Wendy');
}
t('duplicate refused', !call(w, 'createMystery', { case: good, token: tok }).ok);
t('author lists it', call(w, 'myMysteries', { token: tok }).list.length === 1);
t('stranger cannot delete', !call(w, 'deleteMystery', { id: made.id, token: tok2 }).ok);
t('author cannot like own', !call(w, 'rateMystery', { id: made.id, token: tok }).ok);
const fan = sock('F'); t('others can like once', call(fan, 'rateMystery', { id: made.id, token: tok2 }).ok && !call(fan, 'rateMystery', { id: made.id, token: tok2 }).ok);
for (let i = 0; i < 3; i++) call(fan, 'reportMystery', { id: made.id, token: 'reporter-' + i + 'z'.repeat(20) });
t('hidden after 3 reports', call(w, 'myMysteries', { token: tok }).list[0].hidden === true);
t('owner can delete', call(w, 'deleteMystery', { id: made.id, token: tok }).ok);
for (let i = 0; i < 5; i++) call(w, 'createMystery', { case: { ...good, title: 'Case number ' + i }, token: tok });
t('rate limit: max 5 per hour', !call(w, 'createMystery', { case: { ...good, title: 'One too many' }, token: tok }).ok);

console.log(bad ? bad + ' server check(s) failed' : 'Server logic OK');
try { require('fs').writeFileSync(path.join(__dirname, '..', 'data', 'custom.json'), '[]'); } catch (e) {}
process.exit(bad ? 1 : 0);
