/* Mystery Atlas - procedural mystery generator.
   generate(id, locations) always returns the same case for the same id, so the catalogue
   is TOTAL fixed mysteries (ids 0..TOTAL-1). Each one is a solvable deduction puzzle:
   two "trait" clues pin down the culprit, two alibis clear innocents, one motive points at
   the culprit and one decoy motive is a red herring. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MAGEN = factory();
})(this, function () {
  const TOTAL = 1500;

  const FIRST = ['Alfred', 'Beatrice', 'Cedric', 'Dorothea', 'Edmund', 'Fiona', 'Gideon', 'Harriet', 'Ignatius', 'Josephine', 'Klaus', 'Lavinia', 'Maxwell', 'Nora', 'Oswald', 'Penelope', 'Quentin', 'Rosalind', 'Silas', 'Theodora', 'Ulric', 'Vivian', 'Winston', 'Xenia', 'Yusuf', 'Zelda', 'Amara', 'Bruno', 'Carmen', 'Dmitri', 'Elena', 'Farid', 'Greta', 'Hugo', 'Isla', 'Jonas', 'Keiko', 'Leon', 'Mira', 'Nikolai', 'Odette', 'Percival', 'Rhea', 'Soren', 'Tamsin', 'Ulysses', 'Verity', 'Wilhelmina', 'Xavier', 'Yara', 'Zacharias', 'Agnes', 'Barnaby', 'Cosima', 'Desmond', 'Esme', 'Florian', 'Imogen'];
  const LAST = ['Ashby', 'Blackwood', 'Crane', 'Delacroix', 'Ellery', 'Fairchild', 'Grimshaw', 'Hargrove', 'Ironside', 'Jarvis', 'Kettering', 'Lockhart', 'Marlowe', 'Northcott', 'Oakes', 'Pemberton', 'Quill', 'Ravenscroft', 'Sinclair', 'Thorne', 'Underhill', 'Vance', 'Whitlock', 'Yardley', 'Zoller', 'Abara', 'Brandt', 'Castellan', 'Dunmore', 'Everhart', 'Foxley', 'Galloway', 'Holloway', 'Iverson', 'Jessop', 'Kincaid', 'Lovell', 'Merrick', 'Nakamura', 'Orlov', 'Pryce', 'Quintero', 'Rosewood', 'Saltmarsh', 'Tremaine', 'Umber', 'Valentine', 'Wexford', 'Yeoman', 'Zephyr', 'Alderton', 'Bellamy', 'Cavendish', 'Draycott', 'Eastwood', 'Fenwick', 'Gresham', 'Halloran'];
  const ADJ = ['Vanished', 'Midnight', 'Silent', 'Crimson', 'Hollow', 'Forged', 'Whispering', 'Broken', 'Secret', 'Missing', 'Cursed', 'Phantom', 'Last', 'Hidden', 'Stolen', 'Gilded', 'Shattered', 'Forgotten', 'Troubled', 'Buried', 'Veiled', 'Restless', 'Twisted', 'Ashen', 'Pale', 'Scarlet', 'Faded', 'Borrowed', 'Sinister', 'Counterfeit', 'Unlucky', 'Sealed', 'Wandering', 'Mourning', 'Haunted', 'Ivory', 'Thirteenth', 'Gloomy', 'Tarnished', 'Lost'];
  const NOUN = ['Affair', 'Mystery', 'Incident', 'Caper', 'Conundrum', 'Puzzle', 'Scandal', 'Riddle'];
  const BRIEF = {
    o: ['Between {t1} and {t2}, {victim}\'s {item} vanished from the {place}.', 'At {t1} {victim} secured the {item} in the {place}. By {t2} it was gone.', '{victim} left the {item} in the {place} around {t1}. On returning at {t2}, it had disappeared.', 'Someone slipped into the {place} between {t1} and {t2} and walked off with {victim}\'s {item}.'],
    d: ['Between {t1} and {t2}, someone tampered with {victim}\'s {item} in the {place}.', 'When {victim} checked the {item} in the {place} at {t2}, it had clearly been changed since {t1}.', 'Sometime after {t1}, the {item} in the {place} was falsified. {victim} only noticed at {t2}.'],
    m: ['Between {t1} and {t2}, the {item} at the {place} was deliberately damaged. {victim} is furious.', 'At {t2}, {victim} found the {item} at the {place} wrecked. It had worked fine at {t1}.', 'Someone interfered with the {item} at the {place} after {t1}, and {victim} wants to know who.']
  };
  const CLOSE = ['Four people were on the grounds.', 'Four suspects had the run of the place that night.', 'Only four people could have done it, and each has a story.', 'Four people were nearby, and nobody admits anything.', 'Every door was unlocked, and four people were around.'];
  const DETAIL = ['{wit} says they noticed something odd near the {place}.', 'The night was unusually quiet.', 'Nobody remembers anyone raising the alarm.', 'The lamps along the paths had been turned low.', '{wit} heard hurried footsteps but saw no one.'];
  const PURCHASE = ['two candles', 'a loaf of bread', 'a bottle of ink', 'a pound of tea', 'a box of matches', 'a ball of twine', 'boot polish', 'a newspaper', 'cough lozenges', 'a tin of biscuits'];

  const FAM = {
    hand: { p: ['is left-handed', 'is right-handed'], o: [
      ['Ink was smeared from right to left across the {surface}, the way a left-handed writer drags a palm.', 'The marks on the {surface} slant backwards: someone left-handed was in a hurry.', 'Smudged fingerprints on the {surface} are clearly from a left hand.'],
      ['Ink was dragged from left to right across the {surface}: the habit of a right-handed hand.', 'A clear right-handed thumbprint was pressed into the {surface}.', 'The scratches on the {surface} curve the way a right-handed grip leaves them.']] },
    shoes: { p: ['wears muddy work boots', 'wears polished dress shoes'], o: [
      ['Deep, muddy boot prints led away from the {place}.', 'Clumps of soil from heavy work boots were trodden into the {place}.', 'Someone in work boots tracked mud across the {place}.'],
      ['Narrow, clean shoe prints with a polished heel crossed the {place}.', 'The scuffs in the {place} came from smart dress shoes, not boots.', 'A neat, polished heel mark was left in the {place}.']] },
    scent: { p: ['smells of pipe tobacco', 'wears lavender perfume'], o: [
      ['A faint smell of pipe tobacco hung over the {place}.', 'Stale pipe smoke clung to the air in the {place}.', 'Pipe ash was found on the floor of the {place}.'],
      ['A trace of lavender perfume lingered in the {place}.', 'The {place} smelled sweetly of lavender, out of place at that hour.', 'A lavender-scented handkerchief was left in the {place}.']] },
    cloth: { p: ['wears a red scarf', 'wears a green coat'], o: [
      ['A scrap of red wool was caught on a nail by the {place}.', 'Red woollen fibres were snagged on the door of the {place}.', 'A loose red thread was found near the {place}.'],
      ['A torn green thread was snagged near the {place}.', 'A scrap of green tweed was caught by the {place}.', 'Green fibres were found on the door of the {place}.']] },
    hair: { p: ['has grey hair', 'has red hair'], o: [
      ['A single grey hair was found on the {surface}.', 'Grey hairs were left on the {surface}.', 'A silvery hair was lying across the {surface}.'],
      ['A strand of red hair lay on the {surface}.', 'Red hairs were caught on the {surface}.', 'A copper-coloured hair was left on the {surface}.']] },
    height: { p: ['is tall', 'is short'], o: [
      ['The high shelf in the {place} was disturbed: only a tall person could reach it.', 'Scuffs high on the wall of the {place} suggest someone tall.', 'Cobwebs high above the {place} were brushed away by a tall person.'],
      ['A stool had been dragged under the shelf in the {place}: someone short used it.', 'Low, hurried footprints in the {place} point to a short person.', 'Only a short person could have slipped through the narrow gap at the {place}.']] }
  };
  const FAM_KEYS = Object.keys(FAM);

  const V = {
    'blackwood-manor': {
      roles: ['butler', 'gardener', 'housekeeper', 'physician', 'chauffeur', 'cook', 'governess', 'solicitor'],
      items: [['sapphire necklace', 'o'], ['silver locket', 'o'], ['jade figurine', 'o'], ['crystal decanter', 'o'], ['ruby ring', 'o'], ['family will', 'd'], ['guest ledger', 'd'], ['deed to the estate', 'd'], ['grandfather clock', 'm'], ['cellar lock', 'm'], ['dumbwaiter', 'm'], ['gas lamp', 'm']],
      places: ['study', 'library', 'conservatory', 'cellar', 'drawing room', 'trophy hall'], surfaces: ['oak desk', 'window ledge', 'stair rail', 'door frame'],
      alibi: ['kitchen', 'stables', 'village church', 'orchard gate', "servants' hall", 'chapel'], shops: ['Hartley & Son Grocers', 'Moor Lane Tobacconist', 'Village Post Office'], ticket: 'Moorland Coach Line',
      wit: ['a visiting vicar', 'the night gatekeeper', 'a farm hand', 'the village postman'] },
    'foggy-harbor': {
      roles: ['harbour master', 'dock foreman', 'customs officer', 'ship captain', 'net mender', 'ferryman', 'cargo clerk', 'night watchman'],
      items: [['brass sextant', 'o'], ['smuggler\'s chest', 'o'], ['silver compass', 'o'], ['pearl shipment', 'o'], ['ivory carving', 'o'], ['cargo manifest', 'd'], ['customs permit', 'd'], ['ship\'s log', 'd'], ['crane winch', 'm'], ['signal lamp', 'm'], ['warehouse lock', 'm'], ['mooring rope', 'm']],
      places: ['bonded warehouse', 'harbour office', 'cargo shed', 'customs house', 'boat store', 'pier end'], surfaces: ['wet crate', 'iron railing', 'office counter', 'rope coil'],
      alibi: ['fish market', 'ferry landing', 'tavern', 'chandlery', 'lighthouse steps', 'fishermen\'s mission'], shops: ['Pike & Sons Chandlers', 'Harbour Lane Bakery', 'Quayside Tea Rooms'], ticket: 'Harbour Ferry Co.',
      wit: ['a passing deckhand', 'the tavern keeper', 'a fisher girl', 'the lamplighter'] },
    'desert-dig': {
      roles: ['lead archaeologist', 'camp cook', 'surveyor', 'translator', 'camel driver', 'photographer', 'site foreman', 'museum envoy'],
      items: [['golden scarab', 'o'], ['clay tablet', 'o'], ['bronze mirror', 'o'], ['lapis amulet', 'o'], ['carved seal', 'o'], ['site map', 'd'], ['excavation journal', 'd'], ['translation notes', 'd'], ['water pump', 'm'], ['sifting frame', 'm'], ['tent winch', 'm'], ['generator', 'm']],
      places: ['dig trench', 'supply tent', 'finds tent', 'ruined hall', 'map tent', 'cistern'], surfaces: ['sand table', 'tent pole', 'trench wall', 'supply crate'],
      alibi: ['oasis well', 'camel pens', 'cooking fire', 'ridge lookout', 'radio tent', 'sleeping tents'], shops: ['Oasis Trading Post', 'Dunes Provisions', 'Caravan Supply Co.'], ticket: 'Desert Rail Pass',
      wit: ['a wandering trader', 'a local guide', 'a young digger', 'the camp medic'] },
    'frost-station': {
      roles: ['station chief', 'glaciologist', 'radio operator', 'mechanic', 'cook', 'medic', 'pilot', 'data analyst'],
      items: [['ice core sample', 'o'], ['satellite phone', 'o'], ['emergency flare gun', 'o'], ['survey drone', 'o'], ['sealed vial', 'o'], ['research logbook', 'd'], ['weather chart', 'd'], ['supply roster', 'd'], ['radio transmitter', 'm'], ['heating pump', 'm'], ['generator', 'm'], ['antenna mast', 'm']],
      places: ['lab hut', 'radio room', 'mess hall', 'generator shed', 'ice cellar', 'hangar'], surfaces: ['steel bench', 'frosted window', 'locker door', 'chart table'],
      alibi: ['sauna hut', 'mess hall', 'snowmobile bay', 'sleeping quarters', 'observation deck', 'greenhouse dome'], shops: ['Station Canteen', 'Polar Stores', 'Supply Depot Nine'], ticket: 'Polar Air Shuttle',
      wit: ['a visiting scientist', 'the base cook', 'a snow tech', 'the duty medic'] },
    'midnight-carnival': {
      roles: ['ringmaster', 'strongman', 'fortune teller', 'ticket seller', 'juggler', 'carousel keeper', 'clown', 'popcorn vendor'],
      items: [['golden ticket', 'o'], ['strongman trophy', 'o'], ['crystal ball', 'o'], ['prize teddy bear', 'o'], ['top hat', 'o'], ['act schedule', 'd'], ['fortune cards', 'd'], ['takings ledger', 'd'], ['carousel motor', 'm'], ['ferris wheel brake', 'm'], ['ticket booth lock', 'm'], ['light switchboard', 'm']],
      places: ['strongman booth', 'fortune tent', 'carousel', 'ticket booth', 'big top', 'prize stall'], surfaces: ['sawdust floor', 'booth counter', 'tent pole', 'painted sign'],
      alibi: ['ferris wheel', 'popcorn stand', 'big top ring', 'caravan row', 'hall of mirrors', 'ghost train'], shops: ['Sugar Spin Candy', 'Penny Arcade', 'Hot Chestnut Cart'], ticket: 'Carnival Admission',
      wit: ['a lost child\'s mother', 'a stilt walker', 'the lamplighter', 'a sleepy trumpeter'] },
    'cliffside-lighthouse': {
      roles: ['lighthouse keeper', 'fisherman', 'coastguard', 'cartographer', 'ferry pilot', 'supply boy', 'lamp engineer', 'village doctor'],
      items: [['brass telescope', 'o'], ['lens prism', 'o'], ['captain\'s watch', 'o'], ['storm barometer', 'o'], ['bronze bell', 'o'], ['keeper\'s log', 'd'], ['tide tables', 'd'], ['wreck report', 'd'], ['lamp mechanism', 'm'], ['foghorn', 'm'], ['signal shutter', 'm'], ['boat winch', 'm']],
      places: ['lamp room', 'keeper\'s cottage', 'oil store', 'boathouse', 'cliff stairs', 'cellar'], surfaces: ['iron stair', 'stone sill', 'oak table', 'brass rail'],
      alibi: ['harbour tavern', 'cove beach', 'fishing boat', 'chapel hill', 'chart room', 'village shop'], shops: ['Seagull Stores', 'Cove Bakery', 'Tidewater Tea'], ticket: 'Coastal Ferry',
      wit: ['a passing fisherman', 'a shepherd', 'a coastguard cadet', 'the baker\'s wife'] },
    'rail-yard': {
      roles: ['station master', 'signalman', 'engine driver', 'stoker', 'freight clerk', 'guard', 'porter', 'yard foreman'],
      items: [['mail sack', 'o'], ['payroll box', 'o'], ['railway lantern', 'o'], ['pocket watch', 'o'], ['sealed parcel', 'o'], ['freight manifest', 'd'], ['timetable', 'd'], ['signal log', 'd'], ['points lever', 'm'], ['coupling', 'm'], ['water crane', 'm'], ['signal arm', 'm']],
      places: ['signal box', 'freight shed', 'goods carriage', 'platform office', 'engine shed', 'water tower'], surfaces: ['iron rail', 'cab step', 'ticket counter', 'coal heap'],
      alibi: ['station cafe', 'waiting room', 'turntable', 'coal yard', 'ticket hall', 'footbridge'], shops: ['Platform Kiosk', 'Junction Tea Stall', 'Depot Provisions'], ticket: 'Midnight Express Line',
      wit: ['a sleeping passenger', 'the tea seller', 'a lamp boy', 'a night inspector'] },
    'hollow-monastery': {
      roles: ['abbot', 'librarian', 'bell ringer', 'herbalist', 'novice', 'cellarer', 'scribe', 'visiting bishop'],
      items: [['illuminated manuscript', 'o'], ['golden chalice', 'o'], ['silver reliquary', 'o'], ['ancient psalter', 'o'], ['carved crucifix', 'o'], ['abbey charter', 'd'], ['copied map', 'd'], ['donation ledger', 'd'], ['great bell', 'm'], ['library lock', 'm'], ['water pump', 'm'], ['candle press', 'm']],
      places: ['scriptorium', 'bell tower', 'cloister', 'sealed library', 'herb garden', 'crypt'], surfaces: ['reading desk', 'stone sill', 'prayer bench', 'iron grille'],
      alibi: ['refectory', 'chapel', 'orchard', 'dormitory', 'kitchen garden', 'gatehouse'], shops: ['Abbey Gate Stall', 'Brother Tomas Bakery', 'Pilgrim Provisions'], ticket: 'Pilgrim Road Coach',
      wit: ['a travelling pilgrim', 'a lay brother', 'a stonemason', 'a sleepy gatekeeper'] },
    'bayou-village': {
      roles: ['ferryman', 'swamp guide', 'herbalist', 'trapper', 'storekeeper', 'fiddler', 'boat builder', 'village elder'],
      items: [['river pearl', 'o'], ['carved totem', 'o'], ['alligator-tooth charm', 'o'], ['moonshine jar', 'o'], ['silver spoon set', 'o'], ['trading ledger', 'd'], ['hunting permit', 'd'], ['old swamp map', 'd'], ['boat motor', 'm'], ['stilt ladder', 'm'], ['fish trap', 'm'], ['hut lock', 'm']],
      places: ['stilt hut', 'trading post', 'boat shed', 'smokehouse', 'rope bridge', 'dock'], surfaces: ['plank floor', 'mossy rail', 'rope coil', 'wooden crate'],
      alibi: ['fiddle porch', 'fish market', 'cypress landing', 'church boat', 'cook shack', 'old well'], shops: ['Bayou Trading Post', 'Mama Joy\'s Kitchen', 'Reed & Rope Supply'], ticket: 'Bayou Ferry',
      wit: ['a passing trapper', 'a young net mender', 'the storekeeper\'s son', 'a travelling preacher'] },
    'moonlit-vineyard': {
      roles: ['vintner', 'cellar master', 'grape picker', 'wine merchant', 'estate cook', 'barrel maker', 'sommelier', 'farm manager'],
      items: [['prize vintage bottle', 'o'], ['silver corkscrew', 'o'], ['golden grape brooch', 'o'], ['tasting cup', 'o'], ['family seal ring', 'o'], ['harvest ledger', 'd'], ['blend recipe', 'd'], ['estate deed', 'd'], ['grape press', 'm'], ['cellar lock', 'm'], ['fermentation valve', 'm'], ['barrel hoist', 'm']],
      places: ['wine cellar', 'tasting room', 'press house', 'barrel store', 'farmhouse kitchen', 'vine terrace'], surfaces: ['oak barrel', 'tasting table', 'stone step', 'iron gate'],
      alibi: ['village inn', 'harvest dance', 'barn loft', 'orchard', 'chapel steps', 'market square'], shops: ['Valley Cheese Shop', 'Corkscrew Tavern', 'Market Bakery'], ticket: 'Harvest Festival',
      wit: ['a travelling musician', 'a neighbouring farmer', 'a fruit picker', 'the village baker'] }
  };

  const CRIMES = {
    o: ['Who stole {victim}\'s {item} from the {place}?', 'Who took the {item} from the {place} while {victim} was away?', 'Who swapped {victim}\'s {item} for a fake in the {place}?', 'Who hid the {item} that {victim} was guarding in the {place}?', 'Who slipped away with the {item} from the {place} during the commotion?', 'Who made {victim}\'s {item} disappear from the {place}?'],
    d: ['Who forged the {item} found in the {place}?', 'Who leaked {victim}\'s {item} from the {place}?', 'Who altered the {item} kept in the {place}?', 'Who swapped the pages of the {item} in the {place}?', 'Who copied {victim}\'s {item} in the {place} without permission?'],
    m: ['Who sabotaged the {item} at the {place}?', 'Who tampered with {victim}\'s {item} in the {place}?', 'Who broke the {item} at the {place} on purpose?', 'Who jammed the {item} at the {place} to cause trouble for {victim}?']
  };

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const cap = (s) => s.replace(/(^|[\s-])[a-z]/g, (m) => m.toUpperCase());   // not after an apostrophe: Captain's, not Captain'S
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);

  function generate(id, locs) {
    const loc = locs[id % locs.length], v = V[loc.id];
    const rng = mulberry((Math.imul(id + 1, 2654435761) ^ 0x5bd1e995) >>> 0);
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    // people
    const firsts = shuffle(FIRST), lasts = shuffle(LAST);
    const names = []; for (let i = 0; i < 6; i++) names.push(firsts[i] + ' ' + lasts[i]);
    const roles = shuffle(v.roles).slice(0, 4);
    const [fa, fb] = shuffle(FAM_KEYS);
    const grid = shuffle([[0, 0], [0, 1], [1, 0], [1, 1]]);
    const suspects = [0, 1, 2, 3].map(i => ({ name: names[i], role: roles[i], vals: grid[i], traits: [FAM[fa].p[grid[i][0]], FAM[fb].p[grid[i][1]]] }));
    const c = Math.floor(rng() * 4), culprit = suspects[c];
    const others = shuffle([0, 1, 2, 3].filter(i => i !== c));
    const [al1, al2, decoy] = others;
    const victim = names[4], witness = names[5];
    const wdesc = pick(v.wit), wsign = '\u2014 ' + witness + ', ' + wdesc;

    // crime
    const [itemName, cls] = pick(v.items), place = pick(v.places), surface = pick(v.surfaces);
    const ctx = { victim, item: itemName, place, surface };
    const qList = CRIMES[cls], qi = Math.floor(rng() * qList.length), question = fill(qList[qi], ctx);
    const tp = Math.floor(rng() * 3);
    const title = tp === 0 ? 'The ' + pick(ADJ) + ' ' + cap(itemName) : tp === 1 ? 'The ' + cap(itemName) + ' ' + pick(NOUN) : 'Trouble at the ' + cap(place);
    const hour = 6 + Math.floor(rng() * 5);
    const t1 = hour + ':00pm', t2 = (hour + 1) + ':00pm';
    const briefing = fill(pick(BRIEF[cls]), { ...ctx, t1, t2 }) + ' ' + pick(CLOSE) + (rng() < 0.6 ? ' ' + fill(pick(DETAIL), { ...ctx, wit: cap(wdesc.charAt(0)) + wdesc.slice(1) }) : '');
    const tm = () => hour + ':' + pick(['05', '15', '25', '35', '45', '55']) + 'pm';

    // trait clues
    const obs = (fam, val) => fill(pick(FAM[fam].o[val]), ctx);
    const wrapTrait = (type, text) => {
      if (type === 'letter') return { heading: 'Letter to the investigator', body: 'I was not sure whether to write, but I must. ' + text, sign: wsign };
      if (type === 'diary') return { heading: 'Diary page', body: 'Tonight I noticed something odd. ' + text, sign: wsign };
      if (type === 'photo') return { heading: 'Photograph', body: text, sign: '' };
      return { heading: 'Scribbled note', body: text, sign: '' };
    };
    const clues = [];
    for (const [fam, val] of [[fa, culprit.vals[0]], [fb, culprit.vals[1]]]) {
      const type = pick(['letter', 'note', 'photo', 'diary']);
      clues.push({ ...wrapTrait(type, obs(fam, val)), type, _t: 'trait' });
    }

    // alibi clues
    const alibiInfo = {};
    const alibi = (s) => {
      const type = pick(['receipt', 'ticket', 'photo', 'letter']), when = tm(), where = pick(v.alibi), shop = pick(v.shops);
      alibiInfo[s.name] = { when, whereText: type === 'receipt' ? shop : type === 'ticket' ? 'the ticket queue with my ' + v.ticket + ' ticket' : 'the ' + where };
      if (type === 'receipt') return { type, heading: shop, body: pick(PURCHASE) + '   ' + (1 + Math.floor(rng() * 9)) + '.' + pick(['20', '50', '75']) + '\n' + when + '\nCustomer: ' + s.name + '\nTHANK YOU', sign: '' };
      if (type === 'ticket') return { type, heading: v.ticket, body: 'ADMIT ONE\nHolder: ' + s.name + '\nStamped ' + when, sign: '' };
      if (type === 'photo') return { type, heading: 'Photograph', body: s.name + ' at the ' + where + '. A clock in the background shows ' + when + '.', sign: '' };
      return { type, heading: 'Letter', body: 'Thank you for keeping ' + s.name + ' company at the ' + where + '. They stayed with us until well past ' + when + '.', sign: wsign };
    };
    clues.push({ ...alibi(suspects[al1]), _t: 'alibi' });
    clues.push({ ...alibi(suspects[al2]), _t: 'alibi' });

    // motives
    const mc = pick([
      { type: 'letter', heading: 'Unsigned letter', body: 'To the ' + culprit.role + ': you know what I am owed. The ' + itemName + ' would settle the whole debt. Do it tonight and nobody will ever know.', sign: '\u2014 an anonymous creditor' },
      { type: 'letter', heading: 'Unsigned letter', body: 'Dear ' + culprit.role + ', after what they did to you, taking the ' + itemName + ' is only fair. Tonight, while the ' + place + ' is empty.', sign: '\u2014 a friend' },
      { type: 'diary', heading: 'Diary of the ' + culprit.role, body: 'I cannot stop thinking about the ' + itemName + '. They all think I would never dare. Nobody watches the ' + place + ' after dark.', sign: '' }
    ]);
    clues.push({ ...mc, _t: 'motive' });
    const dn = suspects[decoy].name;
    const md = pick([
      { type: 'letter', heading: 'Letter', body: dn + ', I will never forgive what happened with the ' + itemName + '. But I gave my word to leave it to the courts, and I keep my word.', sign: '\u2014 a relative' },
      { type: 'diary', heading: 'Diary of ' + dn, body: 'Furious about the ' + itemName + ' today. I said exactly what I think, loudly, in front of everyone. Nothing more than that, I promise myself.', sign: '' },
      { type: 'note', heading: 'Scribbled note', body: 'Overheard ' + dn + ' shouting about the ' + itemName + ' in the ' + place + '. Loud, but harmless, I would say. They stormed off to bed.', sign: '' }
    ]);
    clues.push({ ...md, _t: 'motive-decoy' });

    // place clues on random anchors
    const anchors = shuffle(loc.anchors).slice(0, 7);
    const out = shuffle(clues).map((cl, i) => ({
      id: 'c' + i, type: cl.type, anchor: anchors[i].id, x: anchors[i].x, z: anchors[i].z, label: anchors[i].label,
      heading: cl.heading, body: cl.body, sign: cl.sign || ''
    }));

    // a spare clue that appears mid-round (the 'bell' event): a second witness note about one of the culprit's traits
    const bonus = { id: 'cB', type: 'note', anchor: anchors[6].id, x: anchors[6].x, z: anchors[6].z, label: anchors[6].label, heading: 'Torn note', body: obs(fb, culprit.vals[1]), sign: '' };

    // what each suspect says when questioned. Innocents are honest (one even helps); the culprit lies about a trait and accuses the decoy.
    const T = (fam, val) => FAM[fam].p[val], fakeWhere = pick(v.alibi);
    const npcs = suspects.map((s, i) => {
      const info = alibiInfo[s.name], nothing = 'Compare the four of us against the clues. I have nothing to hide.';
      if (i === c) return { name: s.name, role: s.role, lines: { where: 'I was at the ' + fakeWhere + ' all evening. I never went near the ' + place + '.', saw: 'Whoever did it ' + T(fb, 1 - culprit.vals[1]) + ', I am fairly sure.', suspect: 'If you ask me, ' + dn + ' had the most reason. Everyone knows that temper.' } };
      if (i === al1) return { name: s.name, role: s.role, lines: { where: 'I was at ' + info.whereText + ' until well past ' + info.when + '. The proof is somewhere on these grounds.', saw: 'I cannot name anyone, but whoever did it ' + T(fa, culprit.vals[0]) + '. I would stake my name on that.', suspect: nothing } };
      if (i === al2) return { name: s.name, role: s.role, lines: { where: 'I was at ' + info.whereText + ' until well past ' + info.when + '. The proof is somewhere on these grounds.', saw: 'I saw ' + suspects[al1].name + ' at ' + alibiInfo[suspects[al1].name].whereText + ' that evening, so I doubt it was them.', suspect: nothing } };
      return { name: s.name, role: s.role, lines: { where: 'Nowhere special. I was angry about the ' + itemName + ' and stormed off alone. Nobody can vouch for me, I admit.', saw: 'I was too busy being furious to notice anything useful.', suspect: 'Everyone will point at me because of my temper. Do not be fooled by shouting.' } };
    });

    const opts = suspects.map(s => s.name + ', the ' + s.role);
    const explanation = culprit.name + ' is the only suspect who ' + culprit.traits[0] + ' and ' + culprit.traits[1] + '. ' +
      suspects[al1].name + ' and ' + suspects[al2].name + ' were cleared by their alibis, and ' + dn + '\'s anger was only a red herring.';
    const meta = { id, loc: loc.id, item: itemName, place, q: cls + qi, fams: [fa, fb].sort().join('+'), role: culprit.role, culprit: culprit.name, title };
    return {
      id, locId: loc.id, title, question, briefing, meta, npcs, bonus,
      suspects: suspects.map(s => ({ name: s.name, role: s.role, traits: s.traits })),
      options: opts, answer: c, explanation, clues: out,
      debug: { culprit: c, fams: [fa, fb], vals: culprit.vals, grid: suspects.map(s => s.vals) }
    };
  }

  /* ---------- picking: never the same case twice, and never a *similar* case twice in a row ----------
     recent: metas of cases played lately, oldest first (an entry may carry boost > 1 to count extra).
     Draws `tries` random candidates and keeps the one least like anything recent (map, item, place,
     question wording, culprit, title). The map is the strongest signal: the last map is almost never repeated. */
  const WEIGHT = { item: 2.6, place: 1.4, q: 2.2, fams: 1.3, role: 0.9, culprit: 1.6, title: 2.4 };
  const LOC_BY_AGE = [60, 14, 6, 3];
  function penalty(m, recent) {
    let p = 0;
    for (let k = recent.length - 1, age = 0; k >= 0; k--, age++) {
      const h = recent[k], w = Math.pow(0.88, age) * (h.boost || 1);
      if (h.loc === m.loc) p += (age < LOC_BY_AGE.length ? LOC_BY_AGE[age] : 1.2) * (h.boost || 1);
      for (const key in WEIGHT) if (h[key] === m[key]) p += WEIGHT[key] * w;
    }
    return p;
  }
  function pickFresh(o) {
    const { locs, recent = [], banned = null, rand = Math.random, tries = 36 } = o;
    const seenIds = new Set(), cands = [];
    for (let i = 0; cands.length < tries && i < tries * 12; i++) {
      const id = Math.floor(rand() * TOTAL);
      if (seenIds.has(id) || (banned && banned.has(id))) continue;
      seenIds.add(id); cands.push(generate(id, locs));
    }
    if (!cands.length) cands.push(generate(Math.floor(rand() * TOTAL), locs));   // everything was banned: allow a repeat
    let best = null, bestScore = Infinity;
    for (const m of cands) { const sc = penalty(m.meta, recent) + rand() * 0.6; if (sc < bestScore) { best = m; bestScore = sc; } }
    return best;
  }

  /* ---------- weather + timed events (shared by the server and the solo page) ---------- */
  const WEATHER = { 'frost-station': ['snow', 'snow', 'wind', 'clear'], 'desert-dig': ['wind', 'clear', 'clear'], 'foggy-harbor': ['fog', 'rain', 'fog', 'clear'], 'bayou-village': ['fog', 'rain', 'clear'], 'default': ['clear', 'rain', 'fog', 'wind'] };
  const pickWeather = (locId, rand = Math.random) => { const l = WEATHER[locId] || WEATHER.default; return l[Math.floor(rand() * l.length)]; };
  // seconds after the round starts
  const EVENT_PLAN = [{ at: 100, kind: 'wind' }, { at: 180, kind: 'flicker' }, { at: 270, kind: 'bonus' }, { at: 360, kind: 'scream' }, { at: 450, kind: 'thunder' }, { at: 540, kind: 'warning' }];

  return { TOTAL, generate, pickFresh, penalty, pickWeather, EVENT_PLAN };
});
