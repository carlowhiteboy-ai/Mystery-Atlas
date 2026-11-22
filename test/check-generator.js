// Checks that all mysteries are solvable and that the picker avoids repeats in close succession.
// Run: npm test
const G = require('../generator.js'), MAPS = require('../public/maps.js');
let bad = 0;

// 1. every mystery has exactly one suspect matching both culprit traits, and all clue anchors are distinct
for (let id = 0; id < G.TOTAL; id++) {
  const m = G.generate(id, MAPS);
  const { grid, culprit } = m.debug;
  const matches = grid.filter(v => v[0] === grid[culprit][0] && v[1] === grid[culprit][1]).length;
  const anchors = new Set(m.clues.map(c => c.anchor));
  if (matches !== 1 || anchors.size !== m.clues.length || m.answer !== culprit) { bad++; if (bad < 5) console.log('unsolvable/invalid mystery', id); }
}
console.log(bad ? `${bad} invalid mysteries` : `All ${G.TOTAL} mysteries are solvable`);

// 2. repetition in close succession: old picker (uniform random, avoids only the previous map) vs the new one
function simulate(strategy, rounds = 600) {
  const hist = [], used = new Set(); let lastLoc = null;
  const stats = { sameMapNext: 0, sameItemWithin3: 0, sameQuestionWithin3: 0, sameCulpritNameWithin5: 0, sameRoleNext: 0, sameTitleWithin6: 0 };
  for (let r = 0; r < rounds; r++) {
    const m = strategy(hist, used, lastLoc);
    used.add(m.id); lastLoc = m.locId;
    const last = (n) => hist.slice(-n);
    if (hist.length && hist[hist.length - 1].loc === m.meta.loc) stats.sameMapNext++;
    if (last(3).some(h => h.item === m.meta.item)) stats.sameItemWithin3++;
    if (last(3).some(h => h.q === m.meta.q)) stats.sameQuestionWithin3++;
    if (last(5).some(h => h.culprit === m.meta.culprit)) stats.sameCulpritNameWithin5++;
    if (hist.length && hist[hist.length - 1].role === m.meta.role) stats.sameRoleNext++;
    if (last(6).some(h => h.title === m.meta.title)) stats.sameTitleWithin6++;
    hist.push(m.meta);
  }
  for (const k in stats) stats[k] = (100 * stats[k] / rounds).toFixed(1) + '%';
  return stats;
}
const oldPick = (hist, used, lastLoc) => {   // what server.js / the solo page did before
  let m;
  for (let t = 0; t < 40; t++) { let id; do { id = Math.floor(Math.random() * G.TOTAL); } while (used.has(id)); m = G.generate(id, MAPS); if (m.locId !== lastLoc) break; }
  return m;
};
const newPick = (hist, used) => G.pickFresh({ locs: MAPS, recent: hist.slice(-20), banned: used });
console.log('\nHow often a round resembles a recent one (lower is better):');
console.table({ 'old picker': simulate(oldPick), 'new picker': simulate(newPick) });
const s = simulate(newPick);
if (parseFloat(s.sameMapNext) > 0 || parseFloat(s.sameItemWithin3) > 6 || parseFloat(s.sameQuestionWithin3) > 12) { console.log('new picker is still repeating too much'); process.exit(1); }
