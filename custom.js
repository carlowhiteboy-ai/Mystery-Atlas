/* Player-made mysteries: sanitise, validate and convert to a playable case.
   Shared by the server (authoritative check) and the creator screen (live feedback).
   A custom mystery = { locId, title, question, briefing, explanation, culprit (0-3),
     suspects: [{ name, role, where, saw }] x4,
     clues: [{ type, anchor, heading, body, sign, clears: [suspect idx], points: [suspect idx] }] x4-6 }
   Solvability rule (checked automatically): no clue may clear the culprit, every innocent suspect must be
   cleared by at least one clue, and at least one clue must point at the culprit. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MACUSTOM = factory();
})(this, function () {
  const TYPES = ['letter', 'diary', 'note', 'photo', 'receipt', 'ticket'];
  const LIM = { title: 60, question: 140, briefing: 300, explanation: 500, name: 30, role: 24, statement: 200, heading: 50, body: 500, sign: 60 };
  const MIN_CLUES = 4, MAX_CLUES = 6;
  // basic filter for the worst words. Some are matched anywhere ("bullshit"), the rest only as whole words so that
  // innocent text like "grape", "scrape", "Scunthorpe" or "skyscraper" is never blocked. Players can still report cases.
  const SUB = ['fuck', 'shit', 'bitch', 'nigg', 'fagg'];
  const WORD = [/\bcunts?\b/, /\brap(e|es|ed|ing|ist|ists)\b/, /\bkys\b/, /\bnazis?\b/, /\bwhores?\b/, /\bsluts?\b/, /\bretard(s|ed)?\b/, /\bkill yourself\b/];
  // lowercase, undo simple letter swaps (sh1t, f@ck) and drop punctuation (f.u.c.k)
  const norm = (t) => String(t).toLowerCase().replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/\$/g, 's').replace(/[^a-z ]/g, '').replace(/ +/g, ' ');
  const hasBad = (t) => { const n = norm(t); return SUB.some(w => n.includes(w)) || WORD.some(re => re.test(n)); };
  // for live chat: stars out the obvious words; if a disguised one is left over, hide the whole message
  const censor = (t) => {
    let out = String(t).replace(new RegExp(SUB.join('|'), 'gi'), (m) => '*'.repeat(m.length));
    out = out.replace(/\b(cunts?|rap(e|es|ed|ing|ist|ists)|kys|nazis?|whores?|sluts?|retard(s|ed)?)\b/gi, (m) => '*'.repeat(m.length));
    return hasBad(out) ? '[message hidden]' : out;
  };

  const line = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const block = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
  const idxs = (a) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < 4))];

  function sanitize(c) {
    c = c || {};
    return {
      locId: line(c.locId, 40), title: line(c.title, LIM.title), question: line(c.question, LIM.question),
      briefing: line(c.briefing, LIM.briefing), explanation: block(c.explanation, LIM.explanation),
      culprit: Number.isInteger(Number(c.culprit)) ? Number(c.culprit) : -1,
      suspects: (Array.isArray(c.suspects) ? c.suspects : []).slice(0, 4).map(s => ({ name: line(s && s.name, LIM.name), role: line(s && s.role, LIM.role), where: line(s && s.where, LIM.statement), saw: line(s && s.saw, LIM.statement) })),
      clues: (Array.isArray(c.clues) ? c.clues : []).slice(0, MAX_CLUES).map(k => ({
        type: TYPES.includes(k && k.type) ? k.type : 'note', anchor: line(k && k.anchor, 10), heading: line(k && k.heading, LIM.heading),
        body: block(k && k.body, LIM.body), sign: line(k && k.sign, LIM.sign), clears: idxs(k && k.clears), points: idxs(k && k.points)
      }))
    };
  }

  function validate(raw, locs) {
    const c = sanitize(raw), errors = [];
    const loc = locs.find(l => l.id === c.locId);
    if (!loc) errors.push('Pick a map.');
    if (c.title.length < 5) errors.push('Give the mystery a title (at least 5 letters).');
    if (c.question.length < 10 || !/\?$/.test(c.question)) errors.push('The question must be at least 10 letters and end with a question mark.');
    if (c.explanation.length < 20) errors.push('Write an explanation of at least 20 letters. It is shown when the case ends.');
    if (c.suspects.length !== 4) errors.push('You need exactly 4 suspects.');
    const names = c.suspects.map(s => s.name.toLowerCase());
    c.suspects.forEach((s, i) => { if (s.name.length < 2) errors.push('Suspect ' + (i + 1) + ' needs a name.'); if (s.role.length < 2) errors.push('Suspect ' + (i + 1) + ' needs a role (butler, gardener...).'); });
    if (new Set(names).size !== names.length) errors.push('Suspect names must be different.');
    if (!(c.culprit >= 0 && c.culprit < 4)) errors.push('Choose who the culprit is.');
    if (c.clues.length < MIN_CLUES) errors.push('Add at least ' + MIN_CLUES + ' clues (you have ' + c.clues.length + ').');
    const anchors = new Set();
    c.clues.forEach((k, i) => {
      const tag = 'Clue ' + (i + 1);
      if (k.body.length < 10) errors.push(tag + ' needs some text (at least 10 letters).');
      if (!loc || !loc.anchors.some(a => a.id === k.anchor)) errors.push(tag + ' needs a hiding spot.');
      else if (anchors.has(k.anchor)) errors.push(tag + ' uses a hiding spot that is already taken.');
      anchors.add(k.anchor);
    });
    // can the case actually be solved? (uses the hidden clears / points tags)
    if (c.suspects.length === 4 && c.culprit >= 0 && c.culprit < 4 && c.clues.length >= MIN_CLUES) {
      const cleared = new Set(), pointed = new Set();
      c.clues.forEach((k, i) => { k.clears.forEach(x => cleared.add(x)); k.points.forEach(x => pointed.add(x)); if (k.clears.includes(c.culprit)) errors.push('Clue ' + (i + 1) + ' clears the culprit, which makes the case unsolvable.'); });
      for (let i = 0; i < 4; i++) if (i !== c.culprit && !cleared.has(i)) errors.push((c.suspects[i].name || 'Suspect ' + (i + 1)) + ' is never cleared. Add a clue that clears them (an alibi).');
      if (!pointed.has(c.culprit)) errors.push('No clue points at the culprit. Add one.');
    }
    const all = [c.title, c.question, c.briefing, c.explanation, ...c.suspects.flatMap(s => [s.name, s.role, s.where, s.saw]), ...c.clues.flatMap(k => [k.heading, k.body, k.sign])];
    if (all.some(hasBad)) errors.push('Please remove offensive language.');
    return { ok: errors.length === 0, errors, clean: c };
  }

  // turn a stored custom mystery into the same shape generator.generate() returns
  function toMystery(rec, locs, rand = Math.random) {
    const c = rec, loc = locs.find(l => l.id === c.locId);
    const order = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const sus = order.map(i => c.suspects[i]);
    const clues = c.clues.map((k, i) => { const a = loc.anchors.find(x => x.id === k.anchor); return { id: 'c' + i, type: k.type, anchor: a.id, x: a.x, z: a.z, label: a.label, heading: k.heading || 'Evidence', body: k.body, sign: k.sign || '' }; });
    return {
      id: rec.id, locId: loc.id, title: c.title, question: c.question,
      briefing: c.briefing || 'Four people were on the grounds.',
      options: sus.map(s => s.name + ', the ' + s.role), answer: order.indexOf(c.culprit), explanation: c.explanation, clues,
      npcs: sus.map(s => ({ name: s.name, role: s.role, lines: { where: s.where || 'I have nothing more to add.', saw: s.saw || 'I did not see anything useful.', suspect: 'I have nothing to hide. Check the clues.' } })),
      bonus: null, custom: true, by: rec.author || 'a detective',
      meta: { id: rec.id, loc: loc.id, item: 'custom:' + rec.id, place: 'custom', q: 'custom', fams: 'custom', role: '', culprit: sus[order.indexOf(c.culprit)].name, title: c.title }
    };
  }
  return { TYPES, LIM, MIN_CLUES, MAX_CLUES, sanitize, validate, toMystery, hasBad, censor };
});
