'use strict';
// Make tab: things worth printing. Photo-booth strip footer (caption/QR), shaped photo stickers, QR + barcode labels,
// to-do / day cards, dice, maze / sudoku / word search, and a drawing pad. All static: no server needed (QR carries its own text).
const Make = (() => {
  const root = $('makeview');
  const SKEY = 'catcam-make';
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch (e) { }
  const store = () => { try { localStorage.setItem(SKEY, JSON.stringify(saved)); } catch (e) { } };
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const today = (o) => new Date().toLocaleDateString(undefined, o || { year: 'numeric', month: 'short', day: 'numeric' });
  // page(h, fn): white W x h canvas, fn draws black ink on it -> {bits,h,canvas}
  const page = (h, fn) => { const c = cvs(W, h), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, h); x.fillStyle = '#000'; x.strokeStyle = '#000'; x.textBaseline = 'top'; fn(x); return { bits: Prt.canvasBits(c), h, canvas: c }; };
  const FONT = 'system-ui, "Helvetica Neue", Arial, sans-serif';
  function wrapLines(x, text, maxw) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + word : word; if (x.measureText(t).width <= maxw || !line) line = t; else { out.push(line); line = word; } }
      out.push(line);
    }
    return out;
  }

  // ---------------- QR + Code128 ----------------
  function qrCanvas(text, target) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), cell = Math.max(2, Math.floor(target / (n + 8))), size = cell * (n + 8), c = cvs(W, size), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, size); x.fillStyle = '#000'; const ox = ((W - size) >> 1) + cell * 4, oy = cell * 4;
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(ox + k * cell, oy + r * cell, cell, cell);
    return { bits: Prt.canvasBits(c), h: size, canvas: c, modules: n };
  }
  const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
  function code128(text) { // Code Set B -> list of module widths (bar, space, bar, ...)
    const vals = [104]; let sum = 104;
    [...text].forEach((ch, i) => { let v = ch.charCodeAt(0) - 32; if (v < 0 || v > 94) v = 31; vals.push(v); sum += v * (i + 1); });
    vals.push(sum % 103); vals.push(106);
    return vals.map(v => C128[v]).join('').split('').map(Number);
  }
  function barcodeBlock(text, hgt) {
    const w = code128(text), tot = w.reduce((a, b) => a + b, 0), unit = Math.max(1, Math.floor((W - 24) / tot));
    return page(hgt, x => { let px = (W - tot * unit) >> 1, bar = true; for (const m of w) { if (bar) x.fillRect(px, 0, m * unit, hgt); px += m * unit; bar = !bar; } });
  }

  // ---------------- stickers ----------------
  function shapePath(kind, cx, cy, r) {
    const p = new Path2D();
    if (kind === 'circle') p.arc(cx, cy, r, 0, Math.PI * 2);
    else if (kind === 'rounded') { if (p.roundRect) p.roundRect(cx - r, cy - r, 2 * r, 2 * r, r * 0.35); else p.rect(cx - r, cy - r, 2 * r, 2 * r); }
    else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r * 1.08; p[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } p.closePath(); }
    else if (kind === 'heart') { const s = r / 15.5; for (let i = 0; i <= 120; i++) { const t = i / 120 * Math.PI * 2, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); p[i ? 'lineTo' : 'moveTo'](cx + hx * s, cy - hy * s + s * 1.2); } p.closePath(); }
    return p;
  }
  function sticker(kind, bitsSrc, label) {
    const H2 = 372, cx = W / 2, cy = 186, r = 158, c = cvs(W, H2), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H2);
    const path = shapePath(kind, cx, cy, r);
    x.save(); x.clip(path); x.drawImage(Prt.bitsCanvas(bitsSrc), 0, 18); x.restore();
    x.strokeStyle = '#000'; x.lineWidth = 8; x.lineJoin = 'round'; x.stroke(path);
    x.save(); x.translate(cx, cy); x.scale(1.12, 1.12); x.translate(-cx, -cy); x.lineWidth = 2 / 1.12; x.setLineDash([9, 7]); x.stroke(path); x.restore();
    const parts = [{ bits: Prt.canvasBits(c), h: H2 }];
    if (label) parts.push(Prt.textBits(label, { size: 22, bold: false }));
    return Prt.stack(parts);
  }

  // ---------------- maze ----------------
  function maze(cols, rows, cell) {
    const n = cols * rows, wall = Array.from({ length: n }, () => [1, 1, 1, 1]); // N E S W
    const seen = new Uint8Array(n), stack = [0]; seen[0] = 1; const dx = [0, 1, 0, -1], dy = [-1, 0, 1, 0];
    while (stack.length) {
      const i = stack[stack.length - 1], x = i % cols, y = (i / cols) | 0, nb = [];
      for (let d = 0; d < 4; d++) { const nx = x + dx[d], ny = y + dy[d]; if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx]) nb.push(d); }
      if (!nb.length) { stack.pop(); continue; }
      const d = nb[rnd(nb.length)], j = (y + dy[d]) * cols + x + dx[d]; wall[i][d] = 0; wall[j][(d + 2) % 4] = 0; seen[j] = 1; stack.push(j);
    }
    // BFS solution 0 -> n-1
    const prev = new Int32Array(n).fill(-1); prev[0] = 0; const q = [0];
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % cols, y = (i / cols) | 0; for (let d = 0; d < 4; d++) if (!wall[i][d]) { const j = (y + dy[d]) * cols + x + dx[d]; if (prev[j] < 0) { prev[j] = i; q.push(j); } } }
    const sol = []; for (let i = n - 1; ; i = prev[i]) { sol.push(i); if (i === 0) break; }
    const mw = cols * cell, mh = rows * cell, ox = (W - mw) >> 1, top = 52, H2 = top + mh + 50;
    const draw = withSol => page(H2, x => {
      x.font = `800 30px ${FONT}`; x.textAlign = 'center'; x.fillText(withSol ? 'MAZE: ANSWER' : 'MAZE', W / 2, 8); x.textAlign = 'left';
      x.lineWidth = 3; x.lineCap = 'round'; x.beginPath();
      for (let i = 0; i < n; i++) { const cx = ox + (i % cols) * cell, cy = top + ((i / cols) | 0) * cell;
        if (wall[i][0] && i !== 0) { x.moveTo(cx, cy); x.lineTo(cx + cell, cy); }
        if (wall[i][3]) { x.moveTo(cx, cy); x.lineTo(cx, cy + cell); }
        if (wall[i][2] && i !== n - 1) { x.moveTo(cx, cy + cell); x.lineTo(cx + cell, cy + cell); }
        if (wall[i][1]) { x.moveTo(cx + cell, cy); x.lineTo(cx + cell, cy + cell); } }
      x.stroke();
      x.font = `800 18px ${FONT}`; x.fillText('START', ox, top - 24); x.textAlign = 'right'; x.fillText('END', ox + mw, top + mh + 6); x.textAlign = 'left';
      if (withSol) { x.lineWidth = Math.max(3, cell / 4); x.beginPath(); sol.forEach((i, k) => { const px = ox + (i % cols) * cell + cell / 2, py = top + ((i / cols) | 0) * cell + cell / 2; x[k ? 'lineTo' : 'moveTo'](px, py); }); x.stroke(); }
    });
    return { ...draw(false), extra: draw(true) };
  }

  // ---------------- sudoku ----------------
  function sudokuSolve(g, limit, randomise) {
    let count = 0, first = null;
    const rec = () => {
      let best = -1, bestM = 0, bestN = 10;
      for (let i = 0; i < 81; i++) if (!g[i]) {
        const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0); let used = 0;
        for (let k = 0; k < 9; k++) { used |= 1 << (g[r * 9 + k] || 0); used |= 1 << (g[k * 9 + c] || 0); }
        for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 3; cc++) used |= 1 << (g[((((b / 3) | 0) * 3 + rr) * 9) + (b % 3) * 3 + cc] || 0);
        let n = 0; for (let v = 1; v <= 9; v++) if (!(used & (1 << v))) n++;
        if (n < bestN) { bestN = n; best = i; bestM = used; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (!first) first = g.slice(); return count >= limit; }
      const vals = []; for (let v = 1; v <= 9; v++) if (!(bestM & (1 << v))) vals.push(v);
      if (randomise) shuffle(vals);
      for (const v of vals) { g[best] = v; if (rec()) { g[best] = 0; return true; } }
      g[best] = 0; return false;
    };
    rec(); return { count, first };
  }
  function sudoku(clues) {
    const full = sudokuSolve(new Array(81).fill(0), 1, true).first, puz = full.slice(), order = shuffle([...Array(81).keys()]);
    let left = 81;
    for (const i of order) { if (left <= clues) break; const keep = puz[i]; puz[i] = 0; if (sudokuSolve(puz.slice(), 2, false).count !== 1) puz[i] = keep; else left--; }
    const cell = 40, ox = (W - 9 * cell) >> 1, top = 50, H2 = top + 9 * cell + 20;
    const draw = (g, withAll) => page(H2, x => {
      x.font = `800 30px ${FONT}`; x.textAlign = 'center'; x.fillText(withAll ? 'SUDOKU: ANSWER' : 'SUDOKU', W / 2, 8);
      x.font = `800 27px ${FONT}`; x.textBaseline = 'middle';
      for (let i = 0; i < 81; i++) if (g[i]) { const given = puz[i]; if (withAll && !given) x.font = `400 24px ${FONT}`; else x.font = `800 27px ${FONT}`; x.fillText(String(g[i]), ox + (i % 9) * cell + cell / 2, top + ((i / 9) | 0) * cell + cell / 2 + 1); }
      x.textAlign = 'left'; x.textBaseline = 'top';
      for (let k = 0; k <= 9; k++) { x.lineWidth = k % 3 ? 1 : 4; x.beginPath(); x.moveTo(ox, top + k * cell); x.lineTo(ox + 9 * cell, top + k * cell); x.moveTo(ox + k * cell, top); x.lineTo(ox + k * cell, top + 9 * cell); x.stroke(); }
    });
    return { ...draw(puz, false), extra: draw(full, true) };
  }

  // ---------------- word search ----------------
  const THEMES = {
    animals: 'CAT DOG FOX OWL BEAR HORSE TIGER ZEBRA MOUSE SHEEP RABBIT OTTER',
    space: 'MOON STAR MARS COMET ORBIT EARTH VENUS ROCKET SOLAR GALAXY ALIEN SATURN',
    food: 'PIZZA PASTA APPLE BREAD CHEESE LEMON MANGO SALAD TOAST BACON COOKIE NOODLE',
    games: 'MARIO ZELDA TETRIS PONG SONIC KIRBY PIXEL JOYPAD ARCADE LEVEL SPRITE BOSS',
    sea: 'SHARK WHALE CRAB SQUID OCTOPUS CORAL REEF TIDE WAVE SHELL SEAL DOLPHIN',
  };
  function wordsearch(words) {
    const N = 12, g = new Array(N * N).fill(''), dirs = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]], placed = [];
    for (const w of words) {
      for (let t = 0; t < 300; t++) {
        const [dx, dy] = dirs[rnd(8)], x0 = rnd(N), y0 = rnd(N), x1 = x0 + dx * (w.length - 1), y1 = y0 + dy * (w.length - 1);
        if (x1 < 0 || y1 < 0 || x1 >= N || y1 >= N) continue;
        let ok = true; for (let i = 0; i < w.length; i++) { const c = g[(y0 + dy * i) * N + x0 + dx * i]; if (c && c !== w[i]) { ok = false; break; } }
        if (!ok) continue;
        for (let i = 0; i < w.length; i++) g[(y0 + dy * i) * N + x0 + dx * i] = w[i];
        placed.push(w); break;
      }
    }
    for (let i = 0; i < g.length; i++) if (!g[i]) g[i] = String.fromCharCode(65 + rnd(26));
    const cell = 30, ox = (W - N * cell) >> 1, top = 50, listTop = top + N * cell + 14, rowsN = Math.ceil(placed.length / 2), H2 = listTop + rowsN * 28 + 14;
    return page(H2, x => {
      x.font = `800 30px ${FONT}`; x.textAlign = 'center'; x.fillText('WORD SEARCH', W / 2, 8);
      x.font = `800 21px ${FONT}`; x.textBaseline = 'middle';
      for (let i = 0; i < g.length; i++) x.fillText(g[i], ox + (i % N) * cell + cell / 2, top + ((i / N) | 0) * cell + cell / 2 + 1);
      x.textAlign = 'left'; x.textBaseline = 'top'; x.lineWidth = 3; x.strokeRect(ox - 2, top - 2, N * cell + 4, N * cell + 4);
      x.font = `700 19px ${FONT}`;
      placed.forEach((w, i) => { const px = 28 + (i % 2) * 180, py = listTop + ((i / 2) | 0) * 28; x.lineWidth = 2; x.strokeRect(px, py + 3, 16, 16); x.fillText(w, px + 26, py + 1); });
    });
  }

  // ---------------- fortunes / weather ----------------
  const FORTUNES = ['A small thing you do today will matter later.', 'Someone is about to say yes.', 'Your next idea is the good one.', 'Take the long way home. Notice things.', 'Today favours the curious.', 'The thing you are avoiding is smaller than you think.', 'A snack will solve more than you expect.', 'You will find what you lost when you stop looking.', 'Say the kind thing out loud.', 'Luck is on its way. Leave the door open.', 'Finish one tiny task. Feel the momentum.', 'A message you have been waiting for will arrive.', 'Today is a good day to start the thing.', 'Rest is productive too.', 'Ask the question. The answer is friendlier than you fear.', 'Your future self says thanks for the water you drank today.', 'Two small steps beat one big plan.', 'Something delightful hides in the ordinary today.', 'Make something. Anything. Today.', 'Be the reason someone smiles.', 'You are closer than it looks.', 'Tonight: early bed. Tomorrow: a better you.', 'The cat is right. Nap.', 'Try the new thing. The old thing will wait.', 'A surprise is folded into your afternoon.'];
  const WCODE = c => c === 0 ? 'Clear' : c <= 3 ? 'Cloudy' : c <= 48 ? 'Fog' : c <= 57 ? 'Drizzle' : c <= 67 ? 'Rain' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : c <= 86 ? 'Snow showers' : 'Thunderstorm';
  let weatherText = '';
  async function fetchWeather() {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000 }));
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude.toFixed(2)}&longitude=${pos.coords.longitude.toFixed(2)}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=1`;
    const j = await (await fetch(u)).json(), d = j.daily;
    weatherText = `${WCODE(d.weather_code[0])}  ${Math.round(d.temperature_2m_min[0])}–${Math.round(d.temperature_2m_max[0])}°C`;
    return weatherText;
  }

  // ---------------- drawing pad state ----------------
  const pad = { layer: cvs(W, H), undo: [], bg: null, pen: 'black', size: 6 };
  pad.layer.getContext('2d').clearRect(0, 0, W, H);
  function padComposite() {
    const c = cvs(W, H), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    if (pad.bg) x.drawImage(Prt.bitsCanvas(pad.bg), 0, 0);
    x.drawImage(pad.layer, 0, 0); return c;
  }

  // ---------------- strip footer (also used by Shots.strip) ----------------
  function stripFooter() {
    const f = saved.footer || { date: true, caption: '', qr: '' }, parts = [];
    if (f.caption) parts.push(Prt.textBits(f.caption, { size: 26 }));
    if (f.qr) { try { parts.push(qrCanvas(f.qr, 170)); } catch (e) { log('QR too long', e.message); } }
    if (f.date !== false) parts.push(Prt.textBits(today(), { size: 20, bold: false }));
    return parts;
  }

  // ---------------- panels ----------------
  const field = (n, label, type, val, extra) => `<label class="sub" style="display:block;margin-top:8px">${label}</label>` + (type === 'textarea' ? `<textarea name="${n}" rows="3" ${extra || ''}>${val || ''}</textarea>` : `<input name="${n}" type="${type || 'text'}" value="${val == null ? '' : val}" ${extra || ''}>`);
  const sel = (n, label, opts, def) => `<label class="sub" style="display:block;margin-top:8px">${label}</label><select name="${n}">${opts.map(([v, t]) => `<option value="${v}"${v === def ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const chk = (n, label, on) => `<label class="chk"><input type="checkbox" name="${n}"${on ? ' checked' : ''}> ${label}</label>`;

  const KINDS = {
    strip: {
      title: '📸 Photo-booth strip',
      html: () => `<div class="sub">Set the footer used for photo-booth strips. Take a strip from the Cam tab (shutter mode → Strip), or build one now from your latest photos.</div>`
        + field('title', 'Title', 'text', 'PHOTO BOOTH', 'maxlength="30"') + field('caption', 'Caption under the photos', 'text', (saved.footer || {}).caption, 'maxlength="60"')
        + field('qr', 'QR code text/link (optional, stored inside the QR itself)', 'text', (saved.footer || {}).qr, 'placeholder="https://… or any text"') + chk('date', 'Date', (saved.footer || {}).date !== false)
        + sel('count', 'Photos', [['3', '3'], ['4', '4']], '3') + sel('crop', 'Frame shape', [['full', 'Full (384×336)'], ['wide', 'Wide (384×240, shorter strip)']], 'wide')
        + '<div class="sub">Building from your latest photos uses the newest saved photos in the album.</div>',
      async build(r, v) {
        saved.footer = { date: v('date').checked, caption: v('caption').value, qr: v('qr').value }; store();
        const all = (await dbAll()).reverse().slice(0, +v('count').value); if (!all.length) throw new Error('No saved photos yet. Take some in the Cam tab first.');
        const c = cfg(), parts = [Prt.textBits(v('title').value || ' ', { size: 30 })];
        for (const s of all) {
          const g = new Float32Array(W * H); for (let i = 0; i < g.length; i++) g[i] = s.gray[i] / 255;
          let b = process(g, c).bits, hh = H; if (v('crop').value === 'wide') { b = b.slice(48 * W, (48 + 240) * W); hh = 240; }
          parts.push(Prt.solid(5)); parts.push({ bits: b, h: hh });
        }
        parts.push(Prt.solid(5)); for (const p of stripFooter()) parts.push(p); parts.push(Prt.blank(8));
        return Prt.stack(parts);
      },
    },
    sticker: {
      title: '🏷 Photo sticker',
      html: () => `<div class="sub">Turns the photo currently on the Cam screen (or the one you opened from Photos) into a die-cut style sticker with a dashed cut line.</div>`
        + sel('shape', 'Shape', [['circle', 'Circle'], ['rounded', 'Rounded square'], ['heart', 'Heart'], ['star', 'Star']], 'circle') + field('label', 'Label under it (optional)', 'text', '', 'maxlength="40"'),
      build(r, v) { if (!lastBits) throw new Error('No photo yet. Open the Cam tab and let the camera start, or open a photo.'); return sticker(v('shape').value, lastBits, v('label').value); },
    },
    code: {
      title: '🔳 QR / barcode label',
      html: () => sel('type', 'Type', [['text', 'QR: text or link'], ['wifi', 'QR: Wi-Fi login'], ['contact', 'QR: contact card'], ['app', 'QR: this app’s link'], ['bar', 'Barcode (Code 128)']], 'text')
        + field('a', 'Text / link / network name / name', 'text', '') + field('b', 'Wi-Fi password / phone / (unused)', 'text', '') + field('c', 'Email (contact only)', 'text', '')
        + field('cap', 'Caption under it', 'text', '', 'maxlength="50"') + `<div class="ctl"><span>Size</span><input name="size" type="range" min="180" max="380" step="10" value="300"><output></output></div>`
        + `<div class="sub">QR codes hold their content inside the code, so they work with no website. Barcodes take plain letters and digits.</div>`,
      build(r, v) {
        const t = v('type').value, a = v('a').value.trim(), b = v('b').value.trim(), c = v('c').value.trim(), esc = s => s.replace(/([\\;,:"])/g, '\\$1'); let blk;
        if (t === 'text') { if (!a) throw new Error('Type something to encode.'); blk = qrCanvas(a, +v('size').value); }
        else if (t === 'wifi') { if (!a) throw new Error('Enter the network name.'); blk = qrCanvas(`WIFI:T:${b ? 'WPA' : 'nopass'};S:${esc(a)};P:${esc(b)};;`, +v('size').value); }
        else if (t === 'contact') { if (!a) throw new Error('Enter a name.'); blk = qrCanvas(`MECARD:N:${esc(a)};${b ? 'TEL:' + esc(b) + ';' : ''}${c ? 'EMAIL:' + esc(c) + ';' : ''};`, +v('size').value); }
        else if (t === 'app') blk = qrCanvas(location.href.split('#')[0], +v('size').value);
        else { if (!a) throw new Error('Type something to encode.'); blk = barcodeBlock(a, 110); const parts = [Prt.blank(10), blk, Prt.textBits(a, { size: 22, bold: false })]; if (v('cap').value) parts.push(Prt.textBits(v('cap').value, { size: 28 })); return Prt.stack(parts); }
        const parts = [blk]; if (v('cap').value) parts.push(Prt.textBits(v('cap').value, { size: 28 })); else if (t === 'wifi') parts.push(Prt.textBits('Wi-Fi: ' + a, { size: 26 }));
        parts.push(Prt.blank(6)); return Prt.stack(parts);
      },
    },
    todo: {
      title: '☑ To-do list',
      html: () => field('items', 'One item per line', 'textarea', 'Buy milk\nCall mum\nFeed the cat', 'rows="5"') + field('blanks', 'Extra empty boxes', 'number', 3, 'min="0" max="20"') + field('head', 'Heading', 'text', 'TO DO'),
      build(r, v) {
        const items = v('items').value.split('\n').map(s => s.trim()).filter(Boolean), blanks = Math.max(0, +v('blanks').value || 0), parts = [Prt.textBits(v('head').value || ' ', { size: 44 }), Prt.textBits(today({ weekday: 'long', day: 'numeric', month: 'long' }), { size: 20, bold: false })];
        const row = text => { const m = cvs(W, 10).getContext('2d'); m.font = `600 26px ${FONT}`; const lines = text ? wrapLines(m, text, W - 74) : ['']; const h = Math.max(48, lines.length * 32 + 16);
          return page(h, x => { x.lineWidth = 3; x.strokeRect(16, 12, 26, 26); x.font = `600 26px ${FONT}`; lines.forEach((l, i) => x.fillText(l, 58, 12 + i * 32)); x.setLineDash([2, 5]); x.lineWidth = 2; x.beginPath(); x.moveTo(10, h - 3); x.lineTo(W - 10, h - 3); x.stroke(); }); };
        for (const t of items) parts.push(row(t)); for (let i = 0; i < blanks; i++) parts.push(row('')); parts.push(Prt.blank(10)); return Prt.stack(parts);
      },
    },
    day: {
      title: '☀ Day card & fortune',
      html: () => field('note', 'Note for today (optional)', 'text', '', 'maxlength="80"') + chk('fort', 'Add a fortune', true) + chk('wx', 'Add weather (asks for location, sends rounded coordinates to open-meteo.com)', false) + `<div class="row"><button name="fetchwx" type="button">Fetch weather now</button><span class="sub" name="wxout"></span></div>`,
      async build(r, v) {
        if (v('wx').checked && !weatherText) { try { await fetchWeather(); r.querySelector('[name=wxout]').textContent = weatherText; } catch (e) { log('weather failed', e.message); } }
        const d = new Date(), parts = [Prt.blank(6), Prt.textBits(d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase(), { size: 58 }), Prt.textBits(d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), { size: 28, bold: false })];
        if (v('wx').checked && weatherText) parts.push(Prt.textBits(weatherText, { size: 28 }));
        if (v('note').value) { parts.push(Prt.solid(3)); parts.push(Prt.textBits(v('note').value, { size: 28 })); }
        if (v('fort').checked) { parts.push(Prt.solid(3)); parts.push(Prt.textBits('✦ ' + FORTUNES[rnd(FORTUNES.length)] + ' ✦', { size: 26, bold: false })); }
        parts.push(Prt.blank(8)); return Prt.stack(parts);
      },
      init(r) { r.querySelector('[name=fetchwx]').onclick = async () => { const o = r.querySelector('[name=wxout]'); o.textContent = '…'; try { o.textContent = await fetchWeather(); } catch (e) { o.textContent = 'failed: ' + e.message; } }; },
    },
    dice: {
      title: '🎲 Coin / dice / decider',
      html: () => sel('what', 'Roll', [['coin', 'Coin flip'], ['d6', 'Six-sided die'], ['d20', 'D20'], ['yn', 'Yes / No'], ['pick', 'Pick from my list']], 'coin') + field('list', 'List for “Pick” (one per line)', 'textarea', 'Pizza\nCurry\nTacos', 'rows="3"'),
      build(r, v) {
        const w = v('what').value; let txt, pips = 0;
        if (w === 'coin') txt = rnd(2) ? 'HEADS' : 'TAILS'; else if (w === 'd6') { pips = 1 + rnd(6); txt = String(pips); } else if (w === 'd20') txt = String(1 + rnd(20));
        else if (w === 'yn') txt = ['YES', 'NO', 'MAYBE'][rnd(3)]; else { const l = v('list').value.split('\n').map(s => s.trim()).filter(Boolean); if (!l.length) throw new Error('Add some options.'); txt = l[rnd(l.length)]; }
        if (pips) return page(230, x => { x.lineWidth = 8; x.beginPath(); x.roundRect ? x.roundRect(92, 20, 200, 200, 36) : x.rect(92, 20, 200, 200); x.stroke(); const P = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[pips]; for (const k of P) { x.beginPath(); x.arc(142 + (k % 3) * 50, 70 + ((k / 3) | 0) * 50, 15, 0, 7); x.fill(); } });
        const t = Prt.textBits(txt, { size: txt.length > 6 ? 56 : 84 }); return Prt.stack([Prt.blank(10), t, Prt.blank(10)]);
      },
    },
    scroll: {
      title: '📜 Scroll message',
      html: () => field('head', 'Title', 'text', 'HEAR YE!', 'maxlength="30"') + field('msg', 'Message', 'textarea', 'You are hereby invited to tea and cake.', 'rows="4"') + sel('size', 'Text size', [['22', 'Small'], ['28', 'Medium'], ['36', 'Large']], '28')
        + `<div class="sub">A parchment scroll with rolled ends, for invitations, notes and awards. The same scroll border is in Fun → Frame.</div>`,
      build(r, v) {
        const sz = +v('size').value, m = cvs(W, 10).getContext('2d'); m.font = `600 ${sz}px ${FONT}`;
        const lines = wrapLines(m, v('msg').value || ' ', W - 100), lh = Math.round(sz * 1.25), top = 50, titleH = v('head').value ? 56 : 0, h = Math.max(220, top + titleH + lines.length * lh + 70);
        const s = page(h, x => {
          x.textAlign = 'center'; let y = top;
          if (v('head').value) { x.font = `800 38px ${FONT}`; x.fillText(v('head').value, W / 2, y); y += 46; x.lineWidth = 2; x.beginPath(); x.moveTo(110, y); x.lineTo(W / 2 - 14, y); x.moveTo(W / 2 + 14, y); x.lineTo(W - 110, y); x.stroke(); x.beginPath(); x.moveTo(W / 2, y - 6); x.lineTo(W / 2 + 6, y); x.lineTo(W / 2, y + 6); x.lineTo(W / 2 - 6, y); x.closePath(); x.fill(); y += 12; }
          x.font = `600 ${sz}px ${FONT}`; lines.forEach((l, i) => x.fillText(l, W / 2, y + i * lh));
          Overlay.frameFns.scroll(x, W, h);
        });
        return s;
      },
    },
    maze: {
      title: '🌀 Maze',
      html: () => sel('size', 'Size', [['8', 'Small (easy)'], ['14', 'Medium'], ['20', 'Large'], ['26', 'Huge']], '14') + `<div class="sub">A new maze every time. The preview has a button to print the answer.</div>`,
      build(r, v) { const cols = +v('size').value, cell = Math.floor(360 / cols); return maze(cols, Math.round(cols * 1.15), cell); },
    },
    sudoku: {
      title: '🔢 Sudoku',
      html: () => sel('lvl', 'Difficulty', [['40', 'Easy'], ['33', 'Medium'], ['28', 'Hard']], '33') + `<div class="sub">Every puzzle has exactly one solution.</div>`,
      build(r, v) { return sudoku(+v('lvl').value); },
    },
    words: {
      title: '🔤 Word search',
      html: () => sel('theme', 'Theme', [['animals', 'Animals'], ['space', 'Space'], ['food', 'Food'], ['games', 'Retro games'], ['sea', 'Sea']], 'animals') + field('own', 'Or your own words (comma separated, up to 10, letters only)', 'text', '', 'placeholder="CAT, MILK, PAWS"'),
      build(r, v) {
        let w = v('own').value.toUpperCase().split(/[^A-Z]+/).filter(s => s.length > 1 && s.length <= 12).slice(0, 10);
        if (!w.length) w = shuffle(THEMES[v('theme').value].split(' ')).slice(0, 9);
        return wordsearch(w);
      },
    },
    draw: {
      title: '✏ Drawing pad',
      html: () => `<canvas name="pad" width="${W}" height="${H}" style="width:100%;max-width:384px;display:block;margin:6px auto;background:#fff;border:2px solid #555;border-radius:4px;touch-action:none"></canvas>`
        + `<div class="ctl"><span>Pen size</span><input name="psize" type="range" min="2" max="40" step="1" value="6"><output></output></div>`
        + `<div class="row"><button name="black" type="button" class="pri">Black pen</button><button name="white" type="button">White (eraser)</button><button name="undo" type="button">↶ Undo</button><button name="clear" type="button">Clear</button></div>`
        + `<div class="row"><button name="photo" type="button">Use current photo as background</button><button name="nophoto" type="button">No background</button></div>`
        + `<div class="sub">Draw with a finger. The print is exactly what you see (black and white only).</div>`,
      build() { const c = padComposite(); return { bits: Prt.canvasBits(c), h: H }; },
      init(r) {
        const cv = r.querySelector('[name=pad]'), x = cv.getContext('2d'), lx = pad.layer.getContext('2d'); let down = false, last = null;
        const redraw = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(padComposite(), 0, 0); };
        const pt = e => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; };
        const seg = (a, b) => { lx.strokeStyle = pad.pen === 'black' ? '#000' : '#fff'; lx.fillStyle = lx.strokeStyle; lx.lineWidth = pad.size; lx.lineCap = lx.lineJoin = 'round'; lx.beginPath(); lx.moveTo(a[0], a[1]); lx.lineTo(b[0], b[1]); lx.stroke(); if (a[0] === b[0] && a[1] === b[1]) { lx.beginPath(); lx.arc(a[0], a[1], pad.size / 2, 0, 7); lx.fill(); } };
        cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); down = true; pad.undo.push(lx.getImageData(0, 0, W, H)); if (pad.undo.length > 20) pad.undo.shift(); last = pt(e); seg(last, last); redraw(); e.preventDefault(); };
        cv.onpointermove = e => { if (!down) return; const p = pt(e); seg(last, p); last = p; redraw(); e.preventDefault(); };
        cv.onpointerup = cv.onpointercancel = () => { down = false; };
        const ps = r.querySelector('[name=psize]'); ps.oninput = () => { pad.size = +ps.value; const o = ps.nextElementSibling; if (o) o.textContent = ps.value; }; ps.oninput();
        const setPen = k => { pad.pen = k; r.querySelector('[name=black]').className = k === 'black' ? 'pri' : ''; r.querySelector('[name=white]').className = k === 'white' ? 'pri' : ''; };
        r.querySelector('[name=black]').onclick = () => setPen('black'); r.querySelector('[name=white]').onclick = () => setPen('white');
        r.querySelector('[name=undo]').onclick = () => { const s = pad.undo.pop(); if (s) { lx.putImageData(s, 0, 0); redraw(); } };
        r.querySelector('[name=clear]').onclick = () => { pad.undo.push(lx.getImageData(0, 0, W, H)); lx.clearRect(0, 0, W, H); redraw(); };
        r.querySelector('[name=photo]').onclick = () => { if (!lastBits) { alert('No photo yet.'); return; } pad.bg = lastBits.slice(); redraw(); };
        r.querySelector('[name=nophoto]').onclick = () => { pad.bg = null; redraw(); };
        pad.redraw = redraw; redraw();
      },
      noPrintButtons: false,
    },
  };

  // ---------------- UI ----------------
  const panels = {};
  function build() {
    root.innerHTML = '';
    const head = document.createElement('div'); head.className = 'row';
    const pick = document.createElement('select'); pick.id = 'mkkind'; pick.style.flex = '1';
    for (const [k, p] of Object.entries(KINDS)) { const o = document.createElement('option'); o.value = k; o.textContent = p.title; pick.appendChild(o); }
    head.appendChild(pick); root.appendChild(head);
    for (const [k, p] of Object.entries(KINDS)) {
      const d = document.createElement('div'); d.dataset.kind = k; d.hidden = true; d.innerHTML = p.html();
      const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '10px';
      const pv = document.createElement('button'); pv.textContent = ['maze', 'sudoku', 'words', 'dice'].includes(k) ? '🔀 Generate / preview' : 'Preview'; const pr = document.createElement('button'); pr.className = 'pri'; pr.textContent = '🖨 Print';
      row.append(pv, pr); d.appendChild(row); root.appendChild(d); panels[k] = d;
      const v = n => d.querySelector('[name=' + n + ']');
      d.querySelectorAll('input[type=range]').forEach(r => { const o = r.nextElementSibling; if (o && o.tagName === 'OUTPUT') { const f = () => o.textContent = r.value; r.addEventListener('input', f); f(); } });
      const run = async doPrint => {
        try {
          const s = await p.build(d, v); if (!s) return;
          const extra = s.extra ? { text: '🖨 Print answer', fn: () => Prt.printBits(s.extra.bits, k + '-answer') } : null;
          if (doPrint) await Prt.printBits(s.bits, k); else Prt.previewBits(s.bits, k, extra);
        } catch (e) { alert(e.message); log('make error', e.message); }
      };
      pv.onclick = () => run(false); pr.onclick = () => run(true);
      if (p.init) p.init(d);
    }
    pick.onchange = () => show(pick.value);
    let first = 'strip'; try { first = localStorage.getItem('catcam-mk') || 'strip'; } catch (e) { } if (!KINDS[first]) first = 'strip'; pick.value = first; show(first);
  }
  function show(k) { for (const [n, d] of Object.entries(panels)) d.hidden = n !== k; try { localStorage.setItem('catcam-mk', k); } catch (e) { } if (k === 'draw' && pad.redraw) pad.redraw(); }

  build();
  return { stripFooter, qrCanvas, code128, barcodeBlock, sticker, maze, sudoku, sudokuSolve, wordsearch, show, KINDS, panels, pad, padComposite };
})();
