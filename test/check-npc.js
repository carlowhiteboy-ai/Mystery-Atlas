// Suspects must only ever walk on free ground (never through walls, trees or water) on every map.
const MAPS = require('../public/maps.js'), NPC = require('../public/npc.js'), C = MAPS.collision;
let bad = 0;
for (const def of MAPS) {
  const lay = MAPS.layout(def), t0 = Date.now(), routes = NPC.build(MAPS, def, 1234, 4);
  let worst = 0, jumps = 0, samples = 0, prev = routes.map(r => NPC.posAt(r, 0));
  if (routes.some(r => !r.legs.length)) { bad++; console.log('  FAIL', def.name, 'a suspect has no route'); continue; }
  for (let t = 0.5; t < 600; t += 0.5) routes.forEach((r, i) => {
    const p = NPC.posAt(r, t); samples++;
    const [px, pz] = C.pushOut(lay, p.x, p.z, 0.45); worst = Math.max(worst, Math.hypot(px - p.x, pz - p.z));
    if (C.overWater(lay, p.x, p.z)) worst = 9;
    if (Math.hypot(p.x - prev[i].x, p.z - prev[i].z) > 2) jumps++; prev[i] = p;
  });
  const okRow = worst < 0.15 && jumps === 0;
  console.log(`${def.name.padEnd(24)} 4 routes in ${Date.now() - t0}ms, deepest overlap ${worst.toFixed(2)}, teleports ${jumps}`);
  if (!okRow) { bad++; console.log('  FAIL ' + def.name); }
}
console.log(bad ? bad + ' map(s) with bad suspect routes' : 'All suspect routes are walkable'); process.exit(bad ? 1 : 0);
