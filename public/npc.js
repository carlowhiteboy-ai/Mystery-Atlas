/* Walking suspects. Routes are planned on the map's collision grid (so they walk around buildings, trees and water)
   and are fully deterministic from a seed: every player's browser computes the same position for the same time,
   so nothing about the suspects has to be sent over the network. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MANPC = factory();
})(this, function () {
  const B = 55, STEP = 1, N = 2 * B / STEP + 1, R = 0.6, PAUSE = 4;

  function rngFrom(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function prepare(MAPS, lay) {
    const C = MAPS.collision, at = (i) => -B + i * STEP;
    const free = (x, z) => { if (Math.abs(x) > B - 1 || Math.abs(z) > B - 1 || [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([dx, dz]) => C.overWater(lay, x + dx, z + dz))) return false;   const [px, pz] = C.pushOut(lay, x, z, R); return Math.hypot(px - x, pz - z) < 0.02; };
    const ok = new Uint8Array(N * N); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) ok[i * N + j] = free(at(i), at(j)) ? 1 : 0;
    const reach = new Uint8Array(N * N), si = Math.round((MAPS.SPAWN.x + B) / STEP), sj = Math.round((MAPS.SPAWN.z + B) / STEP), q = [[si, sj]]; reach[si * N + sj] = 1;
    while (q.length) { const [i, j] = q.pop(); for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (a >= 0 && b >= 0 && a < N && b < N && ok[a * N + b] && !reach[a * N + b]) { reach[a * N + b] = 1; q.push([a, b]); } }
    return { free, ok, reach, at, idx: (v) => Math.max(0, Math.min(N - 1, Math.round((v + B) / STEP))) };
  }

  function astar(g, from, to) {
    const key = (i, j) => i * N + j, open = [[0, from[0], from[1]]], came = new Map(), cost = new Map([[key(...from), 0]]);
    const h = (i, j) => { const dx = Math.abs(i - to[0]), dz = Math.abs(j - to[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]); const [, i, j] = open.shift();
      if (i === to[0] && j === to[1]) { const path = [[i, j]]; let k = key(i, j); while (came.has(k)) { k = came.get(k); path.push([Math.floor(k / N), k % N]); } return path.reverse(); }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N || !g.ok[key(a, b)]) continue;
        if (di && dj && (!g.ok[key(i + di, j)] || !g.ok[key(i, j + dj)])) continue;
        const c = cost.get(key(i, j)) + (di && dj ? 1.414 : 1);
        if (c < (cost.get(key(a, b)) ?? Infinity)) { cost.set(key(a, b), c); came.set(key(a, b), key(i, j)); open.push([c + h(a, b), a, b]); }
      }
    }
    return null;
  }

  function lineFree(g, a, b) { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5); for (let k = 1; k < n; k++) { const t = k / n; if (!g.free(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; } return true; }
  function smooth(g, pts) { const out = [pts[0]]; let i = 0; while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !lineFree(g, pts[i], pts[j])) j--; out.push(pts[j]); i = j; } return out; }

  // build `count` closed patrol routes for one map. seed makes it repeatable (use the case id).
  function build(MAPS, def, seed, count) {
    const lay = MAPS.layout(def), g = prepare(MAPS, lay), rnd = rngFrom('npc:' + seed + ':' + def.id), cells = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (g.reach[i * N + j] && Math.hypot(g.at(i) - MAPS.SPAWN.x, g.at(j) - MAPS.SPAWN.z) > 7) cells.push([i, j]);
    const nearest = (x, z) => { let best = null, bd = 1e9; for (const c of cells) { const d = Math.hypot(g.at(c[0]) - x, g.at(c[1]) - z); if (d < bd) { bd = d; best = c; } } return best; };
    const routes = [];
    for (let n = 0; n < count; n++) {
      const anchors = def.anchors.slice().sort(() => rnd() - 0.5).slice(0, 3).map(a => nearest(a.x, a.z));
      const wps = [anchors[0], anchors[1], cells[Math.floor(rnd() * cells.length)], anchors[2]].filter(Boolean);
      const legs = []; let cycle = 0; const speed = 1.7 + rnd() * 0.7;
      for (let k = 0; k < wps.length; k++) {
        const path = astar(g, wps[k], wps[(k + 1) % wps.length]); if (!path || path.length < 2) continue;
        const pts = smooth(g, path.map(([i, j]) => [g.at(i), g.at(j)])), cum = [0];
        for (let p = 1; p < pts.length; p++) cum.push(cum[p - 1] + Math.hypot(pts[p][0] - pts[p - 1][0], pts[p][1] - pts[p - 1][1]));
        legs.push({ pts, cum, len: cum[cum.length - 1] }); cycle += cum[cum.length - 1] / speed + PAUSE;
      }
      routes.push({ legs, speed, cycle, phase: rnd() * cycle });
    }
    return routes;
  }

  // position of a route at time t (seconds since the round began)
  function posAt(route, t) {
    let tau = (t + route.phase) % route.cycle, last = { x: 0, z: 1 };
    for (const L of route.legs) {
      const travel = L.len / route.speed;
      if (tau < travel) {
        const d = tau * route.speed; let k = 1; while (k < L.cum.length - 1 && L.cum[k] < d) k++;
        const a = L.pts[k - 1], b = L.pts[k], seg = L.cum[k] - L.cum[k - 1] || 1, f = (d - L.cum[k - 1]) / seg;
        return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, ry: Math.atan2(b[0] - a[0], b[1] - a[1]), moving: true };
      }
      tau -= travel; const e = L.pts[L.pts.length - 1], p = L.pts[L.pts.length - 2] || e; last = { x: e[0] - p[0], z: e[1] - p[1] };
      if (tau < PAUSE) return { x: e[0], z: e[1], ry: Math.atan2(last.x, last.z), moving: false };
      tau -= PAUSE;
    }
    const L = route.legs[0], s = L.pts[0]; return { x: s[0], z: s[1], ry: 0, moving: false };
  }
  return { build, posAt, PAUSE };
});
