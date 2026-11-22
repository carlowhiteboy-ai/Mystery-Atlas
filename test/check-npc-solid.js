// Suspects are solid: the player can't walk through one, and a suspect who patrols into an idle player pushes them aside.
const M = require('../public/maps.js'), C = M.collision, lay = M.layout(M[0]);
let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const npc = { x: 0, z: 8, r: 0.5 }; let x = 0, z = 14, minD = 99;
for (let i = 0; i < 200; i++) { [x, z] = C.moveTo(lay, x, z, x, z - 7 / 60, C.PLAYER_R, [npc]); minD = Math.min(minD, Math.hypot(x - npc.x, z - npc.z)); }
ok(minD >= 0.949, 'walking straight at a suspect stops at ' + minD.toFixed(2));
x = 0; z = 8.2; [x, z] = C.moveTo(lay, x, z, x, z, C.PLAYER_R, [npc]);
ok(Math.hypot(x - npc.x, z - npc.z) >= 0.949, 'a suspect overlapping an idle player separates them');
x = 0.1; z = 14; for (let i = 0; i < 400; i++) [x, z] = C.moveTo(lay, x, z, x, z - 7 / 60, C.PLAYER_R, [npc]);
ok(z < 8, 'you can walk around a suspect');
process.exit(bad ? 1 : 0);
