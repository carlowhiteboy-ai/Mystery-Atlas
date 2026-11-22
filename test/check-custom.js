const C = require('../custom.js'), MAPS = require('../public/maps.js');
let bad = 0; const t = (name, cond) => { if (!cond) { bad++; console.log('  FAIL ' + name); } };
const good = {
  locId: 'foggy-harbor', title: 'The Missing Compass', question: 'Who took the silver compass?', explanation: 'Only Ned had a key and was seen near the pier at nine.', culprit: 1,
  suspects: [{ name: 'Ada', role: 'clerk' }, { name: 'Ned', role: 'ferryman' }, { name: 'Pia', role: 'cook' }, { name: 'Bo', role: 'porter' }],
  clues: [
    { type: 'letter', anchor: 'a0', heading: 'Letter', body: 'Ned asked for the key twice this week.', points: [1] },
    { type: 'receipt', anchor: 'a1', heading: 'Quay Tea Rooms', body: 'Tea for two\nCustomer: Ada\n8:40pm', clears: [0] },
    { type: 'ticket', anchor: 'a2', heading: 'Ferry Co', body: 'ADMIT ONE\nHolder: Pia\nStamped 8:55pm', clears: [2] },
    { type: 'photo', anchor: 'a3', heading: 'Photo', body: 'Bo laughing at the tavern with the whole crew.', clears: [3] }]
};
let r = C.validate(good, MAPS); t('good case passes', r.ok); if (!r.ok) console.log(r.errors);
const m = C.toMystery({ ...r.clean, id: 'u1', author: 'tester' }, MAPS);
t('answer maps to culprit', m.options[m.answer].startsWith('Ned') && m.npcs[m.answer].name === 'Ned');
t('clues have positions', m.clues.every(k => typeof k.x === 'number'));
const mut = (f) => { const c = JSON.parse(JSON.stringify(good)); f(c); return C.validate(c, MAPS); };
t('culprit cleared -> rejected', !mut(c => c.clues[1].clears = [0, 1]).ok);
t('innocent never cleared -> rejected', !mut(c => c.clues[3].clears = []).ok);
t('nobody points at culprit -> rejected', !mut(c => c.clues[0].points = []).ok);
t('duplicate hiding spot -> rejected', !mut(c => c.clues[1].anchor = 'a0').ok);
t('too few clues -> rejected', !mut(c => c.clues.pop()).ok);
t('bad word -> rejected', !mut(c => c.title = 'The f.u.c.k Case').ok);
t('leetspeak bad word -> rejected', !mut(c => c.clues[0].body = 'you are a sh1t').ok);
t('html stripped', C.sanitize({ title: '<b>Hi</b>' }).title === 'bHi/b');
for (const ok of ['Grapes from the vineyard', 'She had to scrape the label', 'The skyscraper, Turkey\'s capital', 'Scunthorpe station', 'This hit the spot', 'A shiitake risotto']) t('allows: ' + ok, !C.hasBad(ok));
for (const bad of ['what a bullshit story', 'you f.u.c.k', 'he committed rape', 'KYS']) t('blocks: ' + bad, C.hasBad(bad));
t('censor stars words', C.censor('this is shit') === 'this is ****' && C.censor('nice grape') === 'nice grape');
t('censor hides disguised words', C.censor('what a sh1t') === '[message hidden]');
t('unknown map rejected', !mut(c => c.locId = 'nope').ok);
console.log(bad ? bad + ' custom-mystery check(s) failed' : 'Custom mystery validation OK'); process.exit(bad ? 1 : 0);
