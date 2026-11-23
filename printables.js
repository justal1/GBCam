'use strict';
// Party printables, handy labels and templates, and planners. Everything is drawn for the 48 mm roll (384 dots wide, 8 dots per mm),
// so rulers are true size. Wide designs (habit tracker) are drawn sideways and turned to run down the paper.
const Printables = (() => {
  const W = 384, F = 'system-ui, "Helvetica Neue", Arial, sans-serif';
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineCap = x.lineJoin = 'round'; x.textBaseline = 'middle'; return [c, x]; };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const shuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const font = (x, size, w = 600, style = '') => { x.font = `${style} ${w} ${size}px ${F}`.trim(); };
  const text = (x, t, px, py, size = 18, w = 600, align = 'left') => { font(x, size, w); x.textAlign = align; x.fillText(t, px, py); };
  const fit = (x, t, maxW, max, min, w = 800) => { let s = max; for (; s > min; s -= 2) { font(x, s, w); if (x.measureText(t).width <= maxW) break; } return s; };
  const wrap = (x, t, maxW) => { const out = []; for (const para of String(t).split('\n')) { let line = ''; for (const word of para.split(/\s+/).filter(Boolean)) { const test = line ? line + ' ' + word : word; if (x.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test; } out.push(line); } return out; };
  const stack = parts => { let h = 0; for (const p of parts) h += p.height; const [c, x] = cv(W, h); let y = 0; for (const p of parts) { x.drawImage(p, 0, y); y += p.height; } return c; };
  const gap = (label = true) => { const [c, x] = cv(W, 24); x.save(); x.setLineDash([7, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 12); x.lineTo(W - 8, 12); x.stroke(); x.restore(); if (label) text(x, '✂', 18, 11, 14); return c; };
  const sideways = (c, ccw) => { const [r, x] = cv(c.height, c.width); if (ccw) { x.translate(0, c.width); x.rotate(-Math.PI / 2); } else { x.translate(c.height, 0); x.rotate(Math.PI / 2); } x.drawImage(c, 0, 0); return r; };
  const heading = (t, sub) => { const [c, x] = cv(W, sub ? 70 : 50); text(x, t, W / 2, 24, 28, 800, 'center'); if (sub) text(x, sub, W / 2, 54, 15, 500, 'center'); return c; };
  const box = (x, px, py, w, h, r = 4, lw = 2.5) => { x.save(); x.lineWidth = lw; x.beginPath(); if (x.roundRect) x.roundRect(px, py, w, h, r); else x.rect(px, py, w, h); x.stroke(); x.restore(); };
  const fmt = (d, o) => d.toLocaleDateString(undefined, o || { day: 'numeric', month: 'short', year: 'numeric' });
  const parseDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); };
  const parseMonth = s => { const m = /^(\d{4})-(\d{2})$/.exec(s || ''); const d = m ? new Date(+m[1], +m[2] - 1, 1) : new Date(); d.setDate(1); return d; };
  const lines = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);

  // ================= PARTY =================
  function bingoCard(o, rand) {
    const n = +o.bingo_size, words = o.bingo_mode === 'words', items = lines(o.bingo_items), isNum = !words;
    let cells = [];
    if (words) { const need = n * n - (n % 2 ? 1 : 0); if (items.length < need) throw new Error(`Type at least ${need} different items (one per line) for a ${n}×${n} card. You have ${items.length}.`); cells = shuffle(items, rand).slice(0, need); }
    const header = isNum && n === 5, colNums = [];
    if (header) { for (let c = 0; c < 5; c++) colNums.push(shuffle(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1), rand).slice(0, 5)); }
    else if (isNum) { const pool = shuffle(Array.from({ length: n * n * 3 }, (_, i) => i + 1), rand).slice(0, n * n - (n % 2 ? 1 : 0)); cells = pool; }
    const cell = Math.floor(360 / n), cw = cell * n, ox = (W - cw) / 2, top = header ? 66 : 54, [c, x] = cv(W, top + cell * n + 26);
    if (header) { for (let i = 0; i < 5; i++) text(x, 'BINGO'[i], ox + cell * i + cell / 2, 32, 46, 900, 'center'); } else text(x, o.bingo_title || 'BINGO', W / 2, 28, 34, 900, 'center');
    x.lineWidth = 3; x.strokeRect(ox, top - 4, cw, cell * n + 4); x.lineWidth = 2;
    for (let i = 1; i < n; i++) { x.beginPath(); x.moveTo(ox + i * cell, top - 4); x.lineTo(ox + i * cell, top + cell * n); x.stroke(); x.beginPath(); x.moveTo(ox, top + i * cell); x.lineTo(ox + cw, top + i * cell); x.stroke(); }
    let k = 0; for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
      const px = ox + col * cell + cell / 2, py = top + r * cell + cell / 2, free = n % 2 && r === (n - 1) / 2 && col === (n - 1) / 2;
      if (free) { text(x, '★', px, py - 8, cell * 0.5, 800, 'center'); text(x, 'FREE', px, py + cell * 0.26, 14, 800, 'center'); continue; }
      if (header) text(x, String(colNums[col][r]), px, py, cell * 0.46, 800, 'center');
      else if (isNum) text(x, String(cells[k++]), px, py, cell * 0.4, 800, 'center');
      else { const t = cells[k++]; let s = Math.min(18, cell * 0.24); const longest = t.split(/\s+/).sort((a, b) => b.length - a.length)[0]; for (; s > 9; s--) { font(x, s, 700); if (x.measureText(longest).width <= cell - 8) break; } font(x, s, 700); const ls = wrap(x, t, cell - 8).slice(0, 3); ls.forEach((l, i) => text(x, l, px, py + (i - (ls.length - 1) / 2) * (s + 2), s, 700, 'center')); }
    }
    text(x, 'tick off as they are called', W / 2, top + cell * n + 14, 12, 500, 'center'); return c;
  }
  function callerSheet() {
    const [c, x] = cv(W, 50 + 15 * 24 + 8); text(x, 'CALLER SHEET', W / 2, 22, 22, 900, 'center'); const cw = 70, ox = (W - cw * 5) / 2;
    for (let col = 0; col < 5; col++) { text(x, 'BINGO'[col], ox + col * cw + cw / 2, 44, 20, 900, 'center'); for (let r = 0; r < 15; r++) { const n = col * 15 + r + 1; x.lineWidth = 1; x.strokeRect(ox + col * cw + 4, 56 + r * 24, cw - 8, 22); text(x, String(n), ox + col * cw + cw / 2, 67 + r * 24, 15, 600, 'center'); } }
    return c;
  }
  function bingo(o) {
    const rand = rng(o.seed || 1), n = Math.max(1, Math.min(8, +o.bingo_count || 1)), parts = [heading('BINGO', 'Every card is different')];
    for (let i = 0; i < n; i++) { if (i) parts.push(gap()); parts.push(bingoCard(o, rand)); }
    if (o.bingo_caller && o.bingo_mode !== 'words' && +o.bingo_size === 5) { parts.push(gap()); parts.push(callerSheet()); }
    return stack(parts);
  }
  function scavenger(o) {
    const items = lines(o.sc_items); if (!items.length) throw new Error('Type the things to find, one per line.');
    const [m, mx] = cv(W, 10); font(mx, 20, 700); const rows = items.map(t => wrap(mx, t, W - 92)), h = 90 + rows.reduce((s, r) => s + Math.max(40, r.length * 24 + 12), 0) + 70, [c, x] = cv(W, h);
    x.lineWidth = 4; x.strokeRect(6, 6, W - 12, h - 12); text(x, o.sc_title || 'SCAVENGER HUNT', W / 2, 36, fit(x, o.sc_title || 'SCAVENGER HUNT', W - 40, 34, 18), 900, 'center'); text(x, 'Find them all and tick the boxes!', W / 2, 66, 15, 500, 'center');
    let y = 84; rows.forEach(r => { const rh = Math.max(40, r.length * 24 + 12); box(x, 24, y + rh / 2 - 15, 30, 30, 6, 3); font(x, 20, 700); x.textAlign = 'left'; r.forEach((l, i) => x.fillText(l, 68, y + rh / 2 + (i - (r.length - 1) / 2) * 24)); x.save(); x.setLineDash([2, 4]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(20, y + rh); x.lineTo(W - 20, y + rh); x.stroke(); x.restore(); y += rh; });
    text(x, 'Team: ______________________', 24, h - 34, 17, 600); return c;
  }
  const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
  function secret(o) {
    const msg = String(o.sec_msg || '').toUpperCase(), kind = o.sec_cipher, sh = +o.sec_shift || 3; if (!msg.trim()) throw new Error('Type a message to hide.');
    let enc = '', keyCard;
    const [mc, mx] = cv(W, 10);
    if (kind === 'caesar') { enc = msg.replace(/[A-Z]/g, ch => String.fromCharCode(65 + (ch.charCodeAt(0) - 65 + sh) % 26)); keyCard = (() => { const [c, x] = cv(W, 140); text(x, `CODE KEY: every letter moves ${sh} along`, W / 2, 16, 15, 800, 'center'); for (let half = 0; half < 2; half++) for (let i = 0; i < 13; i++) { const L = half * 13 + i, px = 10 + i * 28 + 14, py = 46 + half * 54; text(x, String.fromCharCode(65 + L), px, py, 19, 800, 'center'); text(x, '↓', px, py + 15, 12, 500, 'center'); text(x, String.fromCharCode(65 + (L + sh) % 26), px, py + 29, 19, 800, 'center'); } return c; })(); }
    else if (kind === 'num') { enc = msg.replace(/[A-Z]/g, ch => (ch.charCodeAt(0) - 64) + ' ').replace(/ +/g, ' ').trim(); keyCard = (() => { const [c, x] = cv(W, 118); text(x, 'CODE KEY: A=1, B=2, … Z=26', W / 2, 16, 15, 800, 'center'); for (let r = 0; r < 2; r++) for (let i = 0; i < 13; i++) { const L = r * 13 + i, px = 10 + i * 28 + 14, py = 42 + r * 38; text(x, String.fromCharCode(65 + L), px, py, 17, 800, 'center'); text(x, String(L + 1), px, py + 17, 13, 600, 'center'); } return c; })(); }
    else { enc = msg.split(/\s+/).map(w => [...w].map(ch => MORSE[ch] || '').filter(Boolean).join(' ')).join('  /  '); keyCard = (() => { const keys = Object.keys(MORSE), [c, x] = cv(W, 36 + Math.ceil(keys.length / 3) * 22); text(x, 'MORSE CODE KEY', W / 2, 16, 15, 800, 'center'); keys.forEach((k, i) => { const col = i % 3, r = Math.floor(i / 3); text(x, `${k}  ${MORSE[k]}`, 14 + col * 126, 40 + r * 22, 16, 700); }); return c; })(); }
    font(mx, 24, 800); const ls = wrap(mx, enc, W - 40), [c, x] = cv(W, 70 + ls.length * 34 + 16); x.lineWidth = 3; x.strokeRect(6, 6, W - 12, c.height - 12); text(x, '🔒 TOP SECRET 🔒', W / 2, 30, 22, 900, 'center'); ls.forEach((l, i) => text(x, l, W / 2, 70 + i * 34, 24, 800, 'center'));
    return stack([c, gap(), keyCard]);
  }
  function wheel() {
    const disc = (R, ringR, size, name) => { const [c, x] = cv(W, W); x.lineWidth = 3; x.beginPath(); x.arc(W / 2, W / 2, R, 0, 7); x.stroke(); x.lineWidth = 1.5; x.beginPath(); x.arc(W / 2, W / 2, ringR - size, 0, 7); x.stroke(); for (let i = 0; i < 26; i++) { x.save(); x.translate(W / 2, W / 2); x.rotate(i * Math.PI * 2 / 26); text(x, String.fromCharCode(65 + i), 0, -(ringR - size * 0.5), size, 800, 'center'); x.beginPath(); x.moveTo(0, -(R)); x.lineTo(0, -(ringR + 1)); x.lineWidth = 1; x.stroke(); x.restore(); } x.lineWidth = 2; x.beginPath(); x.arc(W / 2, W / 2, 8, 0, 7); x.stroke(); text(x, name, W / 2, W / 2 + 28, 14, 800, 'center'); return c; };
    const steps = (() => { const [c, x] = cv(W, 134); text(x, 'HOW TO USE', W / 2, 16, 16, 800, 'center'); ['Cut out both discs. Pin the small one on top of', 'the big one through the middle circles.', 'Turn the small disc to line up the SAME letter', 'for the shift you agree. Read plain letters on the', 'outside, secret letters on the inside!'].forEach((t, i) => text(x, t, W / 2, 40 + i * 17, 14, 500, 'center')); return c; })();
    return stack([heading('SECRET CODE WHEEL', 'Two discs to cut out and pin together'), disc(188, 180, 34, 'OUTER'), gap(), disc(126, 118, 34, 'INNER'), gap(), steps]);
  }
  function raffle(o) {
    const n = Math.max(1, Math.min(12, +o.rf_count || 6)), start = +o.rf_start || 1, ev = o.rf_event || 'RAFFLE', parts = [];
    for (let i = 0; i < n; i++) {
      const [c, x] = cv(W, 120), num = String(start + i).padStart(4, '0'); x.lineWidth = 3; box(x, 6, 6, W - 12, 108, 10, 3); x.save(); x.setLineDash([5, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(104, 8); x.lineTo(104, 112); x.stroke(); x.restore();
      text(x, 'No.', 55, 34, 15, 700, 'center'); text(x, num, 55, 66, 30, 900, 'center'); text(x, 'KEEP', 55, 98, 13, 700, 'center');
      const s = fit(x, ev.toUpperCase(), 250, 34, 16); text(x, ev.toUpperCase(), 244, 38, s, 900, 'center'); text(x, 'ADMIT ONE · RAFFLE TICKET', 244, 70, 14, 700, 'center'); text(x, 'No. ' + num, 244, 98, 22, 900, 'center'); parts.push(c); if (i < n - 1) parts.push(gap(false));
    }
    return stack(parts);
  }

  // ================= LABELS & TEMPLATES =================
  function pantry(o) {
    const opened = parseDate(o.pl_date), use = new Date(opened), n = Math.max(1, Math.min(12, +o.pl_copies || 1)), name = o.pl_name || 'Leftovers', parts = []; use.setDate(use.getDate() + (+o.pl_days || 7));
    for (let i = 0; i < n; i++) {
      const [c, x] = cv(W, 150); box(x, 6, 6, W - 12, 138, 14, 4); const s = fit(x, name, W - 40, 50, 20, 900); text(x, name, W / 2, 40, s, 900, 'center');
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(20, 74); x.lineTo(W - 20, 74); x.stroke();
      text(x, 'OPENED', 100, 90, 14, 700, 'center'); text(x, fmt(opened, { day: 'numeric', month: 'short' }), 100, 118, 26, 900, 'center'); x.lineWidth = 2; x.beginPath(); x.moveTo(192, 82); x.lineTo(192, 134); x.stroke();
      x.fillStyle = '#000'; x.fillRect(200, 82, W - 212, 56); x.fillStyle = '#fff'; text(x, 'USE BY', 288, 94, 13, 800, 'center'); text(x, fmt(use, { day: 'numeric', month: 'short' }), 288, 120, 28, 900, 'center'); x.fillStyle = '#000'; parts.push(c); if (i < n - 1) parts.push(gap(false));
    }
    return stack(parts);
  }
  function cable(o) {
    const names = lines(o.cb_text); if (!names.length) throw new Error('Type a name for each cable, one per line.'); const parts = [];
    names.slice(0, 20).forEach((nm, i) => { const [c, x] = cv(W, 84); const s = fit(x, nm, 148, 34, 14, 900); x.lineWidth = 3; x.strokeRect(6, 6, W - 12, 72); text(x, nm, 92, 42, s, 900, 'center'); text(x, nm, 292, 42, s, 900, 'center'); x.save(); x.setLineDash([4, 5]); x.lineWidth = 2; for (const lx of [172, 212]) { x.beginPath(); x.moveTo(lx, 8); x.lineTo(lx, 76); x.stroke(); } x.restore(); text(x, 'wrap', 192, 42, 11, 500, 'center'); parts.push(c); parts.push(gap(false)); });
    parts.push(cableHelp()); return stack(parts);
  }
  const cableHelp = () => { const [c, x] = cv(W, 54); text(x, 'Peel, wrap the middle round the cable and press', W / 2, 16, 14, 500, 'center'); text(x, 'the two ends together: a flag with the name on both sides.', W / 2, 36, 14, 500, 'center'); return c; };
  function plant(o) {
    const n = Math.max(1, Math.min(6, +o.pt_copies || 1)), parts = [], water = Math.max(0, Math.min(3, +o.pt_water)), sun = o.pt_sun;
    for (let i = 0; i < n; i++) {
      const [c, x] = cv(W, 190); box(x, 6, 6, W - 12, 178, 12, 4); const nm = o.pt_name || 'Basil', s = fit(x, nm, W - 40, 48, 20, 900); text(x, nm, W / 2, 38, s, 900, 'center');
      x.lineWidth = 2; x.beginPath(); x.moveTo(20, 66); x.lineTo(W - 20, 66); x.stroke();
      text(x, 'WATER', 100, 82, 13, 800, 'center'); for (let d = 0; d < 3; d++) { const px = 100 + (d - 1) * 34, py = 112; x.beginPath(); x.moveTo(px, py - 18); x.quadraticCurveTo(px + 16, py + 4, px, py + 16); x.quadraticCurveTo(px - 16, py + 4, px, py - 18); x.closePath(); if (d < water) x.fill(); else { x.lineWidth = 2; x.stroke(); } }
      text(x, 'SUN', 284, 82, 13, 800, 'center'); const sx = 284, sy = 112; x.lineWidth = 3; x.beginPath(); x.arc(sx, sy, 12, 0, 7); if (sun === 'full') x.fill(); else x.stroke(); if (sun === 'part') { x.beginPath(); x.arc(sx, sy, 12, Math.PI / 2, Math.PI * 1.5); x.fill(); } for (let r = 0; r < 8; r++) { const a = r * Math.PI / 4; if (sun === 'shade') break; x.beginPath(); x.moveTo(sx + Math.cos(a) * 18, sy + Math.sin(a) * 18); x.lineTo(sx + Math.cos(a) * 26, sy + Math.sin(a) * 26); x.stroke(); } if (sun === 'shade') { x.lineWidth = 2.5; x.beginPath(); x.arc(sx - 8, sy + 4, 10, Math.PI * 0.5, Math.PI * 1.5); x.arc(sx + 6, sy - 2, 12, Math.PI * 1.1, Math.PI * 2.1); x.stroke(); }
      text(x, sun === 'full' ? 'full sun' : sun === 'part' ? 'part shade' : 'shade', 284, 148, 13, 700, 'center'); text(x, ['rarely', 'weekly', 'twice a week', 'every day'][water], 100, 148, 13, 700, 'center');
      if (o.pt_note) { font(x, 13, 500); wrap(x, o.pt_note, W - 40).slice(0, 1).forEach(l => text(x, l, W / 2, 172, 13, 500, 'center')); }
      parts.push(c); if (i < n - 1) parts.push(gap(false));
    }
    return stack(parts);
  }
  function recipe(o) {
    const ing = lines(o.rc_ing), steps = lines(o.rc_steps), [m, mx] = cv(W, 10); font(mx, 17, 500);
    const ingRows = ing.map(t => wrap(mx, t, W - 54)), stepRows = steps.map(t => wrap(mx, t, W - 60)), h = 110 + ingRows.reduce((s, r) => s + r.length * 22 + 6, 0) + 44 + stepRows.reduce((s, r) => s + r.length * 22 + 10, 0) + 34, [c, x] = cv(W, h);
    x.lineWidth = 4; x.strokeRect(5, 5, W - 10, h - 10); const nm = o.rc_title || 'Recipe'; text(x, nm, W / 2, 36, fit(x, nm, W - 40, 34, 16, 900), 900, 'center'); if (o.rc_meta) text(x, o.rc_meta, W / 2, 66, 15, 600, 'center'); x.lineWidth = 2; x.beginPath(); x.moveTo(16, 84); x.lineTo(W - 16, 84); x.stroke();
    let y = 106; text(x, 'INGREDIENTS', 18, y, 16, 900); y += 24; ingRows.forEach(r => { text(x, '•', 22, y, 17, 800); r.forEach((l, i) => text(x, l, 40, y + i * 22, 17, 500)); y += r.length * 22 + 6; });
    y += 8; x.beginPath(); x.moveTo(16, y); x.lineTo(W - 16, y); x.stroke(); y += 22; text(x, 'METHOD', 18, y, 16, 900); y += 24; stepRows.forEach((r, k) => { text(x, (k + 1) + '.', 22, y, 17, 800); r.forEach((l, i) => text(x, l, 48, y + i * 22, 17, 500)); y += r.length * 22 + 10; });
    return c;
  }
  function ruler(o) {
    const cm = Math.max(3, Math.min(60, +o.rl_len || 15)), unit = o.rl_unit, H = cm * 80 + 70, [c, x] = cv(W, H), y0 = 44;
    text(x, 'RULER · real size · ' + cm + ' cm', W / 2, 20, 15, 800, 'center'); x.lineWidth = 3; x.strokeRect(4, y0 - 8, W - 8, cm * 80 + 16);
    if (unit !== 'inch') { for (let mm = 0; mm <= cm * 10; mm++) { const y = y0 + mm * 8, len = mm % 10 === 0 ? 34 : mm % 5 === 0 ? 22 : 12; x.lineWidth = mm % 10 === 0 ? 2.5 : 1.5; x.beginPath(); x.moveTo(5, y); x.lineTo(5 + len, y); x.stroke(); if (mm % 10 === 0 && mm > 0 && mm < cm * 10) text(x, String(mm / 10), 46, y, 20, 800, 'left'); } text(x, 'cm', 78, y0 + 14, 14, 800, 'left'); }
    if (unit !== 'cm') { const dpi = 203.2, total = Math.floor(cm / 2.54 * 16); for (let k = 0; k <= total; k++) { const y = y0 + k * dpi / 16, len = k % 16 === 0 ? 44 : k % 8 === 0 ? 32 : k % 4 === 0 ? 22 : k % 2 === 0 ? 14 : 8; x.lineWidth = k % 16 === 0 ? 2.5 : 1.5; x.beginPath(); x.moveTo(W - 5, y); x.lineTo(W - 5 - len, y); x.stroke(); if (k % 16 === 0 && k > 0) text(x, String(k / 16), W - 62, y, 20, 800, 'right'); } text(x, 'in', W - 78, y0 + 14, 14, 800, 'right'); }
    text(x, 'Check it against a real ruler: printers can vary a little.', W / 2, H - 14, 11, 500, 'center'); return c;
  }
  // ================= PLANNERS =================
  function month(o) {
    const d0 = parseMonth(o.mo_month), startMon = o.mo_start !== 'sun', first = (d0.getDay() + (startMon ? 6 : 0)) % 7, days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate(), rows = Math.ceil((first + days) / 7), cw = 54, ch = 56, ox = 3, top = 110;
    const [c, x] = cv(W, top + rows * ch + 24 + (o.mo_notes ? 150 : 0)); text(x, d0.toLocaleDateString(undefined, { month: 'long' }).toUpperCase(), W / 2, 30, 36, 900, 'center'); text(x, String(d0.getFullYear()), W / 2, 66, 20, 600, 'center');
    const wd = startMon ? 'MTWTFSS' : 'SMTWTFS'; for (let i = 0; i < 7; i++) { x.fillRect(ox + i * cw, 82, cw, 24); x.fillStyle = '#fff'; text(x, wd[i], ox + i * cw + cw / 2, 95, 15, 800, 'center'); x.fillStyle = '#000'; }
    x.lineWidth = 2; for (let r = 0; r <= rows; r++) { x.beginPath(); x.moveTo(ox, top + r * ch); x.lineTo(ox + 7 * cw, top + r * ch); x.stroke(); } for (let i = 0; i <= 7; i++) { x.beginPath(); x.moveTo(ox + i * cw, 106); x.lineTo(ox + i * cw, top + rows * ch); x.stroke(); }
    for (let k = 0; k < days; k++) { const p = first + k, col = p % 7, r = Math.floor(p / 7); text(x, String(k + 1), ox + col * cw + 6, top + r * ch + 14, 18, 800); if ((startMon ? col >= 5 : col === 0 || col === 6)) { x.save(); x.globalAlpha = 1; x.lineWidth = 1; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(ox + col * cw + 4, top + r * ch + ch - 8); x.lineTo(ox + col * cw + cw - 4, top + r * ch + ch - 8); x.stroke(); x.restore(); } }
    if (o.mo_notes) { const y = top + rows * ch + 20; text(x, 'NOTES', 12, y, 15, 900); for (let i = 1; i <= 5; i++) { x.save(); x.setLineDash([3, 5]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(12, y + i * 26); x.lineTo(W - 12, y + i * 26); x.stroke(); x.restore(); } }
    return c;
  }
  function week(o) {
    const d = parseDate(o.wk_date), dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); const [c, x] = cv(W, 100 + 7 * 78 + 10); text(x, 'WEEK OF', W / 2, 20, 15, 700, 'center'); text(x, fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, 52, 26, 900, 'center'); x.lineWidth = 3; x.strokeRect(5, 80, W - 10, 7 * 78 + 6);
    for (let i = 0; i < 7; i++) { const y = 84 + i * 78, dd = new Date(d); dd.setDate(d.getDate() + i); if (i) { x.lineWidth = 2; x.beginPath(); x.moveTo(5, y); x.lineTo(W - 5, y); x.stroke(); } text(x, dd.toLocaleDateString(undefined, { weekday: 'long' }), 14, y + 16, 18, 900); text(x, String(dd.getDate()), W - 16, y + 16, 22, 900, 'right'); for (let k = 1; k <= 2; k++) { x.save(); x.setLineDash([3, 5]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(14, y + 16 + k * 22); x.lineTo(W - 14, y + 16 + k * 22); x.stroke(); x.restore(); } }
    return c;
  }
  function day(o) {
    const d = parseDate(o.dy_date), h0 = 7, h1 = 21, rows = h1 - h0 + 1, [c, x] = cv(W, 110 + 3 * 34 + 40 + rows * 34 + 130);
    text(x, d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase(), W / 2, 26, 34, 900, 'center'); text(x, fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, 58, 18, 600, 'center'); x.lineWidth = 3; x.beginPath(); x.moveTo(10, 78); x.lineTo(W - 10, 78); x.stroke();
    text(x, 'TOP 3 TODAY', 14, 98, 16, 900); for (let i = 0; i < 3; i++) { box(x, 14, 114 + i * 34, 24, 24, 5, 2.5); x.save(); x.setLineDash([3, 5]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(48, 136 + i * 34); x.lineTo(W - 14, 136 + i * 34); x.stroke(); x.restore(); }
    let y = 114 + 3 * 34 + 14; text(x, 'SCHEDULE', 14, y, 16, 900); y += 16; for (let i = 0; i < rows; i++) { const hh = h0 + i; text(x, (hh < 10 ? '0' : '') + hh + ':00', 14, y + 18 + i * 34, 15, 800); x.save(); x.lineWidth = 1.5; x.beginPath(); x.moveTo(70, y + 32 + i * 34); x.lineTo(W - 14, y + 32 + i * 34); x.stroke(); x.restore(); }
    y += rows * 34 + 22; text(x, 'NOTES', 14, y, 16, 900); for (let k = 1; k <= 3; k++) { x.save(); x.setLineDash([3, 5]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(14, y + k * 30); x.lineTo(W - 14, y + k * 30); x.stroke(); x.restore(); }
    return c;
  }
  function habits(o) {
    const hs = lines(o.hb_list).slice(0, 12); if (!hs.length) throw new Error('Type your habits, one per line.'); const d0 = parseMonth(o.hb_month), days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate(), nameW = 150, cell = 17, rowH = 34, top = 60;
    const [c, x] = cv(nameW + days * cell + 12, top + hs.length * rowH + 16); text(x, d0.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase() + ' · HABITS', 8, 18, 20, 900);
    x.lineWidth = 2; x.strokeRect(4, top - 20, c.width - 8, hs.length * rowH + 22); for (let k = 0; k < days; k++) { text(x, String(k + 1), nameW + k * cell + cell / 2, top - 8, 10, 800, 'center'); }
    hs.forEach((h, i) => { const y = top + 2 + i * rowH; if (i) { x.lineWidth = 1.5; x.beginPath(); x.moveTo(4, y - 1); x.lineTo(c.width - 4, y - 1); x.stroke(); } font(x, 16, 800); let s = 16; while (x.measureText(h).width > nameW - 14 && s > 9) { s--; font(x, s, 800); } text(x, h, 10, y + rowH / 2 - 1, s, 800); for (let k = 0; k < days; k++) { x.lineWidth = 1.2; x.strokeRect(nameW + k * cell + 2, y + 8, cell - 4, rowH - 16); } });
    x.lineWidth = 2; x.beginPath(); x.moveTo(nameW, top - 20); x.lineTo(nameW, top + hs.length * rowH + 2); x.stroke();
    return stack([sideways(c), gap(false), (() => { const [t, tx] = cv(W, 36); text(tx, 'Turn the paper sideways to read it. Colour a box each day!', W / 2, 18, 13, 500, 'center'); return t; })()]);
  }
  function meals(o) {
    const [c, x] = cv(W, 70 + 7 * 108 + 10); text(x, o.ml_title || 'MEAL PLAN', W / 2, 30, 32, 900, 'center'); x.lineWidth = 3; x.strokeRect(5, 56, W - 10, 7 * 108 + 8);
    ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].forEach((dn, i) => { const y = 60 + i * 108; if (i) { x.lineWidth = 2; x.beginPath(); x.moveTo(5, y); x.lineTo(W - 5, y); x.stroke(); } text(x, dn, 14, y + 14, 16, 900); ['B', 'L', 'D'].forEach((m, k) => { text(x, m, 18, y + 40 + k * 22, 16, 900); x.save(); x.setLineDash([3, 5]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(40, y + 46 + k * 22); x.lineTo(W - 14, y + 46 + k * 22); x.stroke(); x.restore(); }); });
    return c;
  }
  const BUILD = { bingo, scavenger, secret, wheel, raffle, pantry, cable, plant, recipe, ruler, month, week, day, habits, meals };
  return { build: (what, o) => BUILD[what](o || {}), BUILD };
})();
if (typeof window !== 'undefined') window.Printables = Printables;
