// Verifies every map is playable: the spawn is clear, and every clue anchor can be reached on foot.
// Run: npm test
const MAPS = require('../public/maps.js');
const { pushOut, overWater, PLAYER_R } = MAPS.collision;
const STEP = 0.4, B = MAPS.BOUND, REACH = 3.4; // client shows the E prompt within 3.6
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };

for (const def of MAPS) {
  const lay = MAPS.layout(def);
  const free = (x, z) => {
    if (Math.abs(x) > B || Math.abs(z) > B || overWater(lay, x, z)) return false;
    const [px, pz] = pushOut(lay, x, z, PLAYER_R);
    return Math.hypot(px - x, pz - z) < 0.02;
  };
  const N = Math.round(2 * B / STEP) + 1, idx = (i, j) => i * N + j, at = (i) => -B + i * STEP;
  const ok = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) ok[idx(i, j)] = free(at(i), at(j)) ? 1 : 0;

  // spawn ring (players start on a 2.5 radius circle around the spawn)
  let spawnBad = 0;
  for (let a = 0; a < 12; a++) { const x = MAPS.SPAWN.x + Math.cos(a / 12 * 6.283) * 2.5, z = MAPS.SPAWN.z + Math.sin(a / 12 * 6.283) * 2.5; if (!free(x, z)) spawnBad++; }

  // flood fill from the spawn
  const seen = new Uint8Array(N * N), si = Math.round((MAPS.SPAWN.x + B) / STEP), sj = Math.round((MAPS.SPAWN.z + B) / STEP);
  const q = [[si, sj]]; seen[idx(si, sj)] = 1;
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N || seen[idx(a, b)] || !ok[idx(a, b)]) continue;
      seen[idx(a, b)] = 1; q.push([a, b]);
    }
  }
  let reach = 0, total = 0; for (let k = 0; k < N * N; k++) { if (ok[k]) total++; if (seen[k]) reach++; }

  console.log(`${def.name}: ${lay.boxes.length} boxes, ${lay.circles.length} circles, ${lay.waters.length} water, ${lay.decks.length} decks, walkable area reachable ${(100 * reach / total).toFixed(1)}%`);
  if (spawnBad) fail(`${spawnBad}/12 spawn points are blocked`);
  if (reach / total < 0.9) fail('less than 90% of the walkable ground is connected to the spawn');

  for (const a of def.anchors) {
    let best = 1e9;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (seen[idx(i, j)]) { const d = Math.hypot(at(i) - a.x, at(j) - a.z); if (d < best) best = d; }
    if (best > REACH) fail(`anchor "${a.label}" (${a.x}, ${a.z}) is ${best.toFixed(1)} units from the nearest reachable spot`);
    if (Math.abs(a.x) > B || Math.abs(a.z) > B) fail(`anchor "${a.label}" is outside the map`);
  }
}
console.log(failed ? `\n${failed} problem(s)` : '\nAll maps OK');
process.exit(failed ? 1 : 0);
