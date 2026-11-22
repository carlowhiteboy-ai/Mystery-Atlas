/* Mystery creator: a full-screen form for writing your own case.
   openCreator({ save(case) -> Promise<{ok, errors}>, mine?() -> Promise<list>, remove?(id), solo?, onClose? }) */
import { makeDoc } from './evidence.js';

const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in props) { if (k === 'class') e.className = props[k]; else if (k.startsWith('on')) e[k] = props[k]; else if (k === 'value') e.value = props[k]; else e.setAttribute(k, props[k]); }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const blank = () => ({ locId: 'blackwood-manor', title: '', question: '', briefing: '', explanation: '', culprit: -1,
  suspects: [0, 1, 2, 3].map(() => ({ name: '', role: '', where: '', saw: '' })), clues: [] });
const TYPE_LABEL = { letter: 'Letter', diary: 'Diary page', note: 'Scribbled note', photo: 'Photograph', receipt: 'Receipt', ticket: 'Ticket' };

export function openCreator(opts) {
  const MAPS = window.MAPS, C = window.MACUSTOM;
  let st; try { st = JSON.parse(localStorage.getItem('ma_draft') || 'null'); } catch (e) { st = null; }
  if (!st || !Array.isArray(st.suspects) || st.suspects.length !== 4) st = blank();
  st.clues = st.clues || [];
  const loc = () => MAPS.find(m => m.id === st.locId) || MAPS[0];
  const root = h('div', { id: 'creator' }), card = h('div', { class: 'card cr' });
  root.append(card); document.body.append(root);
  const close = () => { root.remove(); document.body.classList.remove('creating'); if (opts.onClose) opts.onClose(); };
  const bind = (el, obj, key) => { el.value = obj[key] || ''; el.oninput = () => { obj[key] = el.value; refresh(); }; return el; };
  const field = (label, el, hint) => h('div', { class: 'field' }, h('label', {}, label), el, hint ? h('div', { class: 'small' }, hint) : null);

  /* ----- static parts ----- */
  const mapSel = h('select', { onchange: () => { st.locId = mapSel.value; st.clues.forEach(k => { k.anchor = ''; }); renderClues(); refresh(); } },
    MAPS.map(m => h('option', { value: m.id }, m.name))); mapSel.value = st.locId;
  const title = bind(h('input', { maxlength: C.LIM.title, placeholder: 'The Missing Compass' }), st, 'title');
  const question = bind(h('input', { maxlength: C.LIM.question, placeholder: 'Who took the silver compass from the boat store?' }), st, 'question');
  const briefing = bind(h('textarea', { maxlength: C.LIM.briefing, placeholder: 'Optional: what happened, and when. Shown at the start.' }), st, 'briefing');
  const explanation = bind(h('textarea', { maxlength: C.LIM.explanation, placeholder: 'How the clues lead to the culprit. Shown when the case ends.' }), st, 'explanation');

  const susBox = h('div');
  st.suspects.forEach((s, i) => {
    const radio = h('input', { type: 'radio', name: 'culprit', onchange: () => { st.culprit = i; refresh(); } }); radio.checked = st.culprit === i; radio.style.width = 'auto';
    const nm = bind(h('input', { maxlength: C.LIM.name, placeholder: 'Name' }), s, 'name'); nm.onchange = () => renderClues();
    susBox.append(h('div', { class: 'sus' },
      h('div', { class: 'top' }, h('b', {}, 'Suspect ' + (i + 1)), h('label', { style: 'margin:0 0 0 auto;display:flex;gap:6px;align-items:center' }, radio, 'This is the culprit')),
      h('div', { class: 'grid2' }, nm, bind(h('input', { maxlength: C.LIM.role, placeholder: 'Role (butler, ferryman...)' }), s, 'role')),
      h('div', { class: 'grid2', style: 'margin-top:6px' },
        bind(h('input', { maxlength: C.LIM.statement, placeholder: 'If asked "Where were you?" they say...' }), s, 'where'),
        bind(h('input', { maxlength: C.LIM.statement, placeholder: 'If asked "What did you notice?" they say...' }), s, 'saw'))));
  });

  const clueBox = h('div'), addBtn = h('button', { onclick: () => { if (st.clues.length < C.MAX_CLUES) { st.clues.push({ type: 'note', anchor: '', heading: '', body: '', sign: '', clears: [], points: [] }); renderClues(); refresh(); } } }, 'Add a clue');
  function renderClues() {
    clueBox.innerHTML = '';
    const used = (idx) => new Set(st.clues.filter((_, j) => j !== idx).map(k => k.anchor));
    st.clues.forEach((k, i) => {
      const typeSel = h('select', { onchange: () => { k.type = typeSel.value; refresh(); } }, C.TYPES.map(t => h('option', { value: t }, TYPE_LABEL[t]))); typeSel.value = k.type;
      const taken = used(i), spot = h('select', { onchange: () => { k.anchor = spot.value; renderClues(); refresh(); } },
        h('option', { value: '' }, 'Where is it hidden?'), loc().anchors.map(a => h('option', { value: a.id, ...(taken.has(a.id) ? { disabled: '' } : {}) }, a.label + (taken.has(a.id) ? ' (taken)' : ''))));
      spot.value = k.anchor;
      const tag = (key) => h('div', { class: 'tags' }, h('span', {}, key === 'clears' ? 'Clears (an alibi for):' : 'Points at:'), st.suspects.map((s, j) => {
        const cb = h('input', { type: 'checkbox', onchange: () => { k[key] = cb.checked ? [...new Set([...k[key], j])] : k[key].filter(x => x !== j); refresh(); } }); cb.checked = k[key].includes(j);
        return h('label', {}, cb, s.name || 'Suspect ' + (j + 1));
      }));
      const prev = h('button', { onclick: () => preview(k) }, 'Preview');
      const del = h('button', { onclick: () => { st.clues.splice(i, 1); renderClues(); refresh(); } }, 'Remove');
      clueBox.append(h('div', { class: 'clue' },
        h('div', { class: 'top' }, h('b', {}, 'Clue ' + (i + 1)), h('span', { style: 'margin-left:auto;display:flex;gap:6px' }, prev, del)),
        h('div', { class: 'grid2' }, typeSel, spot),
        h('div', { class: 'grid2', style: 'margin-top:6px' }, bind(h('input', { maxlength: C.LIM.heading, placeholder: 'Heading (e.g. Letter to the investigator)' }), k, 'heading'), bind(h('input', { maxlength: C.LIM.sign, placeholder: 'Signed by (optional)' }), k, 'sign')),
        h('div', { style: 'margin-top:6px' }, bind(h('textarea', { maxlength: C.LIM.body, placeholder: 'What the clue says. Receipts and tickets can use several lines.' }), k, 'body')),
        tag('clears'), tag('points')));
    });
    addBtn.disabled = st.clues.length >= C.MAX_CLUES;
  }
  function preview(k) {
    const cv = makeDoc({ id: 'preview', type: k.type, heading: k.heading || 'Evidence', body: k.body || '(empty)', sign: k.sign || '', label: (loc().anchors.find(a => a.id === k.anchor) || {}).label || '' });
    cv.style.cssText = 'max-height:80vh;max-width:92vw;object-fit:contain;border-radius:4px;box-shadow:0 10px 50px #000';
    const o = h('div', { id: 'crPreview', onclick: () => o.remove() }, cv, h('button', { class: 'primary' }, 'Close')); document.body.append(o);
  }

  const checkBox = h('div', { class: 'check' }), publish = h('button', { class: 'primary', onclick: doPublish }, 'Publish'), msg = h('div', { class: 'small', style: 'margin-top:8px' });
  function refresh() {
    try { localStorage.setItem('ma_draft', JSON.stringify(st)); } catch (e) { /* private mode */ }
    const v = C.validate(st, MAPS);
    checkBox.className = 'check ' + (v.ok ? 'good' : 'bad'); checkBox.innerHTML = '';
    checkBox.append(v.ok ? 'Ready to publish. Everything adds up: the culprit can be found, and every innocent can be cleared.' : h('div', {}, 'Still to do:', h('ul', {}, v.errors.map(e => h('li', {}, e)))));
    publish.disabled = !v.ok;
  }
  async function doPublish() {
    const v = C.validate(st, MAPS); if (!v.ok) return;
    publish.disabled = true; msg.textContent = 'Publishing…';
    const r = await opts.save(v.clean);
    if (r && r.ok) { try { localStorage.removeItem('ma_draft'); } catch (e) { /* ignore */ } msg.textContent = ''; alert('Published! It will start appearing in rounds.'); close(); }
    else { msg.textContent = (r && r.errors && r.errors.join(' ')) || 'Could not publish. Try again.'; publish.disabled = false; }
  }

  const mineBox = h('div', { class: 'mine' });
  async function renderMine() {
    if (!opts.mine) return; mineBox.innerHTML = '';
    let list = []; try { list = await opts.mine(); } catch (e) { /* offline */ }
    mineBox.append(h('h3', {}, 'My published mysteries'));
    if (!list.length) mineBox.append(h('div', { class: 'small' }, 'None yet.'));
    list.forEach(c => mineBox.append(h('div', { class: 'item' }, h('span', {}, c.title + ' · ' + (MAPS.find(m => m.id === c.locId) || {}).name + (c.likes != null ? ' · ' + c.likes + ' likes' : '') + (c.hidden ? ' · hidden (reported)' : '')),
      h('button', { onclick: async () => { if (confirm('Delete "' + c.title + '"?')) { await opts.remove(c.id); renderMine(); } } }, 'Delete'))));
  }

  const extra = opts.solo ? h('div', { class: 'row tight', style: 'margin-top:8px' },
    h('button', { onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(C.sanitize(st), null, 1)], { type: 'application/json' })), download: 'mystery.json' }); a.click(); } }, 'Export file'),
    h('button', { onclick: () => imp.click() }, 'Import file')) : null;
  const imp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async () => {
    try { const o = JSON.parse(await imp.files[0].text()); st = Object.assign(blank(), C.sanitize(o)); while (st.suspects.length < 4) st.suspects.push({ name: '', role: '', where: '', saw: '' }); close(); openCreator(opts); try { localStorage.setItem('ma_draft', JSON.stringify(st)); } catch (e) { /* ignore */ } } catch (e) { msg.textContent = 'That file is not a mystery.'; }
  } });

  card.append(
    h('h2', {}, 'Create a mystery'),
    h('p', { class: 'small' }, 'Pick a map, write the case, then place at least 4 clues. Tag each clue with who it clears (an alibi) or who it points at. The game uses those tags to make sure your mystery can really be solved. Players never see them.'),
    field('Map', mapSel), field('Title', title), field('Question', question, 'Must end with a question mark.'), field('Briefing', briefing), field('Explanation', explanation),
    h('h3', {}, 'Suspects (exactly 4)'), susBox,
    h('h3', {}, 'Clues (4 to 6)'), clueBox, addBtn,
    checkBox, h('div', { class: 'row tight' }, publish, h('button', { onclick: close }, 'Close')), msg, extra, imp, mineBox);
  renderClues(); refresh(); renderMine(); root.scrollTop = 0; document.body.classList.add('creating');
}
