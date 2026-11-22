/* Evidence renderer: draws real-looking documents on <canvas> (no image files needed).
   makeDoc(clue)  -> full readable document (letter, diary page, scrap note, receipt, ticket, polaroid photo)
   makeProp(type) -> the unopened object that lies in the 3D world (sealed envelope, closed diary, ...) */
const HAND = "'Caveat', 'Segoe Script', 'Bradley Hand', cursive";
const TYPE = "'Special Elite', 'Courier New', monospace";
const SERIF = "'Cinzel Decorative', Georgia, serif";

function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function grain(ctx, w, h, r, n, alpha, dark = true) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = dark ? `rgba(60,40,20,${r() * alpha})` : `rgba(255,255,255,${r() * alpha})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
function stain(ctx, x, y, rad, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, `rgba(120,80,30,${a})`); g.addColorStop(1, 'rgba(120,80,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
}
function coffeeRing(ctx, x, y, rad) {
  ctx.strokeStyle = 'rgba(110,70,30,.35)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, rad, 0.2, 5.9); ctx.stroke();
  ctx.strokeStyle = 'rgba(110,70,30,.18)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(x, y, rad - 4, 0.2, 5.5); ctx.stroke();
}
function edgeShade(ctx, w, h, a = 0.45) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(60,35,10,0)'); g.addColorStop(1, `rgba(60,35,10,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function folds(ctx, w, h) {
  for (const y of [h / 3, (2 * h) / 3]) {
    const g = ctx.createLinearGradient(0, y - 8, 0, y + 8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(70,45,20,.22)'); g.addColorStop(1, 'rgba(255,255,255,.12)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 8, w, 16);
  }
}
function tornEdge(ctx, w, h, r, inset, fill) {
  ctx.beginPath(); ctx.moveTo(inset, inset);
  for (let x = inset; x <= w - inset; x += 10) ctx.lineTo(x, inset + r() * 6);
  for (let y = inset; y <= h - inset; y += 10) ctx.lineTo(w - inset - r() * 6, y);
  for (let x = w - inset; x >= inset; x -= 10) ctx.lineTo(x, h - inset - r() * 6);
  for (let y = h - inset; y >= inset; y -= 10) ctx.lineTo(inset + r() * 6, y);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function handText(ctx, text, x, y, maxW, lineH, size, color, r, wobble = 1.6) {
  ctx.font = `${size}px ${HAND}`; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, text, maxW);
  lines.forEach((ln, i) => {
    ctx.save(); ctx.translate(x + (r() - 0.5) * 4, y + i * lineH + (r() - 0.5) * wobble); ctx.rotate((r() - 0.5) * 0.012);
    ctx.fillText(ln, 0, 0); ctx.restore();
  });
  return y + lines.length * lineH;
}
function waxSeal(ctx, x, y, rad, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#7d1414'; ctx.beginPath();
  for (let a = 0; a < Math.PI * 2; a += 0.3) { const k = rad * (0.92 + r() * 0.16); ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
  ctx.closePath(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#a02424'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, rad * 0.62, 0, 7); ctx.stroke();
  ctx.fillStyle = '#a02424'; ctx.font = `${rad}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', 0, 2);
  ctx.restore(); ctx.textAlign = 'left';
}

/* ---------------- LETTER ---------------- */
function letter(c, r) {
  const w = 620, h = 780, cv = canvas(w, h), ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#efe2c4'); g.addColorStop(1, '#dfcda6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, r, 2600, 0.18); stain(ctx, 90 + r() * 400, 120 + r() * 500, 70 + r() * 60, 0.22); stain(ctx, 400, 650, 90, 0.16);
  folds(ctx, w, h); coffeeRing(ctx, 450 + r() * 80, 600 + r() * 80, 44);
  ctx.fillStyle = 'rgba(60,40,20,.55)'; ctx.font = `15px ${TYPE}`; ctx.fillText('~ ' + (c.heading || 'Letter').toUpperCase() + ' ~', 56, 58);
  ctx.strokeStyle = 'rgba(60,40,20,.35)'; ctx.beginPath(); ctx.moveTo(56, 70); ctx.lineTo(w - 56, 70); ctx.stroke();
  let y = handText(ctx, 'Dear Detective,', 60, 120, w - 120, 40, 36, '#1d2a4a', r);
  y = handText(ctx, c.body, 60, y + 14, w - 120, 38, 33, '#1d2a4a', r) + 18;
  if (c.sign) handText(ctx, c.sign.replace(/^\u2014\s*/, 'Yours, '), 120, Math.min(y + 24, h - 70), w - 180, 34, 33, '#15234a', r);
  if (r() > 0.4) waxSeal(ctx, w - 100, h - 74, 30, r);
  // ink blot
  ctx.fillStyle = 'rgba(20,30,70,.65)'; ctx.beginPath(); ctx.arc(70 + r() * 480, 200 + r() * 400, 3 + r() * 4, 0, 7); ctx.fill();
  edgeShade(ctx, w, h); return cv;
}

/* ---------------- DIARY ---------------- */
function diary(c, r) {
  const w = 640, h = 780, cv = canvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = '#f0e6cd'; ctx.fillRect(0, 0, w, h); grain(ctx, w, h, r, 2000, 0.14);
  ctx.strokeStyle = 'rgba(80,120,170,.35)'; ctx.lineWidth = 1.3;
  for (let y = 150; y < h - 30; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(190,60,60,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(84, 0); ctx.lineTo(84, h); ctx.stroke();
  for (const y of [130, 390, 650]) { ctx.fillStyle = '#2a1c10'; ctx.beginPath(); ctx.arc(34, y, 12, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(36, y + 2, 12, 0, 7); ctx.fill(); }
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  ctx.fillStyle = '#3a2a1a'; ctx.font = `26px ${SERIF}`; ctx.fillText((c.heading || 'Diary').replace(/^Diary of /, 'Diary of '), 104, 60);
  ctx.font = `30px ${HAND}`; ctx.fillStyle = '#4a3220'; ctx.fillText(days[Math.floor(r() * 7)] + ' night', 104, 108);
  handText(ctx, c.body, 104, 188, w - 160, 38, 31, '#2c1d12', r, 2.2);
  stain(ctx, 480, 640, 80, 0.18); coffeeRing(ctx, 120 + r() * 100, 650 + r() * 60, 38);
  ctx.fillStyle = 'rgba(40,30,20,.5)'; ctx.font = `20px ${HAND}`; ctx.fillText(String(12 + Math.floor(r() * 180)), w - 70, h - 24);
  edgeShade(ctx, w, h, 0.4); return cv;
}

/* ---------------- SCRAP NOTE ---------------- */
function note(c, r) {
  const w = 600, h = 420, cv = canvas(w, h), ctx = cv.getContext('2d');
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 14;
  tornEdge(ctx, w, h, r, 16, '#e8dfc6'); ctx.shadowColor = 'transparent';
  ctx.save(); ctx.clip(); ctx.restore();
  grain(ctx, w, h, r, 1400, 0.16); stain(ctx, 480, 90, 60, 0.18);
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(30, 52); ctx.lineTo(w - 30, 52); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.font = `14px ${TYPE}`; ctx.fillText((c.heading || 'Note').toUpperCase(), 40, 44);
  handText(ctx, c.body, 42, 98, w - 90, 36, 30, '#3a3a3e', r, 3);
  // pencil smudge + pin
  ctx.fillStyle = 'rgba(70,70,75,.12)'; ctx.beginPath(); ctx.ellipse(360, 320, 80, 14, 0.2, 0, 7); ctx.fill();
  ctx.fillStyle = '#b02a2a'; ctx.beginPath(); ctx.arc(w / 2, 24, 9, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(w / 2 - 3, 21, 3, 0, 7); ctx.fill();
  return cv;
}

/* ---------------- RECEIPT ---------------- */
function receipt(c, r) {
  const w = 400, h = 640, cv = canvas(w, h), ctx = cv.getContext('2d');
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(14, 10);
  for (let x = 14; x <= w - 14; x += 14) ctx.lineTo(x, x % 28 ? 2 : 14);
  ctx.lineTo(w - 14, h - 14);
  for (let x = w - 14; x >= 14; x -= 14) ctx.lineTo(x, x % 28 ? h - 2 : h - 14);
  ctx.closePath(); ctx.fillStyle = '#f6f3ea'; ctx.fill(); ctx.shadowColor = 'transparent';
  grain(ctx, w, h, r, 700, 0.1);
  const lines = String(c.body).split('\n'), ink = '#2b2b2b';
  ctx.textAlign = 'center'; ctx.fillStyle = ink; ctx.font = `bold 25px ${TYPE}`;
  wrap(ctx, (c.heading || 'GENERAL STORE').toUpperCase(), w - 70).forEach((l, i) => ctx.fillText(l, w / 2, 62 + i * 30));
  ctx.font = `15px ${TYPE}`; ctx.fillText('No. ' + (1000 + Math.floor(r() * 8999)) + '  *  Open late', w / 2, 128);
  ctx.textAlign = 'left'; ctx.font = `19px ${TYPE}`;
  const dash = () => '-'.repeat(32);
  ctx.fillText(dash(), 28, 160);
  let y = 196;
  const first = (lines[0] || '').split(/\s{3,}/);
  ctx.fillText(first[0] || '', 30, y); ctx.textAlign = 'right'; ctx.fillText('$' + (first[1] || ''), w - 30, y); ctx.textAlign = 'left'; y += 34;
  ctx.fillText('TAX', 30, y); ctx.textAlign = 'right'; ctx.fillText('$0.00', w - 30, y); ctx.textAlign = 'left'; y += 28;
  ctx.fillText(dash(), 28, y); y += 36;
  for (const ln of lines.slice(1)) { if (ln === 'THANK YOU') continue; ctx.font = `19px ${TYPE}`; wrap(ctx, ln, w - 60).forEach(l => { ctx.fillText(l, 30, y); y += 30; }); }
  ctx.fillText(dash(), 28, y); y += 40;
  ctx.textAlign = 'center'; ctx.font = `bold 21px ${TYPE}`; ctx.fillText('THANK YOU', w / 2, y); y += 36;
  for (let x = 60, i = 0; x < w - 60; i++) { const bw = 1 + Math.floor(r() * 4); ctx.fillStyle = ink; ctx.fillRect(x, y, bw, 54); x += bw + 1 + Math.floor(r() * 3); }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(40,20,0,.07)'; ctx.fillRect(0, 0, w, h);
  coffeeRing(ctx, 300, 540, 34); return cv;
}

/* ---------------- TICKET ---------------- */
function ticket(c, r) {
  const w = 760, h = 320, cv = canvas(w, h), ctx = cv.getContext('2d');
  const cols = [['#c9a24a', '#8a6a1c'], ['#c0504a', '#7a2420'], ['#4a8aa8', '#1e4a68'], ['#7aa86a', '#3a6a2e']];
  const [c1, c2] = cols[Math.floor(r() * cols.length)];
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.roundRect(14, 14, w - 28, h - 28, 12); ctx.fillStyle = c1; ctx.fill(); ctx.shadowColor = 'transparent';
  // notches
  ctx.globalCompositeOperation = 'destination-out';
  for (const [x, y] of [[14, h / 2], [w - 14, h / 2], [w * 0.74, 14], [w * 0.74, h - 14]]) { ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = c2; ctx.lineWidth = 4; ctx.strokeRect(34, 34, w * 0.74 - 56, h - 68);
  ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(w * 0.74, 30); ctx.lineTo(w * 0.74, h - 30); ctx.stroke(); ctx.setLineDash([]);
  grain(ctx, w, h, r, 1500, 0.2);
  const lines = String(c.body).split('\n');
  ctx.fillStyle = '#2a1a08'; ctx.textAlign = 'center';
  ctx.font = `22px ${SERIF}`; ctx.fillText((c.heading || 'ADMISSION').toUpperCase(), w * 0.37 - 4, 82);
  ctx.font = `bold 60px ${TYPE}`; ctx.fillText(lines[0] || 'ADMIT ONE', w * 0.37 - 4, 160);
  ctx.font = `26px ${TYPE}`; ctx.fillText(lines[1] || '', w * 0.37 - 4, 204);
  // inked stamp
  const stampText = (lines[2] || '').replace('Stamped ', '');
  ctx.save(); ctx.translate(w * 0.5, 246); ctx.rotate(-0.14);
  ctx.strokeStyle = 'rgba(60,20,110,.78)'; ctx.fillStyle = 'rgba(60,20,110,.78)'; ctx.lineWidth = 4; ctx.strokeRect(-110, -26, 220, 52);
  ctx.font = `bold 28px ${TYPE}`; ctx.fillText('STAMPED ' + stampText, 0, 10); ctx.restore();
  // stub
  ctx.save(); ctx.translate(w * 0.87, h / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#2a1a08'; ctx.font = `bold 34px ${TYPE}`;
  ctx.fillText('No. ' + (10000 + Math.floor(r() * 89999)), 0, 0); ctx.restore();
  ctx.textAlign = 'left'; edgeShade(ctx, w, h, 0.3); return cv;
}

/* ---------------- PHOTOGRAPH ---------------- */
function parseClock(text) {
  const m = /(\d{1,2}):(\d\d)\s*pm/i.exec(text); if (!m) return null;
  return { h: +m[1] % 12, m: +m[2] };
}
function drawClock(ctx, x, y, rad, t) {
  ctx.fillStyle = '#d9c9a2'; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 5; ctx.stroke();
  ctx.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * rad * 0.82, y - Math.cos(a) * rad * 0.82); ctx.lineTo(x + Math.sin(a) * rad * 0.94, y - Math.cos(a) * rad * 0.94); ctx.stroke(); }
  const ha = ((t.h + t.m / 60) / 12) * 6.283, ma = (t.m / 60) * 6.283;
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(ha) * rad * 0.5, y - Math.cos(ha) * rad * 0.5); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(ma) * rad * 0.78, y - Math.cos(ma) * rad * 0.78); ctx.stroke();
}
function figure(ctx, x, y, s, shade) {
  ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(x, y - 112 * s, 17 * s, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 30 * s, y); ctx.quadraticCurveTo(x - 34 * s, y - 92 * s, x, y - 94 * s); ctx.quadraticCurveTo(x + 34 * s, y - 92 * s, x + 30 * s, y); ctx.closePath(); ctx.fill();
}
function photo(c, r) {
  const w = 560, h = 680, cv = canvas(w, h), ctx = cv.getContext('2d');
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 16; ctx.fillStyle = '#efe9da'; ctx.fillRect(18, 14, w - 36, h - 28); ctx.shadowColor = 'transparent';
  const px = 46, py = 42, pw = w - 92, ph = 450;
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  const text = c.body.toLowerCase();
  // backdrop: wall + floor
  const sky = ctx.createLinearGradient(0, py, 0, py + ph); sky.addColorStop(0, '#8a7352'); sky.addColorStop(0.62, '#5e4b32'); sky.addColorStop(0.62, '#403222'); sky.addColorStop(1, '#2a2016');
  ctx.fillStyle = sky; ctx.fillRect(px, py, pw, ph);
  // window + silhouette skyline
  ctx.fillStyle = '#b09a6a'; ctx.fillRect(px + 40 + r() * 40, py + 40, 120, 150);
  ctx.strokeStyle = '#3a2c1a'; ctx.lineWidth = 6; ctx.strokeRect(px + 60, py + 40, 120, 150); ctx.beginPath(); ctx.moveTo(px + 120, py + 40); ctx.lineTo(px + 120, py + 190); ctx.moveTo(px + 60, py + 115); ctx.lineTo(px + 180, py + 115); ctx.stroke();
  const clock = parseClock(c.body);
  if (clock) drawClock(ctx, px + pw - 90, py + 90, 52, clock);
  const floorY = py + ph * 0.62;
  const hasName = /^[A-Z][a-z]+ [A-Z][a-z]+ at the /.test(c.body);
  if (hasName) { figure(ctx, px + pw * 0.45, floorY + 130, 1.55, '#1c140c'); }
  else if (/boot|shoe|heel|mud|soil|prints?|trodden|scuff/.test(text)) {
    const muddy = /boot|mud|soil/.test(text);
    for (let i = 0; i < 6; i++) { const fx = px + 80 + i * 66, fy = floorY + 60 + (i % 2) * 54 + r() * 10; ctx.fillStyle = muddy ? '#150f09' : '#241a10'; ctx.beginPath(); ctx.ellipse(fx, fy, muddy ? 24 : 15, muddy ? 40 : 34, 0.1, 0, 7); ctx.fill(); if (!muddy) { ctx.fillRect(fx - 6, fy + 36, 12, 12); } }
    ctx.fillStyle = 'rgba(20,12,5,.45)'; for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.arc(px + r() * pw, floorY + 20 + r() * 150, 2 + r() * 5, 0, 7); ctx.fill(); }
  } else if (/hair|strand/.test(text)) {
    const col = /red|copper/.test(text) ? '#6e2c12' : '#cfc7b2';
    ctx.fillStyle = '#3a2c1c'; ctx.fillRect(px, floorY - 20, pw, 220); ctx.strokeStyle = col; ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px + 60, floorY + 60 + k * 40); ctx.bezierCurveTo(px + 160, floorY - 10 + k * 40, px + 260, floorY + 140 + k * 20, px + pw - 50, floorY + 50 + k * 30); ctx.stroke(); }
  } else if (/wool|thread|tweed|fibre|scrap|nail|green|red/.test(text)) {
    const col = /green/.test(text) ? '#3c5a34' : '#7a2a22';
    ctx.fillStyle = '#4a3a24'; ctx.fillRect(px + pw * 0.4, py, 150, floorY - py); ctx.fillStyle = '#9a9aa0'; ctx.fillRect(px + pw * 0.4 + 70, py + 150, 8, 26);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px + pw * 0.4 + 74, py + 170); ctx.lineTo(px + pw * 0.4 + 118, py + 250); ctx.lineTo(px + pw * 0.4 + 96, py + 262); ctx.lineTo(px + pw * 0.4 + 58, py + 238); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(px + pw * 0.4 + 90, py + 240); ctx.lineTo(px + pw * 0.4 + 70 + r() * 50, py + 270 + r() * 24); ctx.stroke(); }
  } else if (/perfume|lavender|pipe|tobacco|smoke|ash|handkerchief|smell/.test(text)) {
    ctx.fillStyle = '#d6cbb2'; ctx.save(); ctx.translate(px + pw / 2, floorY + 90); ctx.rotate(-0.25); ctx.fillRect(-70, -50, 140, 100); ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 3; ctx.strokeRect(-56, -38, 112, 76); ctx.restore();
    ctx.strokeStyle = 'rgba(220,210,190,.5)'; ctx.lineWidth = 8; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px + 200 + k * 70, floorY + 20); ctx.bezierCurveTo(px + 170 + k * 70, floorY - 60, px + 250 + k * 70, floorY - 110, px + 210 + k * 70, floorY - 190); ctx.stroke(); }
  } else if (/stool|shelf|cobweb|wall|gap|tall|short|high|reach/.test(text)) {
    ctx.fillStyle = '#2c2216'; ctx.fillRect(px + 30, py + 110, 190, 12); ctx.fillRect(px + 30, py + 210, 190, 12);
    ctx.fillStyle = '#3a2c1c'; ctx.fillRect(px + 280, floorY + 100, 70, 8); ctx.fillRect(px + 285, floorY + 108, 8, 54); ctx.fillRect(px + 337, floorY + 108, 8, 54);
    ctx.strokeStyle = 'rgba(210,200,180,.5)'; ctx.lineWidth = 1.5; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(px + 30, py + 110); ctx.lineTo(px + 30 + r() * 190, py + 110 - r() * 70); ctx.stroke(); }
  } else {
    ctx.fillStyle = '#2c2216'; ctx.fillRect(px + 60, floorY + 30, pw - 120, 28);
    ctx.fillStyle = '#17110a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(px + 170 + i * 80, floorY + 120, 30, 8, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(20,12,5,.7)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(px + 100, floorY + 150); ctx.quadraticCurveTo(px + 280, floorY + 90, px + 440, floorY + 150); ctx.stroke(); // ink smear
  }
  // film look: sepia wash, grain, scratches, vignette
  ctx.fillStyle = 'rgba(150,100,40,.28)'; ctx.fillRect(px, py, pw, ph);
  grain(ctx, w, h, r, 5200, 0.3); grain(ctx, w, h, r, 900, 0.25, false);
  ctx.strokeStyle = 'rgba(255,240,210,.22)'; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const sx = px + r() * pw; ctx.beginPath(); ctx.moveTo(sx, py); ctx.lineTo(sx + (r() - 0.5) * 12, py + ph); ctx.stroke(); }
  const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, 120, px + pw / 2, py + ph / 2, 340); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = vg; ctx.fillRect(px, py, pw, ph); ctx.restore();
  // caption in handwriting
  ctx.fillStyle = '#26303f'; const cap = c.body.length > 120 ? c.body.slice(0, 117) + '...' : c.body;
  ctx.font = `29px ${HAND}`; wrap(ctx, cap, pw - 10).slice(0, 4).forEach((l, i) => ctx.fillText(l, px + 4, py + ph + 44 + i * 32));
  // tape
  ctx.save(); ctx.translate(w / 2, 20); ctx.rotate((r() - 0.5) * 0.2); ctx.fillStyle = 'rgba(230,220,170,.7)'; ctx.fillRect(-60, -16, 120, 34); ctx.restore();
  return cv;
}

export function makeDoc(c) {
  const r = rng(String(c.id) + String(c.body));
  const fn = { letter, diary, note, receipt, ticket, photo }[c.type] || note;
  return fn(c, r);
}

/* ---------------- 3D props (before reading) ---------------- */
export function makeProp(type) {
  const r = rng('prop' + type);
  if (type === 'letter') {
    const w = 360, h = 240, cv = canvas(w, h), ctx = cv.getContext('2d');
    ctx.fillStyle = '#e6d9b6'; ctx.fillRect(0, 0, w, h); grain(ctx, w, h, r, 900, 0.2);
    ctx.strokeStyle = 'rgba(80,55,25,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w / 2, h * 0.58); ctx.lineTo(w, 0); ctx.stroke();
    waxSeal(ctx, w / 2, h * 0.58, 26, r); ctx.fillStyle = 'rgba(40,30,70,.7)'; ctx.font = `30px ${HAND}`; ctx.fillText('To the Detective', 80, 190);
    return { cv, w: 0.62, d: 0.42, h: 0.02 };
  }
  if (type === 'diary') {
    const w = 260, h = 340, cv = canvas(w, h), ctx = cv.getContext('2d');
    ctx.fillStyle = '#4a2a16'; ctx.fillRect(0, 0, w, h); grain(ctx, w, h, r, 1200, 0.4);
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 4; ctx.strokeRect(18, 18, w - 36, h - 36); ctx.fillStyle = '#8a6a2a'; ctx.fillRect(w - 46, 0, 18, h);
    ctx.fillStyle = '#c9a24a'; ctx.font = `34px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText('DIARY', w / 2 - 12, 150);
    return { cv, w: 0.42, d: 0.55, h: 0.09 };
  }
  if (type === 'note') {
    const w = 300, h = 220, cv = canvas(w, h), ctx = cv.getContext('2d');
    tornEdge(ctx, w, h, r, 8, '#e0d6bb'); grain(ctx, w, h, r, 600, 0.2);
    ctx.strokeStyle = 'rgba(60,60,70,.55)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(30, 60 + i * 34); ctx.lineTo(60 + r() * 200, 60 + i * 34 + (r() - 0.5) * 6); ctx.stroke(); }
    return { cv, w: 0.42, d: 0.3, h: 0.015 };
  }
  if (type === 'receipt') {
    const w = 160, h = 360, cv = canvas(w, h), ctx = cv.getContext('2d');
    ctx.fillStyle = '#f2efe4'; ctx.fillRect(0, 0, w, h); grain(ctx, w, h, r, 500, 0.12);
    ctx.fillStyle = '#333'; ctx.font = `14px ${TYPE}`; for (let i = 0; i < 12; i++) ctx.fillText('-'.repeat(8 + Math.floor(r() * 6)), 14, 30 + i * 26);
    return { cv, w: 0.18, d: 0.5, h: 0.01 };
  }
  if (type === 'ticket') {
    const w = 360, h = 150, cv = canvas(w, h), ctx = cv.getContext('2d');
    ctx.fillStyle = '#c0803a'; ctx.fillRect(0, 0, w, h); grain(ctx, w, h, r, 700, 0.25);
    ctx.strokeStyle = '#6a3a14'; ctx.lineWidth = 3; ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = '#3a1c08'; ctx.font = `bold 38px ${TYPE}`; ctx.textAlign = 'center'; ctx.fillText('ADMIT ONE', w / 2, 88);
    return { cv, w: 0.5, d: 0.22, h: 0.012 };
  }
  // photo (face down polaroid)
  const w = 280, h = 340, cv = canvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = '#eee8d8'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#7a8aa0'; ctx.fillRect(22, 22, w - 44, h - 110); grain(ctx, w, h, r, 600, 0.15);
  ctx.fillStyle = 'rgba(200,190,160,.25)'; ctx.fillRect(22, 22, w - 44, 30);
  return { cv, w: 0.4, d: 0.48, h: 0.015 };
}
