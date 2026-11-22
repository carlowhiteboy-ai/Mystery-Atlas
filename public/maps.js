/* Mystery Atlas - map catalogue (shared by server + client).
   Each map: lighting/sky, ground, solid props, and 8 evidence anchors where clues can be hidden.
   Prop DSL (x,z are ground coordinates, colours are hex ints):
     ['b',x,z,w,h,d,col]  box        ['c',x,z,r,h,col]  cylinder     ['k',x,z,r,h,col]  cone (tent / roof)
     ['p',x,z,r,y,h,col]  4-sided pyramid roof at height y             ['w',x,z,w,d,col]  water
     ['l',x,z,h,col,int]  lamp post  ['t',x,z,s,col]    tree          ['rk',x,z,s,col]   rock
     ['o',x,z,r,y,col]    upright ring / wheel                          ['f',x,z,len,rot,col] fence rail */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MAPS = factory();
})(this, function () {
  const A = (list) => list.map((a, i) => ({ id: 'a' + i, label: a[0], x: a[1], z: a[2] }));

  const MAPS = [
    {
      id: 'blackwood-manor', name: 'Blackwood Manor', builtin: true,
      intro: 'A storm-dark estate on the moor. Every door is locked, every guest has a story.',
      anchors: A([['Front porch', 0, -11.2], ['Cellar hatch', -11, -16.5], ['Greenhouse', -24.5, 10], ['Garden shed', 23.5, 8],
        ['Old well', 0, 18.3], ['Ancient oak', 14, 31.5], ['Garden bench', -14, 26], ['Hedge gap', 30, -20]])
    },
    {
      id: 'foggy-harbor', name: 'Foggy Harbor',
      intro: 'Fog rolls over the docks. Foghorns moan, ropes creak, and nobody saw anything.',
      sky: 0x0b1118, fog: [0x1a242c, 0.035], hemi: [0x6f8796, 0x10151a, 0.9], sun: [0xb7c9d6, 0.9], ground: [0x2a3036, ['#343b42', '#22282d', '#3b434a']],
      props: [
        ['w', 0, -46, 120, 26, 0x0a1a24], ['b', 0, -34, 5, 0.5, 24, 0x5a4630], ['B', -24, -8, 16, 7, 12, 0x4a4540, 0x2b2b30, 'gable:plank'],
        ['B', 22, -6, 10, 5, 8, 0x5b4a3a, 0x3a2a24, 'gable:plank'], ['B', 32, 12, 8, 4, 6, 0x6a3a2a, 0x2a1f1a, 'shed:plank'], ['B', 16, 26, 9, 4, 7, 0x4a5a5a, 0x2a3434, 'gable:plank'],
        ['b', 8, -14, 2, 1.6, 2, 0x7a5a30], ['b', 10.2, -14, 2, 1.6, 2, 0x6a4a28], ['b', 9.1, -14, 2, 1.6, 2, 0x8a6a38], ['c', -8, -20, 0.5, 10, 0x8a3a1a], ['b', -8, -20, 7, 0.4, 0.4, 0x8a3a1a, 0],
        ['l', -34, 14, 5, 0xffd9a0, 5], ['l', 0, -24, 5, 0xffd9a0, 5], ['l', 24, 4, 5, 0xffd9a0, 5], ['l', -18, 6, 5, 0xffd9a0, 4], ['c', 0, -45, 0.25, 6, 0x333333]],
      scatter: [{ k: 'b', n: 14, c: 0x6a4a30 }, { k: 'rk', n: 12, c: 0x3a4146 }],
      anchors: A([['Pier end', 0, -44], ['Warehouse door', -24, -1], ['Harbour office', 22, -1], ['Cargo shed', 32, 5],
        ['Crane base', -8, -16], ['Fish crates', 9, -11], ['Lamp post', -34, 11], ['Boat store', 16, 21]])
    },
    {
      id: 'desert-dig', name: 'Desert Dig Site',
      intro: 'Under a blazing moon, an excavation camp. Something ancient was pulled from the sand.',
      sky: 0x10122a, fog: [0x2a2438, 0.016], hemi: [0x9a8ab0, 0x3a2e22, 1.0], sun: [0xffe2b0, 1.4], ground: [0x8a6f48, ['#9a7e52', '#7a603c', '#a58a5c']],
      props: [
        ['k', -18, -6, 6, 5, 0xc9b78a], ['k', 18, -10, 6, 5, 0xd6c49a], ['k', 0, -24, 8, 6, 0xbfae84], ['b', -30, 12, 10, 1.2, 8, 0x7a6244], ['b', 30, 10, 3, 3, 3, 0x8a6f48],
        ['b', 0, -40, 14, 6, 3, 0x9a8460], ['c', -10, -40, 1, 8, 0x9a8460], ['c', 10, -40, 1, 8, 0x9a8460], ['b', -4, 4, 2.5, 1, 1.2, 0x6a4a2a], ['b', 22, 28, 2, 1.2, 2, 0x6a4a2a],
        ['c', -34, 30, 1.4, 1.2, 0x555a55], ['c', 38, -22, 3, 0.8, 0x3a3226], ['l', -6, -12, 3.2, 0xffb060, 4], ['l', 12, 4, 3.2, 0xffb060, 4], ['l', -28, 6, 3.2, 0xffb060, 3]],
      scatter: [{ k: 'cactus', n: 24, c: 0x4a6a3a }, { k: 'rk', n: 24, c: 0x8a7050 }],
      anchors: A([['Dig trench', -30, 17], ['Supply tent', -18, -1], ['Finds tent', 18, -4], ['Ruined hall', 0, -34],
        ['Map table', -4, 8], ['Water cistern', 38, -16], ['Camel pen', 22, 22], ['Oasis well', -34, 25]])
    },
    {
      id: 'frost-station', name: 'Frost Research Station',
      intro: 'A polar base cut off by a blizzard. Someone inside the station is lying.',
      sky: 0x0a1424, fog: [0x9fb4c8, 0.03], hemi: [0xbad4f0, 0x6a7a8a, 1.2], sun: [0xcfe3ff, 1.1], ground: [0xdfe8f2, ['#e8f0fa', '#c9d6e4', '#f4f8ff']],
      props: [
        ['B', -10, -10, 16, 5, 9, 0xc0392b, 0xeeeeee, 'hip'], ['B', 14, -12, 10, 4, 8, 0x2b6cb0, 0xdde6ee, 'flat'], ['B', 30, 4, 6, 3.5, 5, 0x4a5568, 0xcfd6dd, 'shed'],
        ['B', -32, 8, 7, 4, 6, 0xd69e2e, 0xeeeeee, 'flat'], ['c', 0, -34, 0.3, 18, 0x888888], ['k', 0, -24, 5, 4, 0xe0f0ff], ['B', 24, 24, 12, 4, 8, 0x8a96a3, 0xcfd6dd, 'arch'],
        ['b', 0, 2, 1.4, 1.2, 1.4, 0x6a7a8a], ['k', -40, -20, 8, 5, 0xffffff], ['k', 40, -30, 10, 7, 0xffffff], ['l', -2, -6, 4, 0xbfe0ff, 4], ['l', 20, 0, 4, 0xbfe0ff, 4], ['l', -24, 12, 4, 0xbfe0ff, 3]],
      scatter: [{ k: 'rk', n: 22, c: 0xe6eef7 }, { k: 'b', n: 8, c: 0xa0522d }],
      anchors: A([['Lab hut door', -10, -3], ['Radio room', 14, -6], ['Generator shed', 30, 9], ['Hangar', 24, 17],
        ['Antenna mast', 0, -31], ['Snowmobile bay', -32, 14], ['Ice cellar', 0, -19], ['Supply sled', 2, 5]])
    },
    {
      id: 'midnight-carnival', name: 'Midnight Carnival',
      intro: 'The fairground should be dark, yet the lights are still on and the music box still plays.',
      sky: 0x180a22, fog: [0x2a1038, 0.02], hemi: [0xc08adf, 0x241230, 0.95], sun: [0xe0b0ff, 0.8], ground: [0x3a2a2e, ['#4a3a3e', '#2a1c20', '#5a4a40']],
      props: [
        ['k', 0, -24, 12, 12, 0xb0202a], ['c', 0, -24, 0.4, 14, 0xfff0c0], ['o', -30, -20, 9, 10, 0xffc040], ['b', -30, -20, 0.6, 10, 0.6, 0x555555], ['c', 28, -12, 4, 0.6, 0xc08a3a], ['k', 28, -12, 4.4, 2.2, 0xd04a8a],
        ['B', -16, 4, 6, 3.4, 4, 0x2a6aa0, 0xb0202a, 'hip'], ['B', 18, 6, 5, 3.4, 4, 0xa05a2a, 0xe0b020, 'hip'], ['B', 34, 10, 4, 3, 4, 0x6a2a8a, 0x2a1a4a, 'hip'], ['B', -34, 2, 4, 3, 3, 0x2a8a5a, 0xe0e0e0, 'hip'], ['k', 6, 30, 3, 3, 0xe0b020],
        ['l', -10, 14, 4, 0xff6aa0, 4], ['l', 12, 12, 4, 0xffd060, 4], ['l', 0, -8, 4, 0x70d0ff, 4], ['l', 28, -2, 4, 0xff9040, 3]],
      scatter: [{ k: 'b', n: 12, c: 0x8a3a5a }, { k: 'rk', n: 6, c: 0x4a3a40 }],
      anchors: A([['Big top entrance', 0, -11], ['Ferris wheel', -30, -14], ['Carousel', 28, -6], ['Strongman booth', -16, 9],
        ['Ticket booth', 18, 11], ['Fortune tent', 34, 15], ['Prize stall', -34, 7], ['Popcorn cart', 6, 25]])
    },
    {
      id: 'cliffside-lighthouse', name: 'Cliffside Lighthouse',
      intro: 'A lighthouse on a sheer cliff. Its beam has gone dark and the keeper has not been seen.',
      sky: 0x070d1a, fog: [0x101a2a, 0.024], hemi: [0x6a8ab8, 0x141c14, 0.9], sun: [0xb0c4ff, 1.1], ground: [0x24331f, ['#2c3f26', '#1c2a18', '#34462c']],
      props: [
        ['w', 0, -52, 130, 30, 0x0a2030], ['T', 0, -18, 4, 24, 0xe8e0d0, 0x2a2a30, 0x8a2a2a, 'round', true], ['B', -14, -8, 9, 4, 7, 0x6a5a48, 0x3a2a24, 'gable:stone'],
        ['B', 20, 4, 8, 3.5, 6, 0x5a4a3a, 0x2e2420, 'gable:plank'], ['B', 30, -10, 6, 3, 5, 0x4a5a5a, 0x2a3434, 'shed:plank'], ['b', -28, 12, 8, 0.6, 3, 0x5a3a20], ['rk', -40, -30, 5, 0x3a4146], ['rk', 38, -36, 6, 0x3a4146], ['l', -6, 6, 4, 0xffd9a0, 4], ['l', 14, -6, 4, 0xffd9a0, 4], ['l', -22, 14, 4, 0xffd9a0, 3]],
      scatter: [{ k: 't', n: 28, c: 0x1b3320 }, { k: 'rk', n: 20, c: 0x3a4146 }],
      anchors: A([['Lighthouse door', 0, -13], ['Keeper\'s cottage', -14, -2], ['Oil store', 20, 10], ['Boathouse', 30, -4],
        ['Cliff stairs', -4, -38], ['Signal rock', -38, -24], ['Jetty', -28, 7], ['Gorse bush', 10, 26]])
    },
    {
      id: 'rail-yard', name: 'Midnight Rail Yard',
      intro: 'The last train left an hour ago, but something in the yard was moved after dark.',
      sky: 0x0a0c14, fog: [0x181a22, 0.028], hemi: [0x7a8aa8, 0x161412, 0.85], sun: [0xc0c8e0, 0.9], ground: [0x2e2c28, ['#38352f', '#24221e', '#403c35']],
      props: [
        ['b', 0, -4, 120, 0.15, 0.3, 0x5a5048, 0], ['b', 0, 0, 120, 0.15, 0.3, 0x5a5048, 0], ['b', 0, -24, 120, 0.15, 0.3, 0x5a5048, 0], ['b', 0, -20, 120, 0.15, 0.3, 0x5a5048, 0],
        ['B', -24, -12, 18, 4.5, 3, 0x5a2a22, 0x2a1a18, 'arch'], ['B', -4, -12, 12, 4, 3, 0x2a3a4a, 0x1a222a, 'arch'], ['B', 22, -12, 14, 4.5, 3, 0x3a3a2a, 0x1a1a14, 'arch'],
        ['B', 30, 14, 12, 5, 8, 0x4a3a30, 0x2a2420, 'gable:plank'], ['B', -30, 16, 4, 7, 4, 0x4a4a52, 0x2a2a30, 'hip'], ['W', 12, 26, 2.4, 9, 0x4a3a30], ['b', 0, 30, 14, 1.4, 4, 0x3a3a3a], ['b', -8, 6, 5, 1.2, 3, 0x2a2a2a], ['l', -12, 12, 5, 0xffe0a0, 4], ['l', 8, 8, 5, 0xffe0a0, 4], ['l', 26, 4, 5, 0xffe0a0, 4]],
      scatter: [{ k: 'rk', n: 18, c: 0x3a3834 }, { k: 'b', n: 10, c: 0x4a3a28 }],
      anchors: A([['Signal box', -30, 21], ['Freight shed', 30, 8], ['Goods carriage', -24, -8], ['Platform office', -4, -8],
        ['Engine shed', 22, -8], ['Water tower', 12, 22], ['Coal heap', -8, 10], ['Footbridge', 0, 26]])
    },
    {
      id: 'hollow-monastery', name: 'Hollow Monastery',
      intro: 'A monastery sealed against the snow. The bell has rung thirteen times, and the library is open.',
      sky: 0x0c0a14, fog: [0x1a1822, 0.026], hemi: [0x9a8ab0, 0x1c1814, 0.85], sun: [0xd8cfe8, 1.0], ground: [0x2a2a22, ['#34342a', '#1e1e18', '#3c3c30']],
      props: [
        ['B', 0, -22, 30, 8, 16, 0x6a6458, 0x3a342e, 'gable:stone'], ['T', -24, -14, 3.6, 16, 0x6a6458, 0x3a342e, 0, 'square'],
        ['B', 24, -8, 12, 5, 10, 0x62594a, 0x3a2e26, 'gable:stone'], ['B', -26, 14, 10, 4, 8, 0x5a5448, 0x3a342e, 'gable:stone'], ['B', 26, 18, 10, 3, 6, 0x4a4438, 0x2a261e, 'shed:stone'],
        ['b', 0, 2, 3, 1.2, 3, 0x4a4438], ['f', -9.5, 8, 13, 0, 0x4a4438], ['f', 9.5, 8, 13, 0, 0x4a4438],
        ['l', -8, 4, 3.6, 0xffb860, 4], ['l', 8, 4, 3.6, 0xffb860, 4], ['l', 0, -8, 3.6, 0xffb860, 4], ['l', 22, 6, 3.6, 0xffb860, 3]],
      scatter: [{ k: 't', n: 26, c: 0x1c2e1e }, { k: 'rk', n: 14, c: 0x4a4a44 }],
      anchors: A([['Cloister', 0, -12], ['Bell tower base', -24, -8], ['Scriptorium', 24, -2], ['Herb garden', -26, 20],
        ['Crypt stairs', 26, 24], ['Prayer bench', 0, 5.5], ['Chapel door', -10, -12], ['Orchard gate', 40, 6]])
    },
    {
      id: 'bayou-village', name: 'Bayou Village',
      intro: 'Stilt huts sway over black water. The swamp keeps secrets, and so do the neighbours.',
      sky: 0x07100e, fog: [0x14241c, 0.034], hemi: [0x7aa08a, 0x101a12, 0.85], sun: [0xb0d8c0, 0.8], ground: [0x1c2a1e, ['#24361e', '#162214', '#2e3e22']],
      props: [
        ['w', -24, -10, 50, 40, 0x0a1a14], ['w', 40, 24, 24, 26, 0x0a1a14],
        ['b', -10, -4, 9, 0.25, 9, 0x5a4630], ['b', -10, 5, 2.2, 0.25, 10, 0x5a4630], ['B', -10, -4, 5, 3, 5, 0x6a5238, 0x3a2e20, 'hip:plank'],
        ['B', 14, -10, 8, 3, 6, 0x5a4a38, 0x3a2e20, 'gable:plank'], ['B', 28, 6, 6, 3, 5, 0x6a4a30, 0x2e2418, 'shed:plank'], ['B', -30, 22, 8, 2.6, 6, 0x4a3a2a, 0x2a2018, 'shed:plank'],
        ['b', 4, 24, 5, 0.3, 14, 0x5a4630], ['c', 22, 28, 1.2, 3, 0x6a5a40],
        ['l', -8, 10, 3.6, 0xffc070, 4], ['l', 14, 0, 3.6, 0xffc070, 4], ['l', -26, 14, 3.6, 0xffc070, 3]],
      scatter: [{ k: 't', n: 36, c: 0x1c3a22 }, { k: 'rk', n: 10, c: 0x2a3a2a }],
      anchors: A([['Stilt hut', -10, 0], ['Trading post', 14, -5], ['Boat shed', 28, 11], ['Smokehouse', -30, 17],
        ['Rope bridge', 4, 24], ['Fiddle porch', -14, -8], ['Cypress landing', 22, 24], ['Old well', 0, 10]])
    },
    {
      id: 'moonlit-vineyard', name: 'Moonlit Vineyard',
      intro: 'Rows of vines glow under the harvest moon. The best vintage of the year has vanished from the cellar.',
      sky: 0x0b0a1c, fog: [0x1c1a30, 0.018], hemi: [0x9a90c8, 0x241e14, 1.0], sun: [0xcfc8ff, 1.2], ground: [0x2a3320, ['#34402a', '#202818', '#3e4a30']],
      props: [
        ['B', 0, -28, 22, 6, 12, 0x8a6a4a, 0x5a2e24, 'gable:plaster'], ['B', -26, -16, 9, 4, 8, 0x7a5a3a, 0x4a2a1e, 'gable:plaster'], ['B', 28, -14, 10, 4.5, 8, 0x6a5440, 0x3a2a22, 'gable:plaster'],
        ['T', 34, 6, 3, 6, 0x6a5a48, 0x4a2a22, 0, 'round'],
        ['c', -34, 10, 1.2, 1.8, 0x5a3a1e], ['c', -31, 12, 1.2, 1.8, 0x5a3a1e], ['c', -33, 14, 1.2, 1.8, 0x5a3a1e], ['b', 0, 8, 6, 1, 3, 0x4a3a2a], ['f', -10, 2, 14, 0, 0x5a4630], ['f', 10, 2, 14, 0, 0x5a4630],
        ['l', -6, -10, 3.6, 0xffc880, 4], ['l', 8, -10, 3.6, 0xffc880, 4], ['l', 24, 0, 3.6, 0xffc880, 3]],
      scatter: [{ k: 'vine', n: 70, c: 0x2c4a22 }, { k: 't', n: 14, c: 0x20381e }],
      anchors: A([['Cellar door', 0, -20], ['Tasting room', -26, -9], ['Press house', 28, -7], ['Water tower', 34, 12],
        ['Barrel store', -32, 17], ['Tasting table', 0, 11], ['Vine terrace', 14, 22], ['Iron gate', -18, 30]])
    }
  ];
  /* ---------- layout: props + collision data, shared by the client and the test script ---------- */
  function mapRng(str) { let a = 0; for (const ch of str) a = (a * 31 + ch.charCodeAt(0)) >>> 0; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296; }

  const MANOR_COLLIDERS = {
    boxes: [
      { x0: -8.4, x1: 8.4, z0: -26.4, z1: -13.6 },     // manor house
      { x0: -34.65, x1: -25.35, z0: 6.35, z1: 13.65 }, // greenhouse
      { x0: 24.8, x1: 31.2, z0: 5.3, z1: 10.7 }        // garden shed
    ],
    circles: [
      { x: 0, z: 20, r: 1.5 }, { x: 14, z: 34, r: 1.5 },                          // well, ancient oak
      { x: -2.6, z: -11, r: 0.3 }, { x: 2.6, z: -11, r: 0.3 },                      // porch pillars
      { x: -2.4, z: -5, r: 0.25 }, { x: 2.4, z: 8, r: 0.25 },                       // lamp posts
      ...[...Array(12).keys()].map(i => ({ x: 34 + (i % 4) * 3, z: -40 + Math.floor(i / 4) * 3.5, r: 0.55 })), // graveyard
      ...[[32, -32], [47, -38], [38, -46], [50, -28], [30, -44], [44, -24]].map(([x, z]) => ({ x, z, r: 0.5 })) // dead trees
    ]
  };

  function layout(def) {
    const out = { props: [], boxes: [], circles: [], waters: [], decks: [] };
    if (def.builtin) {
      out.boxes = MANOR_COLLIDERS.boxes.slice(); out.circles = MANOR_COLLIDERS.circles.slice();
      return out;
    }
    const R = mapRng(def.id + ':layout');
    const box = (x, z, hw, hd) => out.boxes.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
    const circ = (x, z, r) => out.circles.push({ x, z, r });
    const collide = (p) => {
      const k = p[0];
      if (k === 'b') {
        const [, x, z, w, h, d, , sol] = p;
        const solid = sol === undefined ? h >= 1 : !!sol;
        if (solid) box(x, z, w / 2, d / 2);
        else if (h < 1 && Math.min(w, d) >= 1.5) out.decks.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y: h >= 0.3 ? h : 0 });
      }
      else if (k === 'B') box(p[1], p[2], p[3] / 2, p[5] / 2);
      else if (k === 'T') { const r = p[3]; if (p[8] === 'square') box(p[1], p[2], r, r); else circ(p[1], p[2], r); }
      else if (k === 'W') circ(p[1], p[2], p[3] * 0.8);
      else if (k === 'c') { if (p[3] >= 0.4) circ(p[1], p[2], p[3]); }
      else if (k === 'k') { if (p[3] >= 1) circ(p[1], p[2], p[3] * 0.9); }
      else if (k === 'l') circ(p[1], p[2], 0.25);
      else if (k === 't') circ(p[1], p[2], Math.max(0.35, 0.35 * p[3]));
      else if (k === 'rk') { if (p[3] >= 0.5) circ(p[1], p[2], p[3] * 0.85); }
      else if (k === 'w') out.waters.push({ x0: p[1] - p[3] / 2, x1: p[1] + p[3] / 2, z0: p[2] - p[4] / 2, z1: p[2] + p[4] / 2 });
      else if (k === 'f') {
        const [, x, z, len, rot] = p;
        for (let s = -len / 2; s <= len / 2 + 0.01; s += 1.2) circ(x + Math.cos(rot) * s, z - Math.sin(rot) * s, 0.3);
      }
    };
    for (const p of def.props || []) { out.props.push(p); collide(p); }

    // scatter (trees, rocks, cacti, crates, vines) away from anchors, spawn, solids and water
    const free = (x, z) => Math.abs(x) < 54 && Math.abs(z) < 54 && Math.hypot(x, z - 14) > 7 &&
      !def.anchors.some(a => Math.hypot(a.x - x, a.z - z) < 5) &&
      !out.boxes.some(b => x > b.x0 - 1.5 && x < b.x1 + 1.5 && z > b.z0 - 1.5 && z < b.z1 + 1.5) &&
      !out.circles.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 1.5) &&
      !out.waters.some(w => x > w.x0 - 1 && x < w.x1 + 1 && z > w.z0 - 1 && z < w.z1 + 1);
    for (const sc of def.scatter || []) {
      let placed = 0;
      for (let i = 0; placed < sc.n && i < sc.n * 12; i++) {
        const x = (R() - 0.5) * 108, z = (R() - 0.5) * 108;
        if (!free(x, z)) continue;
        placed++;
        let p;
        if (sc.k === 'cactus') { p = ['cactus', x, z, 1.5 + R() * 2, sc.c]; circ(x, z, 0.5); }
        else if (sc.k === 'vine') { p = ['vine', x, z, 0.7 + R() * 0.3, sc.c]; circ(x, z, 0.5); }
        else if (sc.k === 'b') { const s = 0.9 + R() * 0.8; p = ['crate', x, z, s, sc.c, R() * 3]; circ(x, z, s * 0.7); }
        else { p = [sc.k, x, z, sc.k === 'rk' ? 0.6 + R() * 1.4 : 0.8 + R() * 0.9, sc.c]; collide(p); }
        out.props.push(p);
      }
    }
    return out;
  }

  /* ---------- collision: circle player vs boxes + circles, water blocks unless over a deck ---------- */
  const inRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  function deckY(lay, x, z) { let y = -1; for (const d of lay.decks) if (inRect(d, x, z) && d.y > y) y = d.y; return y; } // -1 = not on a deck
  function overWater(lay, x, z) { return lay.waters.some(w => inRect(w, x, z)) && deckY(lay, x, z) < 0; }
  function pushOut(lay, x, z, R, extra) {
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const b of lay.boxes) {
        const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d >= R) continue;
        if (d > 1e-6) { x += dx / d * (R - d); z += dz / d * (R - d); }
        else { // centre is inside the box: leave through the nearest side
          const l = x - b.x0, r = b.x1 - x, t = z - b.z0, u = b.z1 - z, m = Math.min(l, r, t, u);
          if (m === l) x = b.x0 - R; else if (m === r) x = b.x1 + R; else if (m === t) z = b.z0 - R; else z = b.z1 + R;
        }
        moved = true;
      }
      const ring = (c) => {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = c.r + R;
        if (d >= min) return;
        if (d > 1e-6) { x = c.x + dx / d * min; z = c.z + dz / d * min; } else x = c.x + min;
        moved = true;
      };
      lay.circles.forEach(ring); if (extra) extra.forEach(ring);
      if (!moved) break;
    }
    return [x, z];
  }
  // returns the new position after trying to walk from (x,z) to (nx,nz)
  function moveTo(lay, x, z, nx, nz, R, extra) {
    const B = MAPS.BOUND, cl = (v) => Math.max(-B, Math.min(B, v));
    nx = cl(nx); nz = cl(nz);
    if (overWater(lay, nx, z)) nx = x;
    if (overWater(lay, nx, nz)) nz = z;
    let [px, pz] = pushOut(lay, nx, nz, R, extra);
    px = cl(px); pz = cl(pz);
    if (overWater(lay, px, pz)) { px = x; pz = z; }
    return [px, pz];
  }
  MAPS.collision = { inRect, deckY, overWater, pushOut, moveTo, PLAYER_R: 0.45 };
  MAPS.layout = layout;
  MAPS.SPAWN = { x: 0, z: 14 };
  MAPS.BOUND = 55;
  return MAPS;
});
