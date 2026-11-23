'use strict';
// Make tab: things worth printing. Photo-booth strip footer (caption/QR), shaped photo stickers, QR + barcode labels,
// to-do / day cards, dice, maze / sudoku / word search, and a drawing pad. All static: no server needed (QR carries its own text).
const Make = (() => {
  const root = $('makeview');
  const SKEY = 'catcam-make';
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch (e) { }
  const store = () => { try { localStorage.setItem(SKEY, JSON.stringify(saved)); } catch (e) { } };
  const rnd = n => Math.floor(Math.random() * n);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
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

  let ansiDoc = null, ansiKind = null;
  // ---------------- picture -> 384x336 Floyd-Steinberg bits ----------------
  let pickedBits = null;
  function ditherBitmap(bmp, o) { // o: fit 'cover' (384x336, default) or 'width' (384 wide, keeps proportions); method 'fs' | 'bayer' | 'thresh'; invert
    o = o || {}; const hh = o.fit === 'width' ? Math.max(120, Math.min(900, Math.round(W * bmp.height / bmp.width))) : H;
    const c = cvs(W, hh), x = c.getContext('2d'), k = o.fit === 'width' ? W / bmp.width : Math.max(W / bmp.width, hh / bmp.height), dw = bmp.width * k, dh = bmp.height * k;
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, hh); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, (W - dw) / 2, (hh - dh) / 2, dw, dh);
    const d = x.getImageData(0, 0, W, hh).data, g = new Float32Array(W * hh), bits = new Uint8Array(W * hh);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let lo = 255, hi = 0; for (const v of g) { if (v < lo) lo = v; if (v > hi) hi = v; } const sc = hi > lo ? 255 / (hi - lo) : 1; for (let i = 0; i < g.length; i++) { g[i] = (g[i] - lo) * sc; if (o.invert) g[i] = 255 - g[i]; } // auto-contrast
    const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    if (o.method === 'bayer') { for (let y = 0; y < hh; y++) for (let xx = 0; xx < W; xx++) bits[y * W + xx] = g[y * W + xx] < (BAY[(y & 3) * 4 + (xx & 3)] + 0.5) * 16 ? 1 : 0; }
    else if (o.method === 'thresh') { for (let i = 0; i < g.length; i++) bits[i] = g[i] < 118 ? 1 : 0; }
    else for (let y = 0; y < hh; y++) for (let xx = 0; xx < W; xx++) { const i = y * W + xx, v = g[i], n = v < 128 ? 0 : 255, e = v - n; bits[i] = n ? 0 : 1;
      if (xx + 1 < W) g[i + 1] += e * 7 / 16; if (y + 1 < hh) { if (xx > 0) g[i + W - 1] += e * 3 / 16; g[i + W] += e * 5 / 16; if (xx + 1 < W) g[i + W + 1] += e / 16; } }
    bits.h = hh; return bits;
  }

  const pickerHtml = `<div class="row"><button name="pickimg" type="button">🖼 Use a picture from my phone…</button><button name="clearimg" type="button">Use camera photo</button><input name="imgfile" type="file" accept="image/*" hidden></div><div class="sub" name="imgnote"></div>`;
  function pickerInit(r) {
    const f = r.querySelector('[name=imgfile]'), note = r.querySelector('[name=imgnote]');
    if (pickedBits && note) note.textContent = 'Using the picture you chose';
    r.querySelector('[name=pickimg]').onclick = () => f.click();
    r.querySelector('[name=clearimg]').onclick = () => { pickedBits = null; note.textContent = ''; r.dispatchEvent(new Event('input', { bubbles: true })); };
    f.onchange = async () => { const file = f.files[0]; if (!file) return; try { const bmp = await createImageBitmap(file); pickedBits = ditherBitmap(bmp); note.textContent = 'Using ' + file.name; r.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { toast('Could not read that picture', 'bad'); } f.value = ''; };
  }


  function wantedPoster(src, name, crime, reward, tagline, worn) {
    const SERIF = 'Georgia, "Times New Roman", serif', PW = W, px = 20, pw = 344, ph = 300, sx = 20, sy = 16;
    const m = cvs(10, 10).getContext('2d');
    const fit = (txt, weight, max, maxW) => { let sz = max; for (; sz > 14; sz -= 2) { m.font = `${weight} ${sz}px ${SERIF}`; if (m.measureText(txt).width <= maxW) break; } return sz; };
    const nm = name.toUpperCase(), nsz = fit(nm, 900, 46, PW - 50), rw = reward || '$5,000', rsz = fit(rw, 900, 78, PW - 50);
    m.font = `italic 600 22px ${SERIF}`; let cl = wrapLines(m, 'For: ' + (crime || 'Crimes unknown'), PW - 60);
    cl = cl.flatMap(l => { const out = []; while (m.measureText(l).width > PW - 60 && l.length > 4) { let k = l.length; while (k > 3 && m.measureText(l.slice(0, k)).width > PW - 60) k--; out.push(l.slice(0, k)); l = l.slice(k); } out.push(l); return out; });
    if (cl.length > 4) { cl = cl.slice(0, 4); let l = cl[3]; while (l.length > 1 && m.measureText(l + '…').width > PW - 60) l = l.slice(0, -1); cl[3] = l + '…'; }
    const top = 14, headH = 92, tagH = 36, photoY = top + headH + tagH + 6, nameY = photoY + ph + 12, rewY = nameY + nsz + 14, amtY = rewY + 26, crimeY = amtY + rsz + 14, H = crimeY + cl.length * 28 + 54;
    const rand = rng(Array.from(name + crime).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
    return page(H, x => {
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      x.lineWidth = 8; x.strokeRect(5, 5, PW - 10, H - 10); x.lineWidth = 2; x.strokeRect(14, 14, PW - 28, H - 28);
      for (const [cx, cy] of [[26, 26], [PW - 26, 26], [26, H - 26], [PW - 26, H - 26]]) { x.font = `700 16px ${SERIF}`; x.fillText('★', cx, cy + 6); }
      x.fillStyle = '#000'; const hs = fit('WANTED', 900, 88, PW - 100); x.font = `900 ${hs}px ${SERIF}`; x.letterSpacing = '4px'; x.fillText('WANTED', PW / 2 + 2, top + 82); x.letterSpacing = '0px';
      x.fillRect(px, top + headH + 2, pw, tagH - 4); x.fillStyle = '#fff'; { const ls = tagline.length > 20 ? 1 : 3; let ts = 22; for (; ts > 10; ts -= 1) { x.font = `800 ${ts}px ${SERIF}`; x.letterSpacing = ls + 'px'; if (x.measureText(tagline).width <= pw - 24) break; } x.fillText(tagline, PW / 2 + ls / 2, top + headH + 18 + ts * 0.35); x.letterSpacing = '0px'; } x.fillStyle = '#000';
      if (src) x.drawImage(Prt.bitsCanvas(src), sx, sy, pw, ph, px, photoY, pw, ph); x.lineWidth = 6; x.strokeRect(px - 3, photoY - 3, pw + 6, ph + 6);
      x.font = `900 ${nsz}px ${SERIF}`; x.fillText(nm, PW / 2, nameY + nsz * 0.85);
      x.font = `800 22px ${SERIF}`; x.letterSpacing = '6px'; x.fillText('REWARD', PW / 2 + 3, rewY + 14); x.letterSpacing = '0px';
      x.font = `900 ${rsz}px ${SERIF}`; x.fillText(rw, PW / 2, amtY + rsz * 0.82);
      x.font = `italic 600 22px ${SERIF}`; cl.forEach((l, i) => x.fillText(l, PW / 2, crimeY + 20 + i * 28));
      x.font = `700 14px ${SERIF}`; x.fillText('★  BY ORDER OF THE SHERIFF  ★', PW / 2, H - 28);
      if (worn) { // speckles and nicks on the paper (not over the photo)
        for (let i = 0; i < 520; i++) { const wx = rand() * PW, wy = rand() * H; if (wx > px - 4 && wx < px + pw + 4 && wy > photoY - 4 && wy < photoY + ph + 4) continue; x.fillStyle = rand() < 0.5 ? '#fff' : '#000'; const r = rand() < 0.9 ? 1 : 2; x.fillRect(wx, wy, r, r); }
        x.strokeStyle = '#fff'; x.lineWidth = 2; x.setLineDash([10, 6, 3, 8]); x.beginPath(); x.moveTo(0, H * 0.5 + 2); x.lineTo(PW, H * 0.5 - 3); x.stroke(); x.setLineDash([]);
      }
    });
  }


  // ---------------- image search ----------------
  let searchSel = null;
  const strip = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
  async function commonsSearch(q, offset) {
    const u = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=24&gsroffset=' + offset + '&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=240&iiextmetadatafilter=Artist|LicenseShortName&format=json&origin=*';
    const j = await (await fetch(u)).json(), pages = j.query ? Object.values(j.query.pages).sort((a, b) => a.index - b.index) : [];
    const items = pages.filter(p => p.imageinfo && p.imageinfo[0] && p.imageinfo[0].thumburl && /^image\/(jpeg|png)/.test(p.imageinfo[0].mime)).map(p => { const i = p.imageinfo[0], m = i.extmetadata || {}; const art = strip(m.Artist && m.Artist.value).slice(0, 40), lic = strip(m.LicenseShortName && m.LicenseShortName.value); return { title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''), thumb: i.thumburl, full: i.thumburl.replace(/\/\d+px-([^/]+)$/, '/500px-$1'), credit: [art, lic, 'Wikimedia Commons'].filter(Boolean).join(' · ') }; });
    return { items, next: j.continue ? j.continue.gsroffset : null };
  }
  async function googleSearch(q, start, key, cx) {
    if (!key || !cx) throw new Error('Open “Use Google instead” below and enter your API key and search engine ID first.');
    const u = 'https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(key) + '&cx=' + encodeURIComponent(cx) + '&searchType=image&safe=active&num=10&start=' + start + '&q=' + encodeURIComponent(q), res = await fetch(u), j = await res.json();
    if (j.error) throw new Error('Google said: ' + (j.error.message || res.status));
    return { items: (j.items || []).map(it => ({ title: it.title, thumb: (it.image && it.image.thumbnailLink) || it.link, full: 'https://images.weserv.nl/?w=700&output=jpg&url=' + encodeURIComponent(it.link), credit: (it.displayLink || '') + ' (via Google)' })), next: (j.queries && j.queries.nextPage) ? j.queries.nextPage[0].startIndex : null };
  }
  function searchInit(r) {
    const q = n => r.querySelector('[name=' + n + ']'); let items = [], next = null, loading = false;
    const status = t => { q('status').textContent = t || ''; };
    const draw = () => { const g = q('grid'); g.innerHTML = ''; items.forEach((it, i) => { const im = new Image(); im.src = it.thumb; im.alt = it.title; im.loading = 'lazy'; im.title = it.title; im.onclick = () => pick(i); im.className = searchSel && searchSel.it === it ? 'on' : ''; g.appendChild(im); }); };
    async function run(more) {
      if (loading) return; const term = q('q').value.trim(); if (!term) { status('Type what you want to search for.'); return; } loading = true; status('Searching…');
      try {
        const res = q('src').value === 'google' ? await googleSearch(term, more ? next : 1, q('gkey').value.trim(), q('gcx').value.trim()) : await commonsSearch(term, more ? next : 0);
        items = more ? items.concat(res.items) : res.items; next = res.next; draw(); q('more').hidden = !next; status(items.length ? 'Tap a picture to use it.' : 'Nothing found. Try another word.');
      } catch (e) { status('Search failed: ' + e.message); } finally { loading = false; }
    }
    async function pick(i) {
      const it = items[i]; status('Loading the picture…');
      try { const resp = await fetch(it.full); if (!resp.ok) throw new Error('HTTP ' + resp.status); const blob = await resp.blob(); let bmp; try { bmp = await createImageBitmap(blob); } catch (e) { const t2 = await (await fetch(it.thumb)).blob(); bmp = await createImageBitmap(t2); /* fall back to the small preview */ } searchSel = { it, bmp, credit: it.credit }; q('picked').hidden = false; q('credittext').textContent = it.title + ' — ' + it.credit; draw(); status(''); r.dispatchEvent(new Event('input', { bubbles: true })); }
      catch (e) { status('Could not load that one (' + e.message + '). Try another picture.'); }
    }
    q('go').onclick = () => run(false); q('more').onclick = () => run(true); q('q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(false); } });
    const send = kind => { if (!searchSel) return; pickedBits = ditherBitmap(searchSel.bmp, { fit: 'cover', method: q('method').value, invert: q('invert').checked }); if (typeof Make !== 'undefined') Make.show(kind); toast('Picture sent to the ' + (kind === 'sticker' ? 'sticker' : 'wanted poster') + ' maker'); };
    q('tosticker').onclick = () => send('sticker'); q('towanted').onclick = () => send('wanted');
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


  // ---------------- QR scanner (Game Boy style viewfinder) ----------------
  const scan = { text: null, running: false, raf: 0, last: 0, det: null, mode: null, frozen: false, root: null, jsq: null };
  const GB = [[155, 188, 15], [139, 172, 15], [48, 98, 48], [15, 56, 15]];
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = 1320; g.gain.value = 0.06; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 90); } catch (e) { } };
  async function pickDetector() {
    if (scan.mode) return;
    try { if ('BarcodeDetector' in window) { const f = await BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) { scan.det = new BarcodeDetector({ formats: f.filter(x => ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'data_matrix', 'itf'].includes(x)) }); scan.mode = 'native'; return; } } } catch (e) { }
    await loadJsQR();
  }
  async function loadJsQR() {
    if (!window.jsQR) await new Promise((res, rej) => { const t = document.createElement('script'); t.src = 'vendor/jsQR.js'; t.onload = res; t.onerror = () => rej(new Error('QR decoder failed to load')); document.head.appendChild(t); });
    scan.jsq = window.jsQR; scan.mode = 'js';
  }
  function scanInit(r) {
    const q = n => r.querySelector('[name=' + n + ']');
    q('flip').onclick = () => { $('flip').click(); q('stat').textContent = 'Switching camera…'; };
    q('again').onclick = () => { scan.frozen = false; q('found').hidden = true; q('stat').textContent = 'Point at a QR code'; scanStart(r); };
    q('copy').onclick = async () => { try { await navigator.clipboard.writeText(scan.text || ''); toast('Copied'); } catch (e) { toast('Could not copy', 'bad'); } };
    q('open').onclick = () => { if (/^https?:\/\//i.test(scan.text || '')) window.open(scan.text, '_blank', 'noopener'); };
    q('clrhist').onclick = () => { saved.scans = []; store(); renderHist(r); };
    renderHist(r);
  }
  function renderHist(r) {
    const h = r.querySelector('[name=hist]'), box = r.querySelector('[name=histbox]'), list = saved.scans || []; h.innerHTML = ''; box.hidden = !list.length;
    for (const t of list) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t.length > 38 ? t.slice(0, 36) + '…' : t; b.style.cssText = 'display:block;width:100%;text-align:left;margin:4px 0'; b.onclick = () => { scan.text = t; showFound(r, t, false); }; h.appendChild(b); }
  }
  function showFound(r, text, fresh) {
    scan.text = text; scan.frozen = true; const q = n => r.querySelector('[name=' + n + ']');
    q('found').hidden = false; q('res').value = text; q('open').hidden = !/^https?:\/\//i.test(text); q('stat').textContent = fresh ? 'Got it! Printing preview below.' : 'Loaded from history.';
    if (fresh) { beep(); if (navigator.vibrate) navigator.vibrate(60); saved.scans = [text, ...(saved.scans || []).filter(x => x !== text)].slice(0, 8); store(); renderHist(r); }
    refresh();
  }
  async function scanStart(r) {
    scan.root = r; if (scan.running) return; scan.running = true;
    const q = n => r.querySelector('[name=' + n + ']'), cv = q('gbv'), cx = cv.getContext('2d'), small = document.createElement('canvas'), sx = small.getContext('2d', { willReadFrequently: true }), dec = document.createElement('canvas'), dx = dec.getContext('2d', { willReadFrequently: true });
    small.width = 160; small.height = 144; const img = cx.createImageData(160, 144);
    try { await pickDetector(); } catch (e) { q('stat').textContent = e.message; scan.running = false; return; }
    if (!scan.frozen) q('stat').textContent = 'Point at a QR code';
    let busy = false;
    const loop = async t => {
      if (!scan.running) return; scan.raf = requestAnimationFrame(loop);
      if (t - scan.last < 110 || busy) return; scan.last = t;
      if (typeof tab !== 'undefined' && tab !== 'mk') { scanStop(); return; }
      const vw = video.videoWidth, vh = video.videoHeight; if (!vw) { q('stat').textContent = 'No camera image yet. Allow camera access.'; return; }
      if (scan.frozen) return;
      // Game Boy style viewfinder: 160x144, 4 greens, Bayer dither, shown 2x
      const k = Math.max(160 / vw, 144 / vh), dw = vw * k, dh = vh * k; sx.save(); if (typeof facing !== 'undefined' && facing === 'user') { sx.translate(160, 0); sx.scale(-1, 1); } sx.drawImage(video, (160 - dw) / 2, (144 - dh) / 2, dw, dh); sx.restore();
      const d = sx.getImageData(0, 0, 160, 144).data;
      for (let y = 0; y < 144; y++) for (let x = 0; x < 160; x++) { const i = y * 160 + x, g = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255, lvl = Math.max(0, Math.min(3, Math.floor(g * 3 + (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) + 0.5))), c = GB[3 - lvl]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
      sx.putImageData(img, 0, 0); cx.imageSmoothingEnabled = false; cx.drawImage(small, 0, 0, 320, 288);
      cx.strokeStyle = '#0f380f'; cx.lineWidth = 4; for (const [ax, ay, bx, by] of [[30, 30, 1, 1], [290, 30, -1, 1], [30, 258, 1, -1], [290, 258, -1, -1]]) { cx.beginPath(); cx.moveTo(ax + bx * 40, ay); cx.lineTo(ax, ay); cx.lineTo(ax, ay + by * 40); cx.stroke(); }
      // decode from the full-resolution video frame
      busy = true;
      try {
        const sc = Math.min(1, 640 / Math.max(vw, vh)); dec.width = Math.round(vw * sc); dec.height = Math.round(vh * sc); dx.drawImage(video, 0, 0, dec.width, dec.height);
        let text = null;
        if (scan.mode === 'native') { const res = await Promise.race([scan.det.detect(dec), new Promise(r => setTimeout(() => r(null), 900))]); if (res === null) { scan.mode = null; scan.det = null; await loadJsQR(); } else if (res.length) text = res[0].rawValue; }
        else { const id = dx.getImageData(0, 0, dec.width, dec.height), res = scan.jsq(id.data, id.width, id.height, { inversionAttempts: 'dontInvert' }); if (res) text = res.data; }
        if (text && !scan.frozen) showFound(r, text, true);
      } catch (e) { } finally { busy = false; }
    };
    scan.raf = requestAnimationFrame(loop);
  }
  function scanStop() { scan.running = false; cancelAnimationFrame(scan.raf); }


  // ---------------- colouring pages, jokes, badges ----------------
  function mandala(detail, folds) {
    const S = 384, cx = S / 2, cy = S / 2, n = folds || [6, 8, 8, 10, 12][rnd(5)], layers = 3 + detail * 2, kinds = shuffle(['petal', 'dots', 'scallop', 'diamond', 'star', 'loop', 'tear', 'zig']);
    return page(S + 16, x => {
      x.translate(0, 8); x.lineWidth = detail === 3 ? 2 : 3; x.lineJoin = x.lineCap = 'round'; x.strokeStyle = '#000'; x.fillStyle = '#fff';
      let r0 = 14 + rnd(10); x.beginPath(); x.arc(cx, cy, r0, 0, 7); x.stroke();
      const maxR = S / 2 - 10, step = (maxR - r0) / layers;
      for (let L = 0; L < layers; L++) {
        const r1 = r0 + step * (L + 1), kind = kinds[L % kinds.length], rm = (r0 + r1) / 2, w = (r1 - r0) * 0.5, big = n * (detail > 2 && rnd(2) ? 2 : 1);
        for (let k = 0; k < big; k++) {
          const a = k / big * Math.PI * 2 + (L % 2 ? Math.PI / big : 0); x.save(); x.translate(cx, cy); x.rotate(a);
          if (kind === 'petal') { x.beginPath(); x.moveTo(r0 + 2, 0); x.quadraticCurveTo(rm, -w * 1.1 * (Math.PI * rm / big / (w + 1)) / 2, r1 - 2, 0); x.quadraticCurveTo(rm, w * 1.1 * (Math.PI * rm / big / (w + 1)) / 2, r0 + 2, 0); x.stroke(); }
          else if (kind === 'tear') { const ww = Math.min(w * 0.9, Math.PI * rm / big * 0.45); x.beginPath(); x.moveTo(r1 - 1, 0); x.quadraticCurveTo(rm + ww, -ww * 1.2, r0 + ww, -ww * 0.3); x.arc(r0 + ww, 0, ww * 0.3, -Math.PI / 2, Math.PI / 2, true); x.quadraticCurveTo(rm + ww, ww * 1.2, r1 - 1, 0); x.stroke(); }
          else if (kind === 'dots') { x.beginPath(); x.arc(rm, 0, Math.min(w * 0.55, Math.PI * rm / big * 0.4), 0, 7); x.stroke(); if (detail > 1) { x.beginPath(); x.arc(rm, 0, Math.min(w * 0.55, Math.PI * rm / big * 0.4) * 0.4, 0, 7); x.stroke(); } }
          else if (kind === 'scallop') { const ww = Math.PI * r1 / big; x.beginPath(); x.arc(r1, 0, ww * 0.55, Math.PI / 2, -Math.PI / 2, false); x.stroke(); }
          else if (kind === 'diamond') { const ww = Math.min(w * 0.8, Math.PI * rm / big * 0.45); x.beginPath(); x.moveTo(rm - w, 0); x.lineTo(rm, -ww); x.lineTo(rm + w, 0); x.lineTo(rm, ww); x.closePath(); x.stroke(); }
          else if (kind === 'star') { const R = Math.min(w, Math.PI * rm / big * 0.5), p = 5; x.beginPath(); for (let i = 0; i < p * 2; i++) { const aa = i * Math.PI / p, rr = i % 2 ? R * 0.45 : R; x[i ? 'lineTo' : 'moveTo'](rm + Math.cos(aa) * rr, Math.sin(aa) * rr); } x.closePath(); x.stroke(); }
          else if (kind === 'loop') { x.beginPath(); x.moveTo(r0 + 2, 0); x.bezierCurveTo(rm, -w * 1.6, rm + w, -w * 1.6, r1 - 2, 0); x.bezierCurveTo(rm + w, w * 1.6, rm, w * 1.6, r0 + 2, 0); x.stroke(); }
          else { x.beginPath(); x.moveTo(r0 + 2, 0); x.lineTo(rm, -w * 0.7); x.lineTo(rm + w * 0.2, 0); x.lineTo(rm, w * 0.7); x.lineTo(r1 - 2, 0); x.stroke(); }
          x.restore();
        }
        x.beginPath(); x.arc(cx, cy, r1, 0, 7); x.stroke(); r0 = r1;
      }
    });
  }
  const JOKES = [['What do you call a sleeping bull?', 'A bulldozer!'], ['Why did the scarecrow win an award?', 'He was outstanding in his field!'], ['What do you call cheese that is not yours?', 'Nacho cheese!'], ['Why can’t a bicycle stand up by itself?', 'It is two tired!'], ['What do you get when you cross a snowman and a vampire?', 'Frostbite!'], ['Why did the cookie go to the doctor?', 'It felt crummy!'], ['What did the ocean say to the beach?', 'Nothing, it just waved!'], ['Why do bees have sticky hair?', 'They use honeycombs!'], ['What do you call a fish with no eyes?', 'A fsh!'], ['Why was the math book sad?', 'It had too many problems!'], ['What do elves learn in school?', 'The elf-abet!'], ['How does a penguin build its house?', 'Igloos it together!'], ['Why did the computer go to the doctor?', 'It had a virus!'], ['What is a ghost’s favourite pudding?', 'Boo-berry pie!'], ['What do you call a dinosaur that never gives up?', 'Try-try-try-ceratops!'], ['Why did the banana go to the doctor?', 'It was not peeling well!'], ['What do you call a pig that does karate?', 'A pork chop!'], ['Why do seagulls fly over the sea?', 'If they flew over the bay they would be bagels!'], ['What did the left eye say to the right eye?', 'Between us, something smells!'], ['What is a robot’s favourite snack?', 'Micro-chips!'], ['Why is the moon so rich?', 'It has lots of quarters!'], ['What do you call a cat on the beach?', 'Sandy Claws!'], ['Why did the golfer bring two pairs of trousers?', 'In case he got a hole in one!'], ['What did one wall say to the other?', 'I will meet you at the corner!'], ['What kind of music do mummies love?', 'Wrap!'], ['Why did the teddy bear say no to dessert?', 'It was already stuffed!'], ['What has ears but cannot hear?', 'A field of corn!'], ['Why do ducks make great detectives?', 'They always quack the case!'], ['What do you call a sleeping dinosaur?', 'A dino-snore!'], ['What did the traffic light say to the car?', 'Do not look, I am changing!']];
  function jokeSlip(q, a) {
    const m = cvs(W, 10).getContext('2d'); m.font = `700 28px ${FONT}`; const ql = wrapLines(m, q, W - 40); m.font = `800 30px ${FONT}`; const al = wrapLines(m, a, W - 40), top = page(60 + ql.length * 36 + 30, x => { x.textAlign = 'center'; x.font = `800 26px ${FONT}`; x.fillText('😂 JOKE TIME', W / 2, 8); x.font = `700 28px ${FONT}`; ql.forEach((l, i) => x.fillText(l, W / 2, 56 + i * 36)); x.font = `600 16px ${FONT}`; x.fillText('(turn the paper round for the answer)', W / 2, 60 + ql.length * 36 + 4); });
    const bot = page(al.length * 38 + 40, x => { x.textAlign = 'center'; x.font = `800 30px ${FONT}`; al.forEach((l, i) => x.fillText(l, W / 2, 16 + i * 38)); });
    const c = cvs(W, bot.h), cx = c.getContext('2d'); cx.translate(W, bot.h); cx.rotate(Math.PI); cx.drawImage(bot.canvas, 0, 0);
    const flipped = { bits: Prt.canvasBits(c), h: bot.h };
    return Prt.stack([top, gapRow(), flipped, Prt.blank(8)]);
  }

  function badgeSide(name, style, sub, left) { // drawn landscape, then turned a quarter so the name runs down the length of the paper
    const Hh = W, colW = 190, pad = 22, subH = sub ? 54 : 0, m = cvs(10, 10).getContext('2d'); m.font = `800 100px ${FONT}`;
    const w100 = Math.max(1, m.measureText(name).width), fitH = (Hh - 2 * pad - subH - 10) / 0.80, size = Math.max(40, Math.min(300, fitH, 1500 * 100 / w100)), textW0 = Math.ceil(w100 * size / 100 + size * 0.12);
    m.font = `600 30px ${FONT}`; const subW = sub ? Math.ceil(m.measureText(sub).width) + 24 : 0, textW = Math.max(textW0, subW);
    const Lw = colW + pad + textW + pad, c = cvs(Lw, Hh), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, Lw, Hh); x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineWidth = 8; x.strokeRect(6, 6, Lw - 12, Hh - 12);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (style === 'band') { x.fillRect(6, 6, colW, Hh - 12); x.fillStyle = '#fff'; }
    x.font = `800 46px ${FONT}`; x.fillText('HELLO', colW / 2 + 6, Hh / 2 - 34);
    x.font = `700 24px ${FONT}`; x.fillText('my name is', colW / 2 + 6, Hh / 2 + 14);
    if (style === 'star') { x.font = `700 24px ${FONT}`; x.fillText('★ ★ ★', colW / 2 + 6, Hh / 2 + 54); }
    x.fillStyle = '#000'; if (style !== 'band') { x.lineWidth = 4; x.beginPath(); x.moveTo(colW + 6, 22); x.lineTo(colW + 6, Hh - 22); x.stroke(); }
    x.textAlign = 'left'; x.font = `800 ${size}px ${FONT}`; x.textBaseline = 'alphabetic';
    const capH = size * 0.72, top = pad + (Hh - 2 * pad - subH - capH) / 2; x.fillText(name, colW + pad + 6, top + capH);
    if (sub) { x.font = `600 30px ${FONT}`; x.textAlign = 'center'; x.fillText(sub, colW + pad + 6 + textW / 2, Hh - pad - 14); }
    const r = cvs(Hh, Lw), rx = r.getContext('2d'); rx.fillStyle = '#fff'; rx.fillRect(0, 0, Hh, Lw); if (left) { rx.translate(0, Lw); rx.rotate(-Math.PI / 2); } else { rx.translate(Hh, 0); rx.rotate(Math.PI / 2); } rx.drawImage(c, 0, 0);
    return { bits: Prt.canvasBits(r), h: Lw, canvas: r };
  }
  function badge(name, style, sub) {
    const m = cvs(W, 10).getContext('2d'); let size = 110; for (; size > 30; size -= 4) { m.font = `800 ${size}px ${FONT}`; if (m.measureText(name).width < W - 60) break; }
    const hasSub = !!sub, h = 70 + size + 24 + (hasSub ? 40 : 0) + 24;
    return page(h, x => {
      x.textAlign = 'center'; x.lineWidth = 6; x.strokeRect(6, 6, W - 12, h - 12);
      if (style === 'band') { x.fillStyle = '#000'; x.fillRect(6, 6, W - 12, 62); x.fillStyle = '#fff'; x.font = `800 40px ${FONT}`; x.fillText('HELLO', W / 2, 16); x.fillStyle = '#000'; x.font = `700 22px ${FONT}`; x.fillText('my name is', W / 2, 78); }
      else { x.font = `800 34px ${FONT}`; x.fillText('HELLO', W / 2, 18); x.font = `700 22px ${FONT}`; x.fillText('my name is', W / 2, 60); if (style === 'star') { x.font = `700 26px ${FONT}`; x.fillText('★ ★ ★ ★ ★ ★ ★ ★ ★', W / 2, 92); } }
      x.font = `800 ${size}px ${FONT}`; x.fillText(name, W / 2, style === 'band' ? 100 : 112);
      if (hasSub) { x.font = `600 24px ${FONT}`; x.fillText(sub, W / 2, h - 52); }
    });
  }


  // ---------------- gift tags (present labels for any occasion) ----------------
const todayISO = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }, monthISO = () => todayISO().slice(0, 7);
  const GIFT_OCC = [
    { id: 'christmas', name: 'Christmas', border: 'holly', icon: 'tree', msg: 'Merry Christmas!' },
    { id: 'birthday', name: 'Birthday', border: 'confetti', icon: 'cake', msg: 'Happy Birthday!' },
    { id: 'halloween', name: 'Halloween', border: 'web', icon: 'pumpkin', msg: 'Happy Halloween!' },
    { id: 'easter', name: 'Easter', border: 'flowers', icon: 'egg', msg: 'Happy Easter!' },
    { id: 'valentine', name: 'Valentine’s Day', border: 'hearts', icon: 'heart', msg: 'With all my love' },
    { id: 'wedding', name: 'Wedding / Anniversary', border: 'plain', icon: 'rings', msg: 'Congratulations!' },
    { id: 'baby', name: 'New baby', border: 'bunting', icon: 'bear', msg: 'Welcome, little one' },
    { id: 'hanukkah', name: 'Hanukkah', border: 'plain', icon: 'menorah', msg: 'Happy Hanukkah!' },
    { id: 'diwali', name: 'Diwali', border: 'flowers', icon: 'diya', msg: 'Happy Diwali!' },
    { id: 'graduation', name: 'Graduation', border: 'bunting', icon: 'cap', msg: 'Well done!' },
    { id: 'thanks', name: 'Thank you', border: 'flowers', icon: 'flower', msg: 'Thank you!' },
    { id: 'general', name: 'Any occasion', border: 'confetti', icon: 'present', msg: 'A little something for you' },
  ];

  function giftIcon(x, cx, cy, S, kind) {
    x.save(); x.translate(cx, cy); x.strokeStyle = '#000'; x.fillStyle = '#000'; x.lineWidth = Math.max(3, S / 22); x.lineJoin = x.lineCap = 'round';
    const star = (px, py, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; x[i ? 'lineTo' : 'moveTo'](px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.closePath(); };
    if (kind === 'tree') {
      for (let i = 0; i < 3; i++) { const top = -S * 0.36 + i * S * 0.24, w = S * (0.30 + i * 0.13); x.beginPath(); x.moveTo(0, top); x.lineTo(w, top + S * 0.34); x.lineTo(-w, top + S * 0.34); x.closePath(); x.fill(); }
      x.fillRect(-S * 0.06, S * 0.34, S * 0.12, S * 0.14); x.fillStyle = '#fff'; for (const [dx, dy] of [[-0.12, -0.05], [0.14, 0.04], [-0.2, 0.2], [0.08, 0.22], [0.24, 0.3], [-0.05, 0.33]]) { x.beginPath(); x.arc(dx * S, dy * S, S * 0.035, 0, 7); x.fill(); }
      x.fillStyle = '#fff'; star(0, -S * 0.44, S * 0.13); x.fill(); x.stroke();
    } else if (kind === 'present') {
      const w = S * 0.8, h = S * 0.55; x.fillStyle = '#fff'; x.fillRect(-w / 2, -h / 2 + S * 0.1, w, h); x.strokeRect(-w / 2, -h / 2 + S * 0.1, w, h); x.fillRect(-w / 2 - S * 0.04, -h / 2 + S * 0.1 - S * 0.14, w + S * 0.08, S * 0.14); x.strokeRect(-w / 2 - S * 0.04, -h / 2 + S * 0.1 - S * 0.14, w + S * 0.08, S * 0.14);
      x.fillStyle = '#000'; x.fillRect(-S * 0.07, -h / 2 + S * 0.1 - S * 0.14, S * 0.14, h + S * 0.14);
      for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(sd * S * 0.16, -h / 2 - S * 0.14, S * 0.15, S * 0.09, sd * -0.5, 0, 7); x.stroke(); }
    } else if (kind === 'snowman') {
      x.fillStyle = '#fff'; for (const [dy, r] of [[S * 0.26, S * 0.24], [-S * 0.04, S * 0.18], [-S * 0.27, S * 0.13]]) { x.beginPath(); x.arc(0, dy, r, 0, 7); x.fill(); x.stroke(); }
      x.fillStyle = '#000'; x.fillRect(-S * 0.14, -S * 0.5, S * 0.28, S * 0.14); x.fillRect(-S * 0.2, -S * 0.38, S * 0.4, S * 0.05);
      for (const sd of [-1, 1]) { x.beginPath(); x.arc(sd * S * 0.05, -S * 0.3, S * 0.018, 0, 7); x.fill(); } x.beginPath(); x.moveTo(0, -S * 0.26); x.lineTo(S * 0.12, -S * 0.23); x.lineTo(0, -S * 0.21); x.closePath(); x.fill();
      for (const dy of [-0.08, 0.02, 0.2, 0.32]) { x.beginPath(); x.arc(0, dy * S, S * 0.02, 0, 7); x.fill(); }
      for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(sd * S * 0.17, -S * 0.04); x.lineTo(sd * S * 0.42, -S * 0.18); x.stroke(); }
    } else if (kind === 'cane') {
      x.beginPath(); x.moveTo(S * 0.18, S * 0.46); x.lineTo(S * 0.18, -S * 0.2); x.arc(0, -S * 0.2, S * 0.18, 0, -Math.PI, true); x.lineTo(-S * 0.18, -S * 0.08);
      x.lineWidth = S * 0.17; x.strokeStyle = '#000'; x.stroke(); x.lineWidth = S * 0.17 - 4; x.strokeStyle = '#fff'; x.setLineDash([S * 0.07, S * 0.075]); x.stroke(); x.setLineDash([]);
      x.lineWidth = S * 0.17 + 4; x.strokeStyle = '#000'; x.globalCompositeOperation = 'destination-over'; x.stroke();
    } else if (kind === 'bauble') {
      x.fillStyle = '#fff'; x.beginPath(); x.arc(0, S * 0.1, S * 0.34, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; x.fillRect(-S * 0.08, -S * 0.3, S * 0.16, S * 0.1); x.beginPath(); x.arc(0, -S * 0.36, S * 0.06, 0, 7); x.stroke();
      x.save(); x.beginPath(); x.arc(0, S * 0.1, S * 0.34, 0, 7); x.clip(); x.lineWidth = S * 0.045; for (let i = -5; i <= 5; i++) { x.beginPath(); x.moveTo(-S * 0.4, S * 0.1 + i * S * 0.1); x.lineTo(S * 0.4, S * 0.1 + i * S * 0.1 + S * 0.12); x.stroke(); } x.restore();
    } else if (kind === 'cake') {
      x.fillStyle = '#fff'; x.fillRect(-S * 0.36, S * 0.1, S * 0.72, S * 0.28); x.strokeRect(-S * 0.36, S * 0.1, S * 0.72, S * 0.28); x.fillRect(-S * 0.23, -S * 0.12, S * 0.46, S * 0.22); x.strokeRect(-S * 0.23, -S * 0.12, S * 0.46, S * 0.22);
      x.fillStyle = '#000'; for (let i = -3; i <= 3; i++) { x.beginPath(); x.arc(i * S * 0.1, S * 0.1, S * 0.05, 0, Math.PI); x.fill(); } for (let i = -2; i <= 2; i++) { x.beginPath(); x.arc(i * S * 0.092, -S * 0.12, S * 0.045, 0, Math.PI); x.fill(); }
      for (const cx2 of [-0.12, 0, 0.12]) { x.fillStyle = '#fff'; x.fillRect(cx2 * S - S * 0.02, -S * 0.26, S * 0.04, S * 0.14); x.strokeRect(cx2 * S - S * 0.02, -S * 0.26, S * 0.04, S * 0.14); x.fillStyle = '#000'; x.beginPath(); x.ellipse(cx2 * S, -S * 0.32, S * 0.025, S * 0.045, 0, 0, 7); x.fill(); }
      x.fillRect(-S * 0.44, S * 0.38, S * 0.88, S * 0.05);
    } else if (kind === 'balloons') {
      for (const [bx, by, fill] of [[-0.22, -0.1, 1], [0.06, -0.2, 0], [0.3, -0.04, 2]]) { x.fillStyle = fill === 1 ? '#000' : '#fff'; x.beginPath(); x.ellipse(bx * S, by * S, S * 0.15, S * 0.19, 0, 0, 7); x.fill(); x.stroke(); if (fill === 2) { x.save(); x.clip(); for (let k = -3; k <= 3; k++) { x.beginPath(); x.moveTo(bx * S + k * S * 0.05, (by - 0.2) * S); x.lineTo(bx * S + k * S * 0.05, (by + 0.2) * S); x.stroke(); } x.restore(); } if (fill === 0) { x.fillStyle = '#000'; star(bx * S, by * S, S * 0.07); x.fill(); } x.fillStyle = '#000'; x.beginPath(); x.moveTo(bx * S - S * 0.03, (by + 0.19) * S); x.lineTo(bx * S + S * 0.03, (by + 0.19) * S); x.lineTo(bx * S, (by + 0.23) * S); x.closePath(); x.fill(); x.lineWidth = 2; x.beginPath(); x.moveTo(bx * S, (by + 0.23) * S); x.quadraticCurveTo(bx * S * 0.4, S * 0.34, S * 0.04, S * 0.46); x.stroke(); x.lineWidth = Math.max(3, S / 22); }
    } else if (kind === 'pumpkin') {
      x.fillStyle = '#000'; for (const dx of [-0.2, 0, 0.2]) { x.beginPath(); x.ellipse(dx * S, S * 0.08, S * (dx ? 0.2 : 0.22), S * 0.31, 0, 0, 7); x.fill(); } x.fillRect(-S * 0.04, -S * 0.32, S * 0.08, S * 0.13);
      x.fillStyle = '#fff'; for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(sd * S * 0.15, -S * 0.02); x.lineTo(sd * S * 0.07, S * 0.06); x.lineTo(sd * S * 0.22, S * 0.06); x.closePath(); x.fill(); }
      x.beginPath(); x.moveTo(0, S * 0.1); x.lineTo(-S * 0.04, S * 0.16); x.lineTo(S * 0.04, S * 0.16); x.closePath(); x.fill(); x.beginPath(); x.moveTo(-S * 0.24, S * 0.2); for (let i = 0; i <= 6; i++) x.lineTo(-S * 0.24 + i * S * 0.08, S * (i % 2 ? 0.2 : 0.3)); x.lineTo(S * 0.24, S * 0.2); x.closePath(); x.fill();
    } else if (kind === 'ghost') {
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-S * 0.3, S * 0.42); x.lineTo(-S * 0.3, -S * 0.08); x.arc(0, -S * 0.08, S * 0.3, Math.PI, 0); x.lineTo(S * 0.3, S * 0.42); for (let i = 0; i < 3; i++) x.quadraticCurveTo(S * (0.2 - i * 0.2), S * 0.3, S * (0.1 - i * 0.2), S * 0.42); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#000'; for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(sd * S * 0.1, -S * 0.1, S * 0.045, S * 0.065, 0, 0, 7); x.fill(); } x.beginPath(); x.ellipse(0, S * 0.07, S * 0.06, S * 0.08, 0, 0, 7); x.fill();
    } else if (kind === 'bat') {
      x.fillStyle = '#000'; for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(0, -S * 0.04); x.quadraticCurveTo(sd * S * 0.2, -S * 0.34, sd * S * 0.5, -S * 0.18); x.quadraticCurveTo(sd * S * 0.46, -S * 0.02, sd * S * 0.38, S * 0.1); x.quadraticCurveTo(sd * S * 0.3, S * 0.04, sd * S * 0.24, S * 0.14); x.quadraticCurveTo(sd * S * 0.16, S * 0.05, sd * S * 0.08, S * 0.2); x.lineTo(0, S * 0.12); x.closePath(); x.fill(); }
      x.beginPath(); x.ellipse(0, 0, S * 0.1, S * 0.16, 0, 0, 7); x.fill(); for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(sd * S * 0.03, -S * 0.12); x.lineTo(sd * S * 0.1, -S * 0.26); x.lineTo(sd * S * 0.12, -S * 0.1); x.closePath(); x.fill(); } x.fillStyle = '#fff'; for (const sd of [-1, 1]) { x.beginPath(); x.arc(sd * S * 0.04, -S * 0.04, S * 0.02, 0, 7); x.fill(); }
    } else if (kind === 'egg') {
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -S * 0.44); x.bezierCurveTo(S * 0.34, -S * 0.36, S * 0.36, S * 0.4, 0, S * 0.44); x.bezierCurveTo(-S * 0.36, S * 0.4, -S * 0.34, -S * 0.36, 0, -S * 0.44); x.closePath(); x.fill(); x.save(); x.clip();
      x.fillStyle = '#000'; for (const [yy, hh] of [[-0.1, 0.12], [0.22, 0.1]]) { x.beginPath(); x.moveTo(-S * 0.4, yy * S); for (let i = 0; i <= 8; i++) x.lineTo(-S * 0.4 + i * S * 0.1, (yy + (i % 2 ? hh : 0)) * S); for (let i = 8; i >= 0; i--) x.lineTo(-S * 0.4 + i * S * 0.1, (yy + 0.06 + (i % 2 ? hh : 0)) * S); x.closePath(); x.fill(); }
      for (const [dx, dy] of [[-0.12, -0.28], [0.1, -0.22], [0, 0.08], [-0.15, 0.06], [0.15, 0.1], [-0.05, 0.36], [0.1, 0.36]]) { x.beginPath(); x.arc(dx * S, dy * S, S * 0.03, 0, 7); x.fill(); } x.restore();
      x.beginPath(); x.moveTo(0, -S * 0.44); x.bezierCurveTo(S * 0.34, -S * 0.36, S * 0.36, S * 0.4, 0, S * 0.44); x.bezierCurveTo(-S * 0.36, S * 0.4, -S * 0.34, -S * 0.36, 0, -S * 0.44); x.closePath(); x.stroke();
    } else if (kind === 'bunny') {
      x.fillStyle = '#fff'; for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(sd * S * 0.14, -S * 0.26, S * 0.07, S * 0.22, sd * 0.12, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.ellipse(sd * S * 0.14, -S * 0.24, S * 0.025, S * 0.15, sd * 0.12, 0, 7); x.fill(); x.fillStyle = '#fff'; }
      x.beginPath(); x.ellipse(0, S * 0.14, S * 0.3, S * 0.26, 0, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; for (const sd of [-1, 1]) { x.beginPath(); x.arc(sd * S * 0.1, S * 0.08, S * 0.03, 0, 7); x.fill(); } x.beginPath(); x.moveTo(-S * 0.04, S * 0.16); x.lineTo(S * 0.04, S * 0.16); x.lineTo(0, S * 0.21); x.closePath(); x.fill();
      x.lineWidth = 2; x.beginPath(); x.moveTo(0, S * 0.21); x.lineTo(0, S * 0.26); x.moveTo(-S * 0.07, S * 0.3); x.quadraticCurveTo(0, S * 0.24, S * 0.07, S * 0.3); for (const sd of [-1, 1]) for (const k of [-1, 1]) { x.moveTo(sd * S * 0.1, S * 0.19); x.lineTo(sd * S * 0.4, S * (0.19 + k * 0.05)); } x.stroke();
    } else if (kind === 'heart') {
      const hp = (sc) => { x.beginPath(); for (let i = 0; i <= 80; i++) { const t = i / 80 * Math.PI * 2, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); x[i ? 'lineTo' : 'moveTo'](hx * sc, -hy * sc + sc * 1.5); } x.closePath(); };
      hp(S * 0.027); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = S * 0.035; x.beginPath(); x.arc(-S * 0.16, -S * 0.1, S * 0.12, Math.PI * 1.05, Math.PI * 1.6); x.stroke();
    } else if (kind === 'rings') {
      x.lineWidth = S * 0.07; for (const dx of [-0.13, 0.13]) { x.beginPath(); x.arc(dx * S, S * 0.12, S * 0.22, 0, 7); x.stroke(); } x.lineWidth = S * 0.025; x.strokeStyle = '#fff'; x.beginPath(); x.arc(-S * 0.13, S * 0.12, S * 0.22, -0.4, 1.2); x.stroke(); x.strokeStyle = '#000';
      x.fillStyle = '#000'; x.beginPath(); x.moveTo(S * 0.13, -S * 0.26); x.lineTo(S * 0.22, -S * 0.15); x.lineTo(S * 0.13, -S * 0.04); x.lineTo(S * 0.04, -S * 0.15); x.closePath(); x.fill();
    } else if (kind === 'menorah') {
      x.lineWidth = S * 0.05; x.beginPath(); x.moveTo(-S * 0.4, -S * 0.02); x.quadraticCurveTo(-S * 0.4, S * 0.32, 0, S * 0.32); x.quadraticCurveTo(S * 0.4, S * 0.32, S * 0.4, -S * 0.02); x.stroke(); x.beginPath(); x.moveTo(0, S * 0.32); x.lineTo(0, S * 0.46); x.moveTo(-S * 0.18, S * 0.46); x.lineTo(S * 0.18, S * 0.46); x.stroke();
      for (let i = -4; i <= 4; i++) { const cx2 = i * S * 0.1, yb = i === 0 ? -S * 0.16 : -S * 0.02 + (S * 0.30) * (1 - Math.pow(i / 4, 2)) * 0.0 + Math.abs(i) * 0 - (Math.abs(i) > 0 ? 0 : 0), top = (i === 0 ? -S * 0.38 : -S * 0.24) + (i === 0 ? 0 : 0); const base = i === 0 ? S * 0.22 : -S * 0.02 + S * 0.30 * (1 - (Math.abs(i) / 4) ** 2) * 0.55; x.fillStyle = '#000'; x.fillRect(cx2 - S * 0.02, (i === 0 ? -S * 0.12 : base - S * 0.16), S * 0.04, i === 0 ? S * 0.34 : S * 0.16); x.beginPath(); x.ellipse(cx2, (i === 0 ? -S * 0.12 : base - S * 0.16) - S * 0.045, S * 0.022, S * 0.04, 0, 0, 7); x.fill(); }
    } else if (kind === 'diya') {
      x.fillStyle = '#000'; x.beginPath(); x.ellipse(0, S * 0.1, S * 0.38, S * 0.2, 0, 0, Math.PI); x.closePath(); x.fill(); x.beginPath(); x.moveTo(S * 0.3, S * 0.1); x.quadraticCurveTo(S * 0.5, S * 0.04, S * 0.46, -S * 0.04); x.quadraticCurveTo(S * 0.36, S * 0.02, S * 0.2, S * 0.08); x.closePath(); x.fill(); x.fillRect(-S * 0.16, S * 0.3, S * 0.32, S * 0.06);
      x.fillStyle = '#fff'; for (let i = -3; i <= 3; i++) { x.beginPath(); x.arc(i * S * 0.1, S * 0.18 - Math.abs(i) * S * 0.02, S * 0.022, 0, 7); x.fill(); }
      x.fillStyle = '#000'; x.beginPath(); x.moveTo(0, -S * 0.36); x.bezierCurveTo(S * 0.17, -S * 0.16, S * 0.12, S * 0.04, 0, S * 0.04); x.bezierCurveTo(-S * 0.12, S * 0.04, -S * 0.17, -S * 0.16, 0, -S * 0.36); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(0, -S * 0.1, S * 0.04, S * 0.09, 0, 0, 7); x.fill();
    } else if (kind === 'flower') {
      x.beginPath(); x.moveTo(0, S * 0.1); x.quadraticCurveTo(S * 0.06, S * 0.3, 0, S * 0.48); x.stroke(); for (const sd of [-1, 1]) { x.fillStyle = '#000'; x.beginPath(); x.ellipse(sd * S * 0.13, S * 0.3, S * 0.12, S * 0.05, sd * -0.6, 0, 7); x.fill(); }
      x.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.beginPath(); x.arc(Math.cos(a) * S * 0.2, -S * 0.12 + Math.sin(a) * S * 0.2, S * 0.14, 0, 7); x.fill(); x.stroke(); } x.fillStyle = '#000'; x.beginPath(); x.arc(0, -S * 0.12, S * 0.12, 0, 7); x.fill(); x.fillStyle = '#fff'; for (const [dx, dy] of [[-0.04, -0.15], [0.05, -0.1], [-0.01, -0.07]]) { x.beginPath(); x.arc(dx * S, dy * S, S * 0.015, 0, 7); x.fill(); }
    } else if (kind === 'bear') {
      x.fillStyle = '#fff'; for (const sd of [-1, 1]) { x.beginPath(); x.arc(sd * S * 0.27, -S * 0.22, S * 0.12, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(sd * S * 0.27, -S * 0.22, S * 0.05, 0, 7); x.fill(); x.fillStyle = '#fff'; }
      x.beginPath(); x.arc(0, S * 0.04, S * 0.36, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.ellipse(0, S * 0.15, S * 0.15, S * 0.11, 0, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.ellipse(0, S * 0.1, S * 0.05, S * 0.035, 0, 0, 7); x.fill(); for (const sd of [-1, 1]) { x.beginPath(); x.arc(sd * S * 0.14, -S * 0.04, S * 0.035, 0, 7); x.fill(); } x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, S * 0.13); x.lineTo(0, S * 0.18); x.moveTo(-S * 0.06, S * 0.21); x.quadraticCurveTo(0, S * 0.17, S * 0.06, S * 0.21); x.stroke();
    } else if (kind === 'cap') {
      x.fillStyle = '#000'; x.beginPath(); x.moveTo(-S * 0.46, -S * 0.1); x.lineTo(0, -S * 0.3); x.lineTo(S * 0.46, -S * 0.1); x.lineTo(0, S * 0.1); x.closePath(); x.fill(); x.beginPath(); x.moveTo(-S * 0.24, S * 0.0); x.lineTo(-S * 0.24, S * 0.18); x.quadraticCurveTo(0, S * 0.34, S * 0.24, S * 0.18); x.lineTo(S * 0.24, S * 0.0); x.lineTo(0, S * 0.12); x.closePath(); x.fill();
      x.lineWidth = S * 0.025; x.beginPath(); x.moveTo(S * 0.4, -S * 0.08); x.lineTo(S * 0.4, S * 0.2); x.stroke(); x.beginPath(); x.moveTo(S * 0.4, S * 0.18); x.lineTo(S * 0.35, S * 0.34); x.lineTo(S * 0.45, S * 0.34); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, -S * 0.1, S * 0.03, 0, 7); x.fill();
    } else { x.fillStyle = '#fff'; star(0, 0, S * 0.46); x.fill(); x.lineWidth = S / 14; x.stroke(); x.fillStyle = '#000'; star(0, 0, S * 0.18); x.fill(); }
    x.restore();
  }
  function giftBorder(x, w, h, kind, rnd) {
    x.save(); x.strokeStyle = '#000'; x.fillStyle = '#000'; x.lineJoin = x.lineCap = 'round';
    const leaf = (px, py, a, L) => { x.save(); x.translate(px, py); x.rotate(a); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(L * 0.5, -L * 0.32, L, 0); x.quadraticCurveTo(L * 0.5, L * 0.32, 0, 0); x.fill(); x.restore(); };
    const sprig = (px, py, a) => { for (const d of [-0.7, 0.7, 0]) leaf(px, py, a + d, 30); for (const [dx, dy] of [[0, 0], [7, 5], [-6, 6]]) { x.beginPath(); x.arc(px + dx, py + dy, 5, 0, 7); x.fill(); } };
    const flake = (px, py, r) => { x.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); const bx = px + Math.cos(a) * r * 0.6, by = py + Math.sin(a) * r * 0.6; x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + 0.8) * r * 0.3, by + Math.sin(a + 0.8) * r * 0.3); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a - 0.8) * r * 0.3, by + Math.sin(a - 0.8) * r * 0.3); x.stroke(); } };
    if (kind === 'holly') {
      x.lineWidth = 4; x.strokeRect(10, 10, w - 20, h - 20); x.lineWidth = 1.5; x.strokeRect(17, 17, w - 34, h - 34);
      sprig(18, 18, 0.7); sprig(w - 18, 18, Math.PI - 0.7); sprig(18, h - 18, -0.7); sprig(w - 18, h - 18, Math.PI + 0.7);
      for (const f of [0.33, 0.5, 0.67]) { sprig(w * f, 12, Math.PI / 2 - 0.0 + Math.PI); sprig(w * f, h - 12, 0); }
    } else if (kind === 'snow') {
      x.lineWidth = 4; x.strokeRect(10, 10, w - 20, h - 20);
      for (let i = 0; i < 26; i++) { const side = i % 4, t = rnd(), px = side < 2 ? 22 + t * (w - 44) : (side === 2 ? 22 : w - 22), py = side < 2 ? (side === 0 ? 24 : h - 24) : 22 + t * (h - 44); flake(px, py, 7 + rnd() * 7); }
      for (const [fx, fy] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) flake(fx, fy, 15);
    } else if (kind === 'cane') {
      const bw = 18; x.save(); x.beginPath(); x.rect(0, 0, w, h); x.rect(bw, bw, w - 2 * bw, h - 2 * bw); x.clip('evenodd'); x.lineWidth = 7; for (let k = -h; k < w + h; k += 18) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + h, h); x.stroke(); } x.restore(); x.lineWidth = 3; x.strokeRect(1.5, 1.5, w - 3, h - 3); x.strokeRect(bw, bw, w - 2 * bw, h - 2 * bw);
    } else if (kind === 'confetti') {
      x.lineWidth = 3; x.strokeRect(10, 10, w - 20, h - 20);
      for (let i = 0; i < 90; i++) { const side = Math.floor(rnd() * 4), t = rnd(), off = 14 + rnd() * 14, px = side < 2 ? 14 + t * (w - 28) : (side === 2 ? off : w - off), py = side < 2 ? (side === 0 ? off : h - off) : 14 + t * (h - 28), k = Math.floor(rnd() * 4); x.save(); x.translate(px, py); x.rotate(rnd() * 6.3); x.lineWidth = 2.5; if (k === 0) { x.beginPath(); x.arc(0, 0, 3.5, 0, 7); x.fill(); } else if (k === 1) x.fillRect(-2, -5, 4, 10); else if (k === 2) { x.beginPath(); x.moveTo(0, -6); x.lineTo(5, 4); x.lineTo(-5, 4); x.closePath(); x.stroke(); } else { x.beginPath(); x.moveTo(-6, 0); x.quadraticCurveTo(-3, -5, 0, 0); x.quadraticCurveTo(3, 5, 6, 0); x.stroke(); } x.restore(); }
    } else if (kind === 'hearts') {
      x.lineWidth = 3; x.strokeRect(10, 10, w - 20, h - 20); const hp = (cx, cy, sc, fill) => { x.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI * 2, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); x[i ? 'lineTo' : 'moveTo'](cx + hx * sc, cy - hy * sc + sc * 1.5); } x.closePath(); fill ? x.fill() : x.stroke(); };
      let k = 0; for (let px = 26; px < w - 20; px += 30, k++) { hp(px, 21, 0.5, k % 2 === 0); hp(px, h - 22, 0.5, k % 2 === 1); } k = 0; for (let py = 56; py < h - 40; py += 30, k++) { hp(21, py, 0.5, k % 2 === 0); hp(w - 21, py, 0.5, k % 2 === 1); }
    } else if (kind === 'bunting') {
      x.lineWidth = 2; x.strokeRect(8, 52, w - 16, h - 60); x.beginPath(); x.moveTo(6, 8); x.quadraticCurveTo(w / 2, 40, w - 6, 8); x.stroke();
      const n = Math.max(5, Math.round(w / 52)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, px = 6 + t * (w - 12), py = 8 + 2 * 0.5 * (1 - 0) * 0 + (1 - Math.pow(2 * t - 1, 2)) * 16; const a = px - 17, b = px + 17; x.beginPath(); x.moveTo(a, py - 2 + 0); x.lineTo(b, py - 2); x.lineTo(px, py + 40); x.closePath(); if (i % 2) x.stroke(); else x.fill(); }
    } else if (kind === 'web') {
      x.lineWidth = 3; x.strokeRect(10, 10, w - 20, h - 20); x.lineWidth = 1.6;
      const corner = (cx, cy, sx, sy) => { for (const r of [20, 34, 48, 62]) { x.beginPath(); x.moveTo(cx + sx * r, cy); for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI / 2, rr = r * (k % 2 ? 0.93 : 1); x.lineTo(cx + sx * Math.cos(a) * rr, cy + sy * Math.sin(a) * rr); } x.stroke(); } for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + sx * Math.cos(a) * 64, cy + sy * Math.sin(a) * 64); x.stroke(); } };
      corner(10, 10, 1, 1); corner(w - 10, 10, -1, 1); corner(10, h - 10, 1, -1); corner(w - 10, h - 10, -1, -1);
      x.lineWidth = 1.5; x.beginPath(); x.moveTo(w - 92, 10); x.lineTo(w - 92, 34); x.stroke(); x.beginPath(); x.arc(w - 92, 41, 6, 0, 7); x.fill(); x.beginPath(); x.arc(w - 92, 52, 4, 0, 7); x.fill(); for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(w - 92, 44); x.lineTo(w - 92 + sd * (8 + k * 2), 38 + k * 5); x.stroke(); }
    } else if (kind === 'flowers') {
      x.lineWidth = 3; x.strokeRect(10, 10, w - 20, h - 20); const fl = (cx, cy, r) => { x.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.7, 0, 7); x.fill(); x.lineWidth = 1.6; x.stroke(); } x.fillStyle = '#000'; x.beginPath(); x.arc(cx, cy, r * 0.5, 0, 7); x.fill(); };
      for (let px = 30; px < w - 20; px += 42) { fl(px, 20, 5); fl(px + 21, h - 20, 5); x.beginPath(); x.ellipse(px + 21, 20, 8, 3, 0.4, 0, 7); x.fill(); x.beginPath(); x.ellipse(px, h - 20, 8, 3, -0.4, 0, 7); x.fill(); } for (let py = 52; py < h - 30; py += 42) { fl(20, py, 5); fl(w - 20, py + 21, 5); x.beginPath(); x.ellipse(20, py + 21, 3, 8, 0.4, 0, 7); x.fill(); x.beginPath(); x.ellipse(w - 20, py, 3, 8, -0.4, 0, 7); x.fill(); }
    } else { x.lineWidth = 5; x.strokeRect(8, 8, w - 16, h - 16); x.lineWidth = 2; x.strokeRect(16, 16, w - 32, h - 32); x.font = '700 18px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; for (const [fx, fy] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) x.fillText('★', fx, fy); }
    x.restore();
  }
  function giftTag(to, from, msg, o) {
    const SERIF = 'Georgia, "Times New Roman", serif', land = o.layout === 'wide', w = land ? 560 : W, hh = land ? W : 0, m = cvs(10, 10).getContext('2d');
    const fit = (txt, wt, max, maxW, min = 14) => { let sz = max; for (; sz > min; sz -= 2) { m.font = `${wt} ${sz}px ${SERIF}`; if (m.measureText(txt).width <= maxW) break; } return sz; };
    const textW = land ? w - 250 : w - 70, tsz = fit(to, 900, land ? 78 : 62, textW), fsz = fit(from, 800, 30, textW - 70);
    const mlines = msg ? (() => { m.font = `italic 600 20px ${SERIF}`; return wrapLines(m, msg, textW); })().slice(0, 2) : [];
    const h = land ? hh : 168 + tsz + 40 + (from ? 52 : 0) + mlines.length * 26 + 56;
    const rand = rng(Array.from(to + from).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 11)), page2 = cvs(w, h), x = page2.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.strokeStyle = '#000'; giftBorder(x, w, h, o.border, rand);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    const cx = land ? 120 : w / 2, tx = land ? 250 + textW / 2 - 6 : w / 2;
    x.save(); x.fillStyle = '#fff'; if (o.border !== 'plain') { x.beginPath(); x.arc(cx, land ? h / 2 : 98, land ? 78 : 60, 0, 7); x.fill(); } x.restore(); giftIcon(x, cx, land ? h / 2 : 100, land ? 128 : 96, o.icon);
    let y = land ? h / 2 - tsz * 0.1 - (from ? 30 : 6) - mlines.length * 8 : 176; x.fillStyle = '#000';
    x.font = `800 17px ${SERIF}`; x.letterSpacing = '6px'; x.fillText('TO', tx + 3, y); x.letterSpacing = '0px'; y += tsz * 0.92 + 8;
    x.font = `900 ${tsz}px ${SERIF}`; x.fillText(to, tx, y); y += 20;
    if (from) { x.lineWidth = 2; x.beginPath(); x.moveTo(tx - 70, y); x.lineTo(tx - 10, y); x.moveTo(tx + 10, y); x.lineTo(tx + 70, y); x.stroke(); x.beginPath(); x.moveTo(tx, y - 5); x.lineTo(tx + 5, y); x.lineTo(tx, y + 5); x.lineTo(tx - 5, y); x.closePath(); x.fill(); y += 26; x.font = `800 15px ${SERIF}`; x.letterSpacing = '5px'; x.fillText('FROM', tx + 2, y); x.letterSpacing = '0px'; y += fsz * 0.95 + 4; x.font = `italic 800 ${fsz}px ${SERIF}`; x.fillText(from, tx, y); y += 12; }
    x.font = `italic 600 20px ${SERIF}`; mlines.forEach((l, i) => x.fillText(l, tx, y + 18 + i * 26));
    if (o.hole) { x.save(); x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2.5; x.setLineDash([4, 4]); x.beginPath(); if (land) x.arc(34, h / 2, 12, 0, 7); else x.arc(w / 2, 32, 11, 0, 7); x.fill(); x.stroke(); x.restore(); }
    let out = page2;
    if (land) { const r = cvs(h, w), rx = r.getContext('2d'); rx.fillStyle = '#fff'; rx.fillRect(0, 0, h, w); rx.translate(0, w); rx.rotate(-Math.PI / 2); rx.drawImage(page2, 0, 0); out = r; }
    return { bits: Prt.canvasBits(out), h: out.height, canvas: out };
  }


  function invitation(o) {
    const occ = GIFT_OCC.find(x => x.id === o.iv_occ) || GIFT_OCC[1], SERIF = 'Georgia, "Times New Roman", serif', m = cvs(10, 10).getContext('2d'), rows = [['WHEN', o.iv_when], ['WHERE', o.iv_where], ['RSVP', o.iv_rsvp]].filter(r => r[1] && r[1].trim());
    m.font = `800 22px ${SERIF}`; const whoL = wrapLines(m, o.iv_who || 'Come and celebrate!', W - 90).slice(0, 4); m.font = `600 20px ${FONT}`; const rowL = rows.map(r => wrapLines(m, r[1], W - 140).slice(0, 3));
    const h = 220 + whoL.length * 34 + rowL.reduce((n, l) => n + l.length * 26 + 26, 0) + 40, c = cvs(W, h), x = c.getContext('2d'), rand = rng(5);
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, h); x.fillStyle = '#000'; x.strokeStyle = '#000'; giftBorder(x, W, h, occ.border, rand);
    giftIcon(x, W / 2, 84, 96, occ.icon); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.font = `900 ${o.iv_title && o.iv_title.length > 14 ? 34 : 42}px ${SERIF}`; x.fillText(o.iv_title || 'You are invited!', W / 2, 168);
    let y = 214; x.font = `800 22px ${SERIF}`; whoL.forEach(l => { x.fillText(l, W / 2, y); y += 34; }); y += 8;
    rows.forEach((r, i) => { x.font = `900 15px ${FONT}`; x.textAlign = 'left'; x.fillText(r[0], 44, y); x.font = `600 20px ${FONT}`; rowL[i].forEach((l, k) => x.fillText(l, 116, y + k * 26)); y += rowL[i].length * 26 + 26; });
    return { bits: Prt.canvasBits(c), h, canvas: c };
  }


  const gather = r => { const o = {}; r.querySelectorAll('[name]').forEach(e => { if (e.type === 'file' || e.tagName === 'BUTTON') return; o[e.name] = e.type === 'checkbox' ? e.checked : e.value; }); return o; };
  const groupSync = r => { const w = r.querySelector('[name=what]').value; r.querySelectorAll('[data-g]').forEach(g => { g.hidden = !g.dataset.g.split(' ').includes(w); }); };


  // ---------------- Wikipedia flash cards ----------------
  const flash = { items: [], q: '' };
  const cleanText = t => String(t || '').replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const clip = (t, max) => { t = cleanText(t); if (t.length <= max) return t; const parts = t.split(/(?<=[.!?])\s+(?=[A-Z0-9"])/); let out = ''; for (const p of parts) { if (out && (out + ' ' + p).length > max) break; out = out ? out + ' ' + p : p; } return out.length > max ? out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : out; };
  async function wikiFind(term, n, exact) {
    const base = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=extracts|pageimages&exintro=1&explaintext=1&exlimit=20&piprop=thumbnail&pithumbsize=420&';
    const u = exact ? base + 'titles=' + encodeURIComponent(term.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 20).join('|')) : base + 'generator=search&gsrnamespace=0&gsrlimit=' + n + '&gsrsearch=' + encodeURIComponent(term);
    const res = await fetch(u); if (!res.ok) throw new Error('Wikipedia said HTTP ' + res.status);
    const j = await res.json(), pages = j.query ? Object.values(j.query.pages) : [];
    if (!exact) pages.sort((a, b) => a.index - b.index);
    return pages.filter(pg => !pg.missing && pg.extract && !/may refer to|disambiguation/i.test(pg.extract.slice(0, 200))).map(pg => ({ title: pg.title, text: pg.extract, thumb: pg.thumbnail && pg.thumbnail.source, on: true }));
  }
  async function flashImage(it) {
    if (it.bmp !== undefined) return it.bmp; it.bmp = null; if (!it.thumb) return null;
    try { const r = await fetch(it.thumb); if (!r.ok) throw 0; it.bmp = await createImageBitmap(await r.blob()); } catch (e) { it.bmp = null; } return it.bmp;
  }
  const maskTitle = (t, title) => { let out = t; for (const w of title.split(/\s+/).filter(w => w.length > 3)) out = out.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '_____'); return out; };
  function flashPicture(bmp, tall, method) { const hh = tall, c = cvs(384, hh), x = c.getContext('2d'), k = Math.max(384 / bmp.width, hh / bmp.height); x.fillStyle = '#fff'; x.fillRect(0, 0, 384, hh); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, (384 - bmp.width * k) / 2, (hh - bmp.height * k) / 2, bmp.width * k, bmp.height * k); return createImageBitmap(c).then(b => { const bits = ditherBitmap(b, { fit: 'width', method }); const o = cvs(W, bits.h), ox = o.getContext('2d'), id = ox.createImageData(W, bits.h); for (let i = 0; i < bits.length; i++) { const v = bits[i] ? 0 : 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; } ox.putImageData(id, 0, 0); return o; }); }
  async function flashCard(it, o, side, n, total) {
    const SER = 'Georgia, "Times New Roman", serif', m = cvs(10, 10).getContext('2d'), quiz = o.style === 'quiz', front = quiz && side === 'front';
    const body = clip(it.text, o.len), shown = front ? maskTitle(body, it.title) : body, withPic = o.pics && it.thumb;
    let pic = null; if (withPic) { const bmp = await flashImage(it); if (bmp) pic = await flashPicture(bmp, o.picH, o.method); }
    m.font = `500 19px ${SER}`; const tl = wrapLines(m, shown, W - 32), ts = it.title.length > 20 ? 26 : 32; m.font = `900 ${ts}px ${FONT}`; const hl = front ? ['? ? ?'] : wrapLines(m, it.title, W - 32).slice(0, 3);
    const bandH = 12 + hl.length * (ts + 6) + 12, h = bandH + (pic ? pic.height + 12 : 12) + tl.length * 26 + 14 + 22, c = cvs(W, h), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, h); x.fillStyle = '#000'; x.fillRect(0, 0, W, bandH); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 ${ts}px ${FONT}`; hl.forEach((l, i) => x.fillText(l, W / 2, 12 + ts / 2 + i * (ts + 6) + 2));
    if (total > 1) { x.font = `800 13px ${FONT}`; x.textAlign = 'right'; x.fillText((quiz ? (front ? 'Q ' : 'A ') : '') + n + '/' + total, W - 8, 11); }
    let y = bandH; if (pic) { x.drawImage(pic, 0, y + 6); y += pic.height + 12; } else y += 12;
    x.fillStyle = '#000'; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.font = `500 19px ${SER}`; tl.forEach((l, i) => x.fillText(l, 16, y + 20 + i * 26)); y += tl.length * 26 + 14;
    x.font = `500 11px ${FONT}`; x.textAlign = 'right'; x.fillText('Wikipedia · CC BY-SA', W - 10, y + 12); if (front) { x.textAlign = 'left'; x.font = `700 12px ${FONT}`; x.fillText('Who or what is this?', 12, y + 12); }
    return c;
  }
  const flashGap = label => { const c = cvs(W, 32), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, 32); x.fillStyle = '#000'; x.setLineDash([7, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 16); x.lineTo(W - 8, 16); x.stroke(); if (label) { x.setLineDash([]); x.fillStyle = '#fff'; const w = 150; x.fillRect((W - w) / 2, 6, w, 20); x.fillStyle = '#000'; x.font = `800 12px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, W / 2, 17); } return c; };
  function flashInit(r) {
    const q = n => r.querySelector('[name=' + n + ']'); const status = t => { q('status').textContent = t || ''; };
    const draw = () => { const l = q('list'); l.innerHTML = ''; flash.items.forEach((it, i) => { const lab = document.createElement('label'); lab.className = 'fcrow'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.on; cb.onchange = () => { it.on = cb.checked; r.dispatchEvent(new Event('input', { bubbles: true })); }; lab.append(cb, ' ' + it.title + (it.thumb ? ' 🖼' : '')); l.appendChild(lab); }); };
    q('go').onclick = async () => {
      const term = q('q').value.trim(); if (!term) { status('Type a subject first, like volcanoes or Romans.'); return; } status('Looking on Wikipedia…'); q('go').disabled = true;
      try { const exact = q('find').value === 'titles'; flash.items = await wikiFind(term, +q('n').value, exact); draw(); status(flash.items.length ? `Found ${flash.items.length}. Untick any you do not want.` : 'Nothing found. Try another word.'); r.dispatchEvent(new Event('input', { bubbles: true })); }
      catch (e) { status('Search failed: ' + e.message + ' (this needs an internet connection)'); } finally { q('go').disabled = false; }
    };
    q('q').addEventListener('keydown', e => { if (e.key === 'Enter' && q('find').value !== 'titles') { e.preventDefault(); q('go').click(); } });
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
        + sel('shape', 'Shape', [['circle', 'Circle'], ['rounded', 'Rounded square'], ['heart', 'Heart'], ['star', 'Star']], 'circle') + field('label', 'Label under it (optional)', 'text', '', 'maxlength="40"')
        + pickerHtml,
      build(r, v) { const src = pickedBits || lastBits; if (!src) throw new Error('No photo yet. Open the Cam tab and let the camera start, or choose a picture.'); return sticker(v('shape').value, src, v('label').value); },
      init(r) { pickerInit(r); },
    },
    scan: {
      title: '🔍 QR scanner',
      html: () => `<canvas name="gbv" width="320" height="288" style="width:100%;max-width:320px;display:block;margin:6px auto;border-radius:10px;border:3px solid #0f380f;background:#9bbc0f;image-rendering:pixelated"></canvas>
        <div class="sub" name="stat" style="text-align:center">Starting camera…</div>
        <div class="row"><button name="flip" type="button">⟲ Flip camera</button><button name="again" type="button">Scan again</button></div>
        <div name="found" hidden><label class="sub" style="display:block;margin-top:8px">Found</label><textarea name="res" rows="3" readonly></textarea>
        <div class="row"><button name="copy" type="button">Copy</button><button name="open" type="button" hidden>Open link</button></div></div>
        ${chk('cap', 'Print the text under the QR', true)}<div class="ctl"><span>Size</span><input name="size" type="range" min="180" max="380" step="10" value="300"><output></output></div>
        <div name="histbox" hidden><label class="sub" style="display:block;margin-top:8px">Recent scans (tap to reprint)</label><div name="hist"></div><div class="row"><button name="clrhist" type="button">Clear history</button></div></div>
        <div class="sub">Reads QR codes and most barcodes with the camera, then lets you print a fresh QR label of whatever it found. Nothing leaves your phone.</div>`,
      build(r, v) {
        if (!scan.text) throw new Error('Scan a QR code first: point the camera at one.');
        const parts = [qrCanvas(scan.text, +v('size').value)];
        if (v('cap').checked) parts.push(Prt.textBits(scan.text.length > 80 ? scan.text.slice(0, 77) + '…' : scan.text, { size: 20, bold: false }));
        parts.push(Prt.blank(6)); return Prt.stack(parts);
      },
      init(r) { scanInit(r); },
      onShow(r) { scanStart(r); },
      onHide() { scanStop(); },
    },
    wanted: {
      title: '🤠 Wanted poster',
      html: () => `<div class="sub">An old-west poster with the camera photo (or any picture you choose). Take the photo in the Cam tab first.</div>` + field('name', 'Name', 'text', 'BIG ALEX', 'maxlength="22"') + field('crime', 'Wanted for', 'text', 'Stealing the last biscuit', 'maxlength="80"') + field('reward', 'Reward', 'text', '$5,000', 'maxlength="14"')
        + sel('tag', 'Tagline', [['DEAD OR ALIVE', 'DEAD OR ALIVE'], ['ALIVE AND UNHARMED', 'ALIVE AND UNHARMED'], ['BY ORDER OF MUM', 'BY ORDER OF MUM'], ['VERY DANGEROUS', 'VERY DANGEROUS'], ['LAST SEEN NEAR THE FRIDGE', 'LAST SEEN NEAR THE FRIDGE']], 'DEAD OR ALIVE') + chk('worn', 'Worn old paper', true) + pickerHtml,
      build(r, v) { const src = pickedBits || lastBits; if (!src) throw new Error('No photo yet. Take one in the Cam tab, or choose a picture.'); return wantedPoster(src, v('name').value || 'UNKNOWN', v('crime').value, v('reward').value, v('tag').value, v('worn').checked); },
      init(r) { pickerInit(r); },
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
      async build(r, v, o) {
        if (v('wx').checked && !weatherText && !(o && o.live)) { try { await fetchWeather(); r.querySelector('[name=wxout]').textContent = weatherText; } catch (e) { log('weather failed', e.message); } }
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
    colour: {
      title: '🖍 Colouring page',
      html: () => sel('detail', 'How detailed?', [['1', 'Easy (big shapes)'], ['2', 'Medium'], ['3', 'Tricky (lots of detail)']], '2') + sel('folds', 'Pattern', [['0', 'Surprise me'], ['6', '6-fold'], ['8', '8-fold'], ['12', '12-fold']], '0') + `<div class="sub">A new pattern to colour in every time. Press New for another.</div>`,
      build(r, v) { return mandala(+v('detail').value, +v('folds').value); },
    },
    joke: {
      title: '😂 Joke slip',
      html: () => `<div class="sub">A joke with the punchline printed upside down at the bottom, so you read it by turning the paper round. Press New for another.</div>`,
      build() { const [q, a] = JOKES[rnd(JOKES.length)]; return jokeSlip(q, a); },
    },
    badge: {
      title: '📛 Name badge',
      html: () => field('name', 'Name', 'text', 'ALEX', 'maxlength="16"') + sel('orient', 'Direction', [['side', 'Sideways, turned right 90°: huge and long'], ['sideL', 'Sideways, turned left 90°: huge and long'], ['up', 'Upright: small']], 'side') + sel('style', 'Style', [['band', 'Black band'], ['frame', 'Plain frame'], ['star', 'Stars']], 'band') + field('sub', 'Extra line (optional)', 'text', '', 'maxlength="30" placeholder="e.g. Chief snack officer"'),
      build(r, v) { return v('orient').value === 'up' ? badge(v('name').value || ' ', v('style').value, v('sub').value) : badgeSide(v('name').value || ' ', v('style').value, v('sub').value, v('orient').value === 'sideL'); },
    },
    ansidraw: {
      noPreview: true,
      title: '🎨 ANSI draw',
      html: () => '<div name="ad"></div>',
      init(r) { AnsiDraw.mount(r.querySelector('[name=ad]'), {}); },
      async build() { return AnsiDraw.toBits(); },
      onShow() { },
    },
    ansi: {
      title: '💾 ANSI / BBS art',
      html: () => sel('art', 'Art', [['bbs', 'GB CatCam BBS screen'], ['cat', 'Cat'], ['plasma', 'Plasma'], ['copper', 'Copper bars'], ['nfo', 'Release NFO (text file with block art)'], ['file', 'My own .ANS / .NFO file']], 'bbs')
        + `<div class="row"><button name="open" type="button">📂 Open an .ANS or .NFO file…</button><button name="edit" type="button">✏️ Edit in ANSI draw</button><input name="file" type="file" hidden></div><div class="sub" name="fname"></div>`
        + sel('dir', 'Print as', [['side', 'Sideways, real size (turn the paper to read)'], ['up', 'Upright, shrunk to fit the paper']], 'side') + sel('look', 'Colours', [['screen', 'Screen look (like the monitor, black background)'], ['paper', 'Light paper (negative, uses much less ink)']], 'screen')
        + `<div class="sub">Sideways prints an 80×24 screen at exactly 1:1 pixels; taller art comes out as several strips to tape together. Find more art at <a href="https://16colo.rs" target="_blank" rel="noopener" style="color:var(--acc)">16colo.rs ↗</a>, download an .ANS file and open it here. Art on that site belongs to its artists, so keep it to personal printing and credit them.</div>`,
      async build(r, v) {
        await Ansi.ready(); let doc;
        if (v('art').value === 'file') { if (!ansiDoc) throw new Error('Tap “Open an .ANS or .NFO file…” and pick one you downloaded.'); doc = ansiDoc; } else doc = Ansi.ART[v('art').value]();
        return Ansi.toBits(doc, { dir: v('dir').value, look: v('look').value, crisp: v('dir').value === 'up' && Ansi.isTextLike(doc) });
      },
      init(r) {
        const f = r.querySelector('[name=file]'), note = r.querySelector('[name=fname]');
        r.querySelector('[name=open]').onclick = () => f.click();
        r.querySelector('[name=edit]').onclick = async () => { await Ansi.ready(); const kind = r.querySelector('[name=art]').value; const doc = kind === 'file' ? ansiDoc : Ansi.ART[kind](); if (!doc) { toast('Open a file first', 'bad'); return; } AnsiDraw.load(Object.assign(Ansi.blank(doc.cols, doc.rows), { ch: doc.ch.slice(), at: doc.at.slice(), sauce: doc.sauce })); Make.show('ansidraw'); toast('Opened in ANSI draw'); };
        const setFor = (kind) => { const text = kind === 'nfo' || kind === 'text'; r.querySelector('[name=dir]').value = text ? 'up' : 'side'; r.querySelector('[name=look]').value = text ? 'paper' : 'screen'; }; // text files: one upright print, dark on white; art: real-size sideways
        r.querySelector('[name=art]').addEventListener('change', e => { setFor(e.target.value === 'file' ? (ansiKind || 'art') : e.target.value); });
        f.onchange = async () => { const file = f.files[0]; if (!file) return; try { ansiKind = /\.(nfo|txt|diz|asc|me|1st)$/i.test(file.name) ? 'text' : 'art'; setFor(ansiKind); ansiDoc = Ansi.parse(new Uint8Array(await file.arrayBuffer())); note.textContent = `${file.name}: ${ansiDoc.cols}×${ansiDoc.rows}` + (ansiDoc.sauce && ansiDoc.sauce.author ? ` by ${ansiDoc.sauce.author}` : ''); r.querySelector('[name=art]').value = 'file'; r.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { toast('Could not read that file', 'bad'); } f.value = ''; };
      },
    },
    gift: {
      title: '🎁 Gift tags',
      html: () => sel('occasion', 'Occasion', GIFT_OCC.map(o => [o.id, o.name]), 'christmas') + field('to', 'To (one name per line makes one tag each)', 'textarea', 'Grandma\nUncle Joe\nMaya', 'rows="4"') + field('from', 'From', 'text', 'Alan', 'maxlength="24"') + field('msg', 'Message (optional)', 'text', 'Merry Christmas!', 'maxlength="40"')
        + sel('border', 'Border', [['holly', 'Holly sprigs'], ['snow', 'Snowflakes'], ['cane', 'Candy cane stripes'], ['confetti', 'Confetti'], ['hearts', 'Hearts'], ['bunting', 'Bunting flags'], ['web', 'Cobwebs'], ['flowers', 'Flowers'], ['plain', 'Plain with stars']], 'holly')
        + sel('icon', 'Picture', [['tree', 'Christmas tree'], ['snowman', 'Snowman'], ['cane', 'Candy cane'], ['bauble', 'Bauble'], ['present', 'Present'], ['star', 'Star'], ['cake', 'Birthday cake'], ['balloons', 'Balloons'], ['pumpkin', 'Pumpkin'], ['ghost', 'Ghost'], ['bat', 'Bat'], ['egg', 'Easter egg'], ['bunny', 'Bunny'], ['heart', 'Heart'], ['rings', 'Wedding rings'], ['bear', 'Teddy bear'], ['menorah', 'Menorah'], ['diya', 'Diya lamp'], ['flower', 'Flower'], ['cap', 'Graduation cap']], 'tree')
        + sel('layout', 'Shape', [['tall', 'Tag (upright)'], ['wide', 'Wide label (turn the paper)']], 'tall') + chk('hole', 'Dotted circle to punch a hole for string', true)
        + `<div class="sub">Pick an occasion and the border, picture and message change to match; you can still change any of them. Add “Name | From” on a line to give one person a different sender, for example “Grandma | Santa”. Up to 12 tags at once, printed one after another with a cut line between them.</div>`,
      init(r) {
        const q = n => r.querySelector('[name=' + n + ']');
        q('occasion').addEventListener('change', () => { const o = GIFT_OCC.find(x => x.id === q('occasion').value); if (!o) return; const prev = new Set(GIFT_OCC.map(x => x.msg)); q('border').value = o.border; q('icon').value = o.icon; if (!q('msg').value.trim() || prev.has(q('msg').value.trim())) q('msg').value = o.msg; r.dispatchEvent(new Event('input', { bubbles: true })); });
      },
      build(r, v) {
        const lines = v('to').value.split('\n').map(t => t.trim()).filter(Boolean).slice(0, 12); if (!lines.length) throw new Error('Type at least one name.');
        const o = { border: v('border').value, icon: v('icon').value, layout: v('layout').value, hole: v('hole').checked }, parts = [];
        lines.forEach((l, i) => { const [to, fr] = l.split('|').map(t => t.trim()); if (i) parts.push(gapRow()); parts.push(giftTag(to, fr == null || fr === '' ? v('from').value.trim() : fr, v('msg').value.trim(), o)); });
        parts.push(Prt.blank(6)); return Prt.stack(parts);
      },
    },
    search: {
      title: '🔎 Image search',
      html: () => field('q', 'Search for a picture', 'text', '', 'placeholder="e.g. lighthouse, dinosaur, Eiffel Tower" maxlength="80"')
        + sel('src', 'Search in', [['commons', 'Wikimedia Commons (free, no key)'], ['google', 'Google (needs your own free key, see below)']], 'commons')
        + `<div class="row"><button name="go" type="button" class="pri">Search</button><button name="more" type="button" hidden>More results</button></div><div name="status" class="sub"></div><div name="grid" class="srgrid"></div>`
        + `<div name="picked" hidden><div class="sub" name="credittext"></div>`
        + sel('fit', 'Shape', [['cover', 'Photo (384×336, cropped to fill)'], ['width', 'Whole picture (full width, any height)']], 'cover') + sel('method', 'Look', [['fs', 'Photo (smooth dots)'], ['bayer', 'Newspaper (regular dots)'], ['thresh', 'Poster (black and white only)']], 'fs') + chk('invert', 'Invert (swap black and white)', false) + chk('credit', 'Print the picture credit underneath', true)
        + `<div class="row"><button name="tosticker" type="button">Use for a sticker</button><button name="towanted" type="button">Use for a wanted poster</button></div></div>`
        + `<details style="margin-top:10px"><summary>Use Google instead</summary><div class="sub">Google needs your own free key: create a Programmable Search Engine (turn on “Image search” and “Search the entire web”) and an API key, which allows 100 searches a day. The key stays on this phone. Google’s pictures come through the free images.weserv.nl service so the app is allowed to read them.</div>${field('gkey', 'API key', 'text', '', 'autocomplete="off"')}${field('gcx', 'Search engine ID (cx)', 'text', '', 'autocomplete="off"')}<div class="sub"><a href="https://developers.google.com/custom-search/v1/overview" target="_blank" rel="noopener" style="color:var(--acc)">How to get them ↗</a></div></details>`
        + `<div class="sub" style="margin-top:8px">Wikimedia Commons pictures are free to use but need credit, which is why the credit line is printed. Pictures from Google belong to whoever made them; keep them for personal printing.</div>`,
      async build(r, v) {
        if (!searchSel || !searchSel.bmp) throw new Error('Search for something, then tap a picture.');
        const o = { fit: v('fit').value, method: v('method').value, invert: v('invert').checked }, bits = ditherBitmap(searchSel.bmp, o), parts = [{ bits, h: bits.h }];
        if (v('credit').checked && searchSel.credit) parts.push(Prt.textBits(searchSel.credit, { size: 14, bold: false, pad: 6 }));
        parts.push(Prt.blank(8)); return Prt.stack(parts);
      },
      init(r) { searchInit(r); },
    },
    turtle: {
      title: '🐢 Turtle (Logo)',
      html: () => sel('example', 'Start from an example', [['', 'Choose an example…']].concat(Object.entries(Logo.EXAMPLES).map(([k, v]) => [k, v[0]])), '')
        + field('code', 'Your Logo program', 'textarea', 'REPEAT 36 [REPEAT 4 [FD 80 RT 90] RT 10]', 'rows="9" spellcheck="false" autocapitalize="off" style="font-family:ui-monospace,Menlo,monospace;font-size:14px"')
        + sel('page', 'Paper', [['sq', 'Square (384 × 384)'], ['tall', 'Tall (384 × 576)'], ['wide', 'Short (384 × 288)']], 'sq') + chk('fit', 'Scale the drawing to fill the paper', true) + `<div class="ctl"><span>Pen size</span><input name="pen" type="range" min="1" max="6" step="1" value="2"><output></output></div>`
        + `<div class="sub"><b>Commands:</b> FD n, BK n, RT n, LT n (turn by degrees), PU and PD (pen up/down), HOME, CS, SETXY x y, SETH n, PENSIZE n, CIRCLE r, ARC angle r, LABEL "word. <b>Repeating:</b> REPEAT n [ … ], FOR [i 1 10 1] [ … ]. <b>Thinking:</b> MAKE "x 10, then use :x. IF :x &gt; 5 [ … ], IFELSE c [ … ] [ … ]. Maths: + − * / ( ) SIN COS SQRT RANDOM INT. <b>Your own words:</b> TO SQUARE :s … END, then SQUARE 50. Recursion works, so a procedure can call itself (add IF … [STOP] so it ends).</div>`,
      build(r, v) {
        const dims = { sq: [384, 384], tall: [384, 576], wide: [384, 288] }[v('page').value], res = Logo.run(v('code').value, { penSize: +v('pen').value });
        if (!res.segs.length && !res.labels.length) throw new Error('Nothing drawn yet. Try FD 100 RT 90 …');
        const c = Logo.draw(res, dims[0], dims[1], v('fit').checked); return { bits: Prt.canvasBits(c), h: dims[1], canvas: c };
      },
      init(r) { const ex = r.querySelector('[name=example]'), code = r.querySelector('[name=code]'); ex.addEventListener('change', () => { const e = Logo.EXAMPLES[ex.value]; if (e) { code.value = e[1]; r.dispatchEvent(new Event('input', { bubbles: true })); } }); },
    },
    origami: {
      title: '🦢 Origami',
      html: () => sel('model', 'What to fold', Object.entries(Origami.MODELS).map(([k, v]) => [k, v[0]]), 'dart')
        + `<div name="o_stars">${sel('pattern', 'Strip pattern', [['stripes', 'Stripes'], ['dots', 'Dots'], ['hearts', 'Hearts'], ['zigzag', 'Zigzags'], ['plain', 'Plain (write your own)']], 'stripes')}${field('message', 'Message printed on the strips (optional)', 'text', 'MAKE A WISH', 'maxlength="22"')}${sel('length', 'Strip length', [['std', 'Standard (20 cm)'], ['long', 'Long (30 cm, bigger stars)']], 'std')}</div>`
        + `<div name="o_pin">${sel('ppat', 'Pinwheel pattern', [['stripes', 'Stripes'], ['rings', 'Rings'], ['dots', 'Dots'], ['plain', 'Plain']], 'rings')}</div><div name="o_snake">${sel('spat', 'Snake pattern', [['diamonds', 'Diamonds'], ['bands', 'Bands'], ['dots', 'Dots']], 'diamonds')}</div>`
        + `<div name="o_snow" class="row"><button name="newflake" type="button">🔀 New snowflake cuts</button></div>`
        + `<div name="o_parts">${sel('parts', 'Size', [['1', 'Small (48 mm wide, one piece)'], ['2', 'Big (about 96 mm: 2 parts to tape together)'], ['3', 'Huge (about 144 mm: 3 parts to tape together)']], '1')}</div>`
        + `<div class="sub">Designed for the 48 mm paper roll: strips for stars and the snake, small squares and rectangles for the rest. Print it, tear it off, cut out along the solid lines and follow the little numbered steps printed underneath. Dashes are valley folds, dash-dot are mountain folds.</div>`,
      build(r, v) { const m = v('model').value, c = Origami.build(m, { pattern: m === 'stars' ? v('pattern').value : m === 'pinwheel' ? v('ppat').value : v('spat').value, message: v('message').value, length: v('length').value, parts: v('parts').value, seed: st.originSeed || 1 }); return { bits: Prt.canvasBits(c), h: c.height, canvas: c }; },
      init(r) {
        const q = n => r.querySelector('[name=' + n + ']'), sync = () => { const m = q('model').value; q('o_stars').hidden = m !== 'stars'; q('o_pin').hidden = m !== 'pinwheel'; q('o_snake').hidden = m !== 'snake' && m !== 'fan'; q('o_snow').hidden = m !== 'snowflake'; q('o_parts').hidden = !['dart', 'pinwheel', 'snowflake', 'hat'].includes(m); };
        q('model').addEventListener('change', sync); sync(); q('newflake').onclick = () => { st.originSeed = 1 + rnd(9999); r.dispatchEvent(new Event('input', { bubbles: true })); };
      },
    },
    party: {
      title: '🎉 Party printables',
      html: () => sel('what', 'What to make', [['bingo', '🎱 Bingo cards'], ['scavenger', '🔍 Scavenger hunt card'], ['secret', '🕵️ Secret message + code key'], ['wheel', '🎡 Secret code wheel'], ['raffle', '🎟 Raffle tickets'], ['invite', '💌 Invitation']], 'bingo')
        + `<div data-g="bingo">${sel('bingo_mode', 'Card type', [['numbers', 'Numbers (classic bingo)'], ['words', 'My own words or pictures']], 'numbers')}${sel('bingo_size', 'Grid', [['5', '5 × 5'], ['4', '4 × 4'], ['3', '3 × 3 (little kids)']], '5')}${field('bingo_count', 'How many different cards (1–8)', 'number', 4, 'min="1" max="8"')}${field('bingo_title', 'Title (own words only)', 'text', 'PARTY BINGO', 'maxlength="16"')}${field('bingo_items', 'Words (one per line, own words only)', 'textarea', 'Cake\nBalloon\nPresent\nCandle\nMusic\nDance\nSinging\nGames\nSweets\nParty hat\nStreamers\nPhoto\nJuice\nCards\nSnack\nGift bag\nBubbles\nCrown\nTreasure\nSurprise\nFlag\nDrum\nSong\nClap\nPizza', 'rows="5"')}${chk('bingo_caller', 'Add a caller sheet (numbers 1–75, 5 × 5 only)', true)}<div class="row"><button name="newcards" type="button">🔀 New cards</button></div></div>`
        + `<div data-g="scavenger">${field('sc_title', 'Title', 'text', 'SCAVENGER HUNT', 'maxlength="24"')}${field('sc_items', 'Things to find (one per line)', 'textarea', 'Something red\nA smooth stone\nA leaf bigger than your hand\nSomething that starts with B\nA feather\nAn animal footprint', 'rows="6"')}</div>`
        + `<div data-g="secret">${field('sec_msg', 'Your secret message', 'textarea', 'MEET ME BY THE OLD OAK TREE AT NOON', 'rows="3"')}${sel('sec_cipher', 'Code', [['caesar', 'Shift code (Caesar)'], ['num', 'Numbers (A=1, B=2…)'], ['morse', 'Morse code']], 'caesar')}<div class="ctl"><span>Shift by</span><input name="sec_shift" type="range" min="1" max="25" value="3"><output></output></div></div>`
        + `<div data-g="wheel"><div class="sub">Two paper discs to cut out and pin together in the middle. Turn the small one and you can write and read shift codes without a key card.</div></div>`
        + `<div data-g="raffle">${field('rf_event', 'Event name', 'text', 'SCHOOL FAIR', 'maxlength="18"')}${field('rf_count', 'How many tickets (1–12)', 'number', 6, 'min="1" max="12"')}${field('rf_start', 'First number', 'number', 1, 'min="1"')}</div>`
        + `<div data-g="invite">${sel('iv_occ', 'Occasion (sets the border and picture)', GIFT_OCC.map(o => [o.id, o.name]), 'birthday')}${field('iv_title', 'Heading', 'text', 'You are invited!', 'maxlength="22"')}${field('iv_who', 'Who and what', 'text', 'Maya’s 9th birthday party', 'maxlength="70"')}${field('iv_when', 'When', 'text', 'Saturday 14 June, 2 to 5 pm', 'maxlength="60"')}${field('iv_where', 'Where', 'text', '12 Park Road, Garden Flat', 'maxlength="60"')}${field('iv_rsvp', 'RSVP (optional)', 'text', 'Alan: 07700 900123', 'maxlength="50"')}</div>`,
      init(r) { const w = r.querySelector('[name=what]'); w.addEventListener('change', () => groupSync(r)); groupSync(r); r.querySelector('[name=newcards]').onclick = () => { st.partySeed = 1 + rnd(99999); r.dispatchEvent(new Event('input', { bubbles: true })); }; },
      build(r) { const o = gather(r); o.seed = st.partySeed || 1; if (o.what === 'invite') return invitation(o); const c = Printables.build(o.what, o); return { bits: Prt.canvasBits(c), h: c.height, canvas: c }; },
    },
    labels: {
      title: '🏷 Labels & templates',
      html: () => sel('what', 'What to make', [['pantry', '🥫 Pantry date labels'], ['cable', '🔌 Cable flags'], ['plant', '🌱 Plant labels'], ['recipe', '🍳 Recipe card'], ['ruler', '📏 Ruler (real size)']], 'pantry')
        + `<div data-g="pantry">${field('pl_name', 'What is it?', 'text', 'Chicken curry', 'maxlength="22"')}${field('pl_date', 'Opened or made on', 'date', todayISO())}${sel('pl_days', 'Good for', [['1', '1 day'], ['2', '2 days'], ['3', '3 days'], ['5', '5 days'], ['7', '1 week'], ['14', '2 weeks'], ['30', '1 month'], ['90', '3 months'], ['180', '6 months']], '3')}${field('pl_copies', 'Copies (1–12)', 'number', 2, 'min="1" max="12"')}</div>`
        + `<div data-g="cable">${field('cb_text', 'Name of each cable (one per line)', 'textarea', 'TV\nGAMES CONSOLE\nLAPTOP\nPHONE', 'rows="4"')}</div>`
        + `<div data-g="plant">${field('pt_name', 'Plant name', 'text', 'Basil', 'maxlength="20"')}${sel('pt_water', 'Water', [['0', 'Rarely'], ['1', 'Weekly'], ['2', 'Twice a week'], ['3', 'Every day']], '2')}${sel('pt_sun', 'Light', [['full', 'Full sun'], ['part', 'Part shade'], ['shade', 'Shade']], 'full')}${field('pt_note', 'A note (optional)', 'text', 'Pinch off the flowers', 'maxlength="40"')}${field('pt_copies', 'Copies (1–6)', 'number', 2, 'min="1" max="6"')}</div>`
        + `<div data-g="recipe">${field('rc_title', 'Recipe name', 'text', 'Pancakes', 'maxlength="26"')}${field('rc_meta', 'Serves / time (optional)', 'text', 'Serves 4 · 20 minutes', 'maxlength="40"')}${field('rc_ing', 'Ingredients (one per line)', 'textarea', '200 g plain flour\n2 eggs\n300 ml milk\nPinch of salt\nButter for the pan', 'rows="5"')}${field('rc_steps', 'Method (one step per line)', 'textarea', 'Whisk the flour, eggs, milk and salt into a smooth batter.\nRest it for 10 minutes.\nFry a ladle of batter in a hot buttered pan, 1 minute each side.', 'rows="5"')}</div>`
        + `<div data-g="ruler">${sel('rl_unit', 'Marks', [['both', 'Centimetres and inches'], ['cm', 'Centimetres and millimetres'], ['inch', 'Inches and sixteenths']], 'both')}${sel('rl_len', 'Length', [['10', '10 cm'], ['15', '15 cm'], ['20', '20 cm'], ['30', '30 cm'], ['45', '45 cm'], ['60', '60 cm']], '15')}<div class="sub">The paper roll prints about 8 dots to the millimetre, so the marks are true size. Check against a real ruler once.</div></div>`,
      init(r) { r.querySelector('[name=what]').addEventListener('change', () => groupSync(r)); groupSync(r); },
      build(r) { const o = gather(r), c = Printables.build(o.what, o); return { bits: Prt.canvasBits(c), h: c.height, canvas: c }; },
    },
    planner: {
      title: '📅 Planners',
      html: () => sel('what', 'What to make', [['month', '🗓 Monthly calendar'], ['week', '📆 Weekly planner'], ['day', '☑️ Day planner'], ['habits', '✅ Habit tracker'], ['meals', '🍽 Meal planner']], 'month')
        + `<div data-g="month">${field('mo_month', 'Month', 'month', monthISO())}${sel('mo_start', 'Week starts on', [['mon', 'Monday'], ['sun', 'Sunday']], 'mon')}${chk('mo_notes', 'Add a notes area underneath', true)}</div>`
        + `<div data-g="week">${field('wk_date', 'Any day in the week', 'date', todayISO())}</div>`
        + `<div data-g="day">${field('dy_date', 'Day', 'date', todayISO())}</div>`
        + `<div data-g="habits">${field('hb_month', 'Month', 'month', monthISO())}${field('hb_list', 'Habits (one per line, up to 12)', 'textarea', 'Drink water\nRead 10 minutes\nTidy up\nWalk', 'rows="5"')}<div class="sub">The tracker is drawn sideways and printed down the paper: turn it to read.</div></div>`
        + `<div data-g="meals">${field('ml_title', 'Title', 'text', 'MEAL PLAN', 'maxlength="18"')}</div>`,
      init(r) { r.querySelector('[name=what]').addEventListener('change', () => groupSync(r)); groupSync(r); },
      build(r) { const o = gather(r), c = Printables.build(o.what, o); return { bits: Prt.canvasBits(c), h: c.height, canvas: c }; },
    },
    flash: {
      title: '📚 Wikipedia cards',
      html: () => sel('find', 'Find', [['topics', 'Topics about a subject (e.g. volcanoes)'], ['titles', 'Exact articles (one per line)']], 'topics')
        + field('q', 'Subject', 'textarea', 'Volcanoes', 'rows="2" maxlength="300" placeholder="e.g. Volcanoes, Roman Empire, Black holes"')
        + sel('n', 'How many cards', [['4', '4'], ['6', '6'], ['8', '8'], ['12', '12'], ['20', '20']], '6')
        + `<div class="row"><button name="go" type="button" class="pri">🔍 Find cards</button></div><div name="status" class="sub"></div><div name="list"></div>`
        + sel('style', 'Card style', [['fact', 'Fact card (title, picture, facts)'], ['quiz', 'Quiz pair (question side + answer side)']], 'fact')
        + sel('lenk', 'Amount of text', [['s', 'Short (a sentence or two)'], ['m', 'Medium'], ['l', 'Long (a paragraph)']], 'm')
        + chk('pics', 'Include pictures', true) + sel('pk', 'Picture height', [['150', 'Small'], ['200', 'Medium'], ['260', 'Large']], '200') + sel('method', 'Picture look', [['fs', 'Photo (smooth dots)'], ['bayer', 'Newspaper (regular dots)']], 'fs')
        + `<div class="sub">Search results come straight from Wikipedia, so it needs an internet connection. Text is under the CC BY-SA licence, which is why each card says so. Quiz pairs hide the answer word in the question text: print them, cut them apart and test each other.</div>`,
      async build(r, v) {
        const picks = flash.items.filter(i => i.on); if (!picks.length) throw new Error('Type a subject and tap “Find cards”.');
        const o = { style: v('style').value, len: { s: 170, m: 340, l: 640 }[v('lenk').value], pics: v('pics').checked, picH: +v('pk').value, method: v('method').value }, parts = [];
        for (let i = 0; i < picks.length; i++) {
          if (i) parts.push({ canvas: flashGap(''), cut: true });
          if (o.style === 'quiz') { parts.push({ canvas: await flashCard(picks[i], o, 'front', i + 1, picks.length) }); parts.push({ canvas: flashGap('✂ fold or cut') }); parts.push({ canvas: await flashCard(picks[i], o, 'back', i + 1, picks.length) }); }
          else parts.push({ canvas: await flashCard(picks[i], o, 'back', i + 1, picks.length) });
        }
        const total = parts.reduce((n, p) => n + p.canvas.height, 0), c = cvs(W, total), x = c.getContext('2d'); let y = 0; for (const p of parts) { x.drawImage(p.canvas, 0, y); y += p.canvas.height; }
        return { bits: Prt.canvasBits(c), h: total, canvas: c };
      },
      init(r) { flashInit(r); },
    },
    scroll: {
      title: '📜 Scroll message',
      html: () => field('head', 'Title', 'text', 'HEAR YE!', 'maxlength="30"') + field('msg', 'Message', 'textarea', 'You are hereby invited to tea and cake.', 'rows="4"') + sel('size', 'Text size', [['22', 'Small'], ['28', 'Medium'], ['36', 'Large']], '28')
        + `<div class="sub">A parchment scroll with rolled ends, for invitations, notes and awards. The same scroll border is in Fun → Frame.</div>`,
      build(r, v) {
        const sz = +v('size').value, m = cvs(W, 10).getContext('2d'); m.font = `600 ${sz}px ${FONT}`;
        const lines = wrapLines(m, v('msg').value || ' ', W - 100), lh = Math.round(sz * 1.25), top = 66, titleH = v('head').value ? 56 : 0, h = Math.max(250, top + titleH + lines.length * lh + 72);
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
      noPreview: true,
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
        const style = () => { lx.strokeStyle = lx.fillStyle = pad.pen === 'black' ? '#000' : '#fff'; lx.lineWidth = pad.size; lx.lineCap = lx.lineJoin = 'round'; };
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let pm = null;
        cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); down = true; pad.undo.push(lx.getImageData(0, 0, W, H)); if (pad.undo.length > 20) pad.undo.shift(); last = pt(e); pm = last; style(); lx.beginPath(); lx.arc(last[0], last[1], pad.size / 2, 0, 7); lx.fill(); redraw(); e.preventDefault(); };
        cv.onpointermove = e => { if (!down) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; style(); for (const ev of (evs.length ? evs : [e])) { const p = pt(ev), m = mid(last, p); lx.beginPath(); lx.moveTo(pm[0], pm[1]); lx.quadraticCurveTo(last[0], last[1], m[0], m[1]); lx.stroke(); pm = m; last = p; } redraw(); e.preventDefault(); };
        cv.onpointerup = cv.onpointercancel = () => { if (down && pm) { style(); lx.beginPath(); lx.moveTo(pm[0], pm[1]); lx.lineTo(last[0], last[1]); lx.stroke(); redraw(); } down = false; };
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
  const panels = {}, st = { kind: 'strip', res: null, tok: 0, timer: 0, copies: 1 };
  const NOPERSIST = { code: ['b', 'c'] }; // never store Wi-Fi passwords / contact details
  const RANDOM = ['maze', 'sudoku', 'words', 'dice', 'day', 'colour', 'joke'];
  const vals = d => { const o = {}; d.querySelectorAll('input,select,textarea').forEach(e => { if (e.name && e.type !== 'file') o[e.name] = e.type === 'checkbox' ? e.checked : e.value; }); return o; };
  function restore(k, d) { const o = (saved.vals || {})[k]; if (!o) return; d.querySelectorAll('input,select,textarea').forEach(e => { if (!(e.name in o) || e.type === 'file') return; if (e.type === 'checkbox') e.checked = !!o[e.name]; else e.value = o[e.name]; }); }
  function persist(k, d) { const o = vals(d); for (const n of NOPERSIST[k] || []) delete o[n]; (saved.vals = saved.vals || {})[k] = o; store(); }
  const gapRow = () => page(26, x => { x.setLineDash([7, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 13); x.lineTo(W - 8, 13); x.stroke(); x.setLineDash([]); x.font = `700 14px ${FONT}`; x.fillText('✂', 14, 4); });

  const bar = document.createElement('div'); bar.id = 'mkbar';
  bar.innerHTML = `<div id="mkmeta" class="sub"></div>
    <div class="row"><div id="mkcopies" role="group" aria-label="Copies"><button id="mkminus" aria-label="Fewer copies">−</button><output id="mkn">1</output><button id="mkplus" aria-label="More copies">+</button></div><button id="mkprint" class="pri">🖨 Print</button></div>
    <div class="row"><button id="mknew" hidden>🔀 New</button><button id="mkext" hidden>🖨 Answer</button><button id="mksave">💾 PNG</button><button id="mkshare">↗ Share</button><button id="mklast" title="Print the last thing again">↻ Last</button></div>
    <div class="row"><button id="mkpart" title="Print only part of it">✂ Part</button><button id="mkrest" hidden>▶ Print the rest</button></div>`;
  const prev = document.createElement('div'); prev.id = 'mkprev'; prev.innerHTML = '<div id="mkpartbox" hidden><div id="mkpartinfo" class="sub" style="margin:0 0 4px"></div><div class="ctl"><span>From</span><input id="mkpa" type="range" min="0" max="100" value="0"></div><div class="ctl"><span>To</span><input id="mkpb" type="range" min="0" max="100" value="100"></div><div class="row"><button id="mkpall">Whole thing</button><button id="mkp1">First half</button><button id="mkp2">Second half</button></div></div><div id="mkpaper"><canvas></canvas></div><div id="mkerr" hidden></div>';
  const chips = document.createElement('div'); chips.id = 'mkchips';
  const stage = document.createElement('div'); stage.id = 'mkpanels';

  async function current(live) { // -> result of the current panel (fresh build)
    const k = st.kind, d = panels[k], v = n => d.querySelector('[name=' + n + ']'); return KINDS[k].build(d, v, { live: !!live });
  }
  async function refresh() {
    const k = st.kind; if (KINDS[k].noPreview) { prev.hidden = true; $('mkmeta').textContent = ''; setBar(null); return; }
    prev.hidden = false; const tok = ++st.tok;
    try {
      const s = await current(true); if (tok !== st.tok) return;
      st.res = s; $('mkerr').hidden = true; $('mkpaper').hidden = false;
      syncPart(s); paintPreview(); setBar(s);
    } catch (e) { if (tok !== st.tok) return; st.res = null; $('mkpaper').hidden = true; $('mkerr').hidden = false; $('mkerr').textContent = '⚠ ' + e.message; setBar(null); }
  }
  function setBar(s) {
    const k = st.kind; $('mknew').hidden = !RANDOM.includes(k); $('mkext').hidden = !(s && s.extra);
    const draw = !!KINDS[k].noPreview; $('mkprint').disabled = !draw && !s; $('mksave').disabled = !draw && !s; $('mkshare').disabled = !draw && !s;
    $('mkmeta').textContent = s ? `${s.h} dots long ≈ ${(s.h / 8 / 10).toFixed(1)} cm of paper${st.copies > 1 ? ' × ' + st.copies : ''}` : '';
    $('mklast').disabled = !Prt.last; $('mkrest').hidden = !Prt.rest; $('mkpart').hidden = !!KINDS[k].noPreview; if (KINDS[k].noPreview) { part.on = false; $('mkpartbox').hidden = true; }
    if (s && part.on) { const [r0, r1] = partRows(); $('mkmeta').textContent = `Part: ${((r1 - r0) / 80).toFixed(1)} cm of ${(s.h / 80).toFixed(1)} cm${st.copies > 1 ? ' × ' + st.copies : ''}`; }
  }
  const later = () => { clearTimeout(st.timer); st.timer = setTimeout(refresh, 260); };


  // ---- print only part of it: sliders in mm, snapped to blank rows so cuts fall between items ----
  const part = { on: false, h: -1 };
  const blankFlags = s => s.blank || (s.blank = (() => { const n = s.bits.length / W, f = new Uint8Array(n); for (let y = 0; y < n; y++) { let ink = 0; for (let x = 0; x < W; x++) if (s.bits[y * W + x]) { ink = 1; break; } f[y] = ink ? 0 : 1; } return f; })());
  const snapRow = (s, r) => { const n = s.bits.length / W; if (r <= 0) return 0; if (r >= n) return n; const f = blankFlags(s); for (let d = 0; d <= 90; d++) { if (r - d > 0 && f[r - d]) return r - d; if (r + d < n && f[r + d]) return r + d; } return r; };
  function partRows() { const s = st.res, n = s.bits.length / W, a = +$('mkpa').value, b = +$('mkpb').value; let r0 = snapRow(s, a * 8), r1 = b >= Math.floor(n / 8) ? n : snapRow(s, b * 8); if (r1 - r0 < 8) r1 = Math.min(n, r0 + 16); return [r0, r1]; }
  function syncPart(s) { const mm = Math.floor(s.bits.length / W / 8); if (part.h !== s.bits.length) { part.h = s.bits.length; for (const id of ['mkpa', 'mkpb']) $(id).max = mm; $('mkpa').value = 0; $('mkpb').value = mm; } }
  function paintPreview() {
    const s = st.res; if (!s) return; const c = prev.querySelector('canvas'), b = Prt.bitsCanvas(s.bits); c.width = b.width; c.height = b.height; const x = c.getContext('2d'); x.drawImage(b, 0, 0);
    if (part.on) { const [r0, r1] = partRows(), n = c.height; x.fillStyle = 'rgba(25,28,34,.78)'; x.fillRect(0, 0, c.width, r0); x.fillRect(0, r1, c.width, n - r1); x.fillStyle = '#e8392b'; if (r0 > 0) x.fillRect(0, r0 - 1, c.width, 3); if (r1 < n) x.fillRect(0, r1 - 1, c.width, 3); $('mkpartinfo').textContent = `Prints ${(r0 / 80).toFixed(1)} cm to ${(r1 / 80).toFixed(1)} cm: ${((r1 - r0) / 80).toFixed(1)} cm of ${(n / 80).toFixed(1)} cm. Cuts snap to blank gaps. The dim parts will not print.`; }
    setBar(s);
  }
  const partBits = bits => { if (!part.on || !st.res) return bits; const [r0, r1] = partRows(); return bits.slice(r0 * W, r1 * W); };

  async function bitsFor(withCopies) {
    const s0 = KINDS[st.kind].noPreview ? await current() : st.res; if (!s0) throw new Error('Nothing to print yet.');
    const s = part.on && !KINDS[st.kind].noPreview ? (() => { const b = partBits(s0.bits); return { bits: b, h: b.length / W }; })() : s0;
    if (!withCopies || st.copies < 2) return s.bits;
    const parts = []; for (let i = 0; i < st.copies; i++) { if (i) parts.push(gapRow()); parts.push(s); } return Prt.stack(parts).bits;
  }
  const canvasOf = async () => { const s = KINDS[st.kind].noPreview ? await current() : st.res; return Prt.bitsCanvas(s.bits); };

  function build() {
    root.innerHTML = '';
    root.append(chips, prev, stage, bar);
    for (const [k, p] of Object.entries(KINDS)) {
      const sp = p.title.indexOf(' '), b = document.createElement('button'); b.dataset.kind = k; b.innerHTML = `<span>${p.title.slice(0, sp)}</span><small>${p.title.slice(sp + 1)}</small>`; b.onclick = () => show(k); chips.appendChild(b);
      const d = document.createElement('div'); d.className = 'mkcard'; d.dataset.kind = k; d.hidden = true; d.innerHTML = p.html(); stage.appendChild(d); panels[k] = d;
      restore(k, d);
      d.querySelectorAll('input[type=range]').forEach(r => { const o = r.nextElementSibling; if (o && o.tagName === 'OUTPUT') { const f = () => o.textContent = r.value; r.addEventListener('input', f); f(); } });
      d.addEventListener('input', () => { persist(k, d); if (!p.noPreview) later(); }); d.addEventListener('change', () => { persist(k, d); if (!p.noPreview) later(); });
      if (p.init) p.init(d);
    }
    $('mkminus').onclick = () => { st.copies = Math.max(1, st.copies - 1); $('mkn').textContent = st.copies; setBar(st.res); };
    $('mkplus').onclick = () => { st.copies = Math.min(8, st.copies + 1); $('mkn').textContent = st.copies; setBar(st.res); };
    $('mknew').onclick = refresh;
    $('mkpart').onclick = () => { part.on = !part.on; $('mkpartbox').hidden = !part.on; $('mkpart').classList.toggle('on', part.on); if (st.res) paintPreview(); };
    for (const id of ['mkpa', 'mkpb']) $(id).oninput = () => { if (+$('mkpb').value <= +$('mkpa').value + 3) { if (id === 'mkpa') $('mkpb').value = Math.min(+$('mkpb').max, +$('mkpa').value + 4); else $('mkpa').value = Math.max(0, +$('mkpb').value - 4); } paintPreview(); };
    $('mkpall').onclick = () => { $('mkpa').value = 0; $('mkpb').value = $('mkpb').max; paintPreview(); };
    $('mkp1').onclick = () => { $('mkpa').value = 0; $('mkpb').value = Math.round($('mkpb').max / 2); paintPreview(); };
    $('mkp2').onclick = () => { $('mkpa').value = Math.round($('mkpb').max / 2); $('mkpb').value = $('mkpb').max; paintPreview(); };
    $('mkrest').onclick = async () => { try { await Prt.printRest(); } catch (e) { toast(e.message, 'bad'); } setBar(st.res); }; window.addEventListener('printrest', () => setBar(st.res));
    $('mkprint').onclick = async () => { try { $('mkprint').disabled = true; const bits = await bitsFor(true); await Prt.printBits(bits, st.kind); } catch (e) { toast(e.message, 'bad'); } finally { $('mkprint').disabled = false; setBar(st.res); } };
    $('mkext').onclick = async () => { if (st.res && st.res.extra) await Prt.printBits(st.res.extra.bits, st.kind + '-answer'); };
    $('mksave').onclick = async () => { try { const c = await canvasOf(); const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `catcam-${st.kind}-${Date.now()}.png`; a.click(); toast('Saved PNG'); } catch (e) { toast(e.message, 'bad'); } };
    $('mkshare').onclick = async () => {
      try { const c = await canvasOf(), blob = await new Promise(r => c.toBlob(r, 'image/png')), f = new File([blob], `catcam-${st.kind}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'GB CatCam' }); else { $('mksave').click(); } } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); } };
    $('mklast').onclick = async () => { if (Prt.last) await Prt.printBits(Prt.last.bits, Prt.last.label); };
    let first = 'strip'; try { first = localStorage.getItem('catcam-mk') || 'strip'; } catch (e) { } if (!KINDS[first]) first = 'strip'; select(first);
  }
  function select(k) {
    const prevK = st.kind; if (prevK !== k && KINDS[prevK] && KINDS[prevK].onHide) KINDS[prevK].onHide(panels[prevK]);
    st.kind = k; st.res = null; for (const [n, d] of Object.entries(panels)) d.hidden = n !== k;
    chips.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.kind === k); b.setAttribute('aria-pressed', b.dataset.kind === k); });
    try { localStorage.setItem('catcam-mk', k); } catch (e) { }
    if (k === 'draw' && pad.redraw) pad.redraw();
    if (KINDS[k].onShow) KINDS[k].onShow(panels[k]);
    const on = chips.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function show(k) { select(k); refresh(); }
  function open() { if (KINDS[st.kind] && KINDS[st.kind].onShow) KINDS[st.kind].onShow(panels[st.kind]); refresh(); }

  build();
  return { scan, stripFooter, qrCanvas, code128, barcodeBlock, sticker, maze, sudoku, sudokuSolve, wordsearch, show, open, refresh, KINDS, panels, pad, padComposite };
})();
