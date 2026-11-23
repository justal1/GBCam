'use strict';
// ANSI draw: a touch-friendly editor for 80-column BBS art. Draw with any CP437 character, 16 colours, half-block "pixels",
// lines, boxes, fill and typed text; undo/redo; open and save real .ANS files (with a SAUCE record); print through the normal ANSI path.
const AnsiDraw = (() => {
  const KEY = 'catcam-ansidraw';
  const FAV = [219, 223, 220, 221, 222, 176, 177, 178, 254, 205, 186, 201, 187, 200, 188, 196, 179, 218, 191, 192, 217, 206, 203, 202, 204, 185, 197, 194, 193, 195, 180, 4, 3, 5, 6, 15, 2, 1, 249, 250, 42, 43, 111, 79, 183, 175, 174, 30, 31, 16, 17, 127, 237, 236, 233, 232, 234, 235, 239, 240];
  const SAFE = c => ![0, 7, 8, 9, 10, 13, 26, 27].includes(c);
  const MAXROWS = 200;
  let doc = null, root = null, q = null, view = null, vx = null, buf = null, bx = null, onChange = null;
  const st = { tool: 'brush', ch: 219, fg: 7, bg: 0, zoom: 1.5, mirror: false, grid: false, useCh: true, useFg: true, useBg: true, size: 1, filled: false, move: false, hist: [], redo: [], cursor: null, snap: null, start: null, meta: { title: '', author: '', group: '' } };

  // ---------- document helpers ----------
  const idx = (c, r) => r * doc.cols + c;
  const inb = (c, r) => c >= 0 && r >= 0 && c < doc.cols && r < doc.rows;
  const attr = () => (st.fg & 15) | ((st.bg & 15) << 4);
  function snapshot() { st.hist.push({ cols: doc.cols, rows: doc.rows, ch: doc.ch.slice(), at: doc.at.slice() }); if (st.hist.length > 60) st.hist.shift(); st.redo = []; }
  function restoreSnap(s) { doc.cols = s.cols; doc.rows = s.rows; doc.ch = s.ch.slice(); doc.at = s.at.slice(); resize(); }
  function undo() { if (!st.hist.length) return; st.redo.push({ cols: doc.cols, rows: doc.rows, ch: doc.ch.slice(), at: doc.at.slice() }); restoreSnap(st.hist.pop()); changed(); }
  function redo() { if (!st.redo.length) return; st.hist.push({ cols: doc.cols, rows: doc.rows, ch: doc.ch.slice(), at: doc.at.slice() }); restoreSnap(st.redo.pop()); changed(); }
  function setCell(c, r, ch, fg, bg) { if (!inb(c, r)) return; const i = idx(c, r); if (ch != null) doc.ch[i] = ch; if (fg != null || bg != null) { const a = doc.at[i]; doc.at[i] = (fg != null ? fg & 15 : a & 15) | ((bg != null ? bg & 15 : a >> 4) << 4); } }
  const paintCell = (c, r) => setCell(c, r, st.useCh ? st.ch : null, st.useFg ? st.fg : null, st.useBg ? st.bg : null);
  function both(c, r, fn) { fn(c, r); if (st.mirror) fn(doc.cols - 1 - c, r); }
  function brushAt(c, r, fn) { const n = st.size, o = Math.floor((n - 1) / 2); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) both(c - o + i, r - o + j, fn); }

  // half-block pixels: two stacked pixels per cell using ▀ (top = ink, bottom = paper)
  function pixelAt(px, py) { // px: 0..cols-1, py: 0..rows*2-1
    const c = px, r = py >> 1, top = (py & 1) === 0; if (!inb(c, r)) return; const i = idx(c, r), ch = doc.ch[i], a = doc.at[i], f = a & 15, b = a >> 4; let T, Bt;
    if (ch === 223) { T = f; Bt = b; } else if (ch === 220) { T = b; Bt = f; } else if (ch === 219) { T = Bt = f; } else if (ch === 32 || ch === 0) { T = Bt = b; } else { T = Bt = b; }
    if (top) T = st.fg; else Bt = st.fg;
    if (T === Bt) { doc.ch[i] = 32; doc.at[i] = (7) | (T << 4); } else { doc.ch[i] = 223; doc.at[i] = (T) | (Bt << 4); }
  }
  function line(x0, y0, x1, y1, fn) { let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy; for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
  function fillFlood(c, r) {
    if (!inb(c, r)) return; const i0 = idx(c, r), tc = doc.ch[i0], ta = doc.at[i0], seen = new Uint8Array(doc.cols * doc.rows), stack = [[c, r]];
    const nc = st.useCh ? st.ch : tc, nf = st.useFg ? st.fg : (ta & 15), nb = st.useBg ? st.bg : (ta >> 4), na = nf | (nb << 4); if (nc === tc && na === ta) return;
    while (stack.length) { const [x, y] = stack.pop(); if (!inb(x, y)) continue; const i = idx(x, y); if (seen[i] || doc.ch[i] !== tc || doc.at[i] !== ta) continue; seen[i] = 1; doc.ch[i] = nc; doc.at[i] = na; stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  }

  // ---------- drawing the canvas ----------
  function resize() { buf.width = doc.cols * 8; buf.height = doc.rows * 16; view.width = buf.width; view.height = buf.height; applyZoom(); redrawAll(); }
  function applyZoom() { view.style.width = Math.round(buf.width * st.zoom) + 'px'; view.style.height = Math.round(buf.height * st.zoom) + 'px'; }
  function redrawAll() { for (let r = 0; r < doc.rows; r++) for (let k = 0; k < doc.cols; k++) Ansi.drawCell(bx, doc.ch[idx(k, r)], doc.at[idx(k, r)], k, r); blit(); }
  function blit() {
    vx.imageSmoothingEnabled = false; vx.drawImage(buf, 0, 0);
    if (st.grid) { vx.strokeStyle = 'rgba(255,255,255,.18)'; vx.lineWidth = 1; vx.beginPath(); for (let k = 0; k <= doc.cols; k++) { vx.moveTo(k * 8 + .5, 0); vx.lineTo(k * 8 + .5, view.height); } for (let r = 0; r <= doc.rows; r++) { vx.moveTo(0, r * 16 + .5); vx.lineTo(view.width, r * 16 + .5); } vx.stroke(); }
    if (st.mirror) { vx.strokeStyle = 'rgba(255,80,160,.7)'; vx.beginPath(); vx.moveTo(view.width / 2, 0); vx.lineTo(view.width / 2, view.height); vx.stroke(); }
    if (st.cursor && st.tool === 'text') { vx.strokeStyle = '#ff0'; vx.lineWidth = 2; vx.strokeRect(st.cursor.c * 8 + 1, st.cursor.r * 16 + 1, 6, 14); }
  }
  function drawCellNow(c, r) { Ansi.drawCell(bx, doc.ch[idx(c, r)], doc.at[idx(c, r)], c, r); }

  // ---------- pointer handling ----------
  const pos = ev => { const rc = view.getBoundingClientRect(); return { x: (ev.clientX - rc.left) / rc.width * doc.cols, y: (ev.clientY - rc.top) / rc.height * doc.rows }; };
  let down = false, last = null;
  function applyTool(p, first) {
    const c = Math.floor(p.x), r = Math.floor(p.y);
    switch (st.tool) {
      case 'brush': { const from = last || { c, r }; line(from.c, from.r, c, r, (x, y) => brushAt(x, y, paintCell)); break; }
      case 'erase': { const from = last || { c, r }; line(from.c, from.r, c, r, (x, y) => brushAt(x, y, (a, b) => setCell(a, b, 32, 7, 0))); break; }
      case 'pixel': { const px = Math.floor(p.x), py = Math.floor(p.y * 2), from = last || { c: px, r: py }; line(from.c, from.r, px, py, (x, y) => { pixelAt(x, y); if (st.mirror) pixelAt(doc.cols - 1 - x, y); }); last = { c: px, r: py }; return; }
      case 'fill': if (first) { fillFlood(c, r); } break;
      case 'pick': if (first && inb(c, r)) { const i = idx(c, r); st.ch = doc.ch[i]; st.fg = doc.at[i] & 15; st.bg = doc.at[i] >> 4; ui(); } break;
      case 'text': if (first && inb(c, r)) { st.cursor = { c, r }; q('txt').focus({ preventScroll: true }); } break;
      case 'line': case 'box': if (first) st.start = { c, r }; else shapePreview(c, r); break;
    }
    last = { c, r };
  }
  function shapePreview(c, r) {
    const s = st.snap; doc.ch.set(s.ch); doc.at.set(s.at); const a = st.start;
    if (st.tool === 'line') line(a.c, a.r, c, r, (x, y) => brushAt(x, y, paintCell));
    else { const x0 = Math.min(a.c, c), x1 = Math.max(a.c, c), y0 = Math.min(a.r, r), y1 = Math.max(a.r, r); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (st.filled || x === x0 || x === x1 || y === y0 || y === y1) both(x, y, paintCell); }
    redrawAll();
  }
  function onDown(ev) {
    if (st.move || !ev.isPrimary) return; ev.preventDefault(); view.setPointerCapture(ev.pointerId); down = true; last = null; snapshot(); st.snap = { ch: doc.ch.slice(), at: doc.at.slice() };
    const p = pos(ev); applyTool(p, true); if (st.tool !== 'line' && st.tool !== 'box' && st.tool !== 'text') redrawAll(); else if (st.tool === 'text') blit();
    if (st.tool === 'text') st.hist.pop(); // moving the text cursor is not an edit
  }
  function onMove(ev) { if (!down) return; ev.preventDefault(); const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; for (const e of (evs.length ? evs : [ev])) applyTool(pos(e), false); if (st.tool === 'brush' || st.tool === 'erase' || st.tool === 'pixel') redrawAll(); }
  function onUp() { if (!down) return; down = false; if (st.tool === 'fill' || st.tool === 'pick') redrawAll(); changed(); }

  // ---------- text tool ----------
  function typeChar(code) { if (!st.cursor) return; if (!st.hist.length || st.hist._typing !== true) { snapshot(); st.hist._typing = true; } const { c, r } = st.cursor; setCell(c, r, code, st.useFg ? st.fg : null, st.useBg ? st.bg : null); advance(1); }
  function advance(n) { let { c, r } = st.cursor; c += n; if (c >= doc.cols) { c = 0; r = Math.min(doc.rows - 1, r + 1); } if (c < 0) { c = doc.cols - 1; r = Math.max(0, r - 1); } st.cursor = { c, r }; redrawAll(); }
  function bindText() {
    const t = q('txt');
    t.addEventListener('input', () => { for (const chr of t.value) { const k = Ansi.CP437.indexOf(chr); typeChar(k < 0 || !SAFE(k) ? 63 : k); } t.value = ''; changed(true); });
    t.addEventListener('keydown', e => {
      if (!st.cursor) return;
      if (e.key === 'Backspace') { e.preventDefault(); advance(-1); setCell(st.cursor.c, st.cursor.r, 32, null, null); redrawAll(); changed(true); }
      else if (e.key === 'Enter') { e.preventDefault(); st.cursor = { c: 0, r: Math.min(doc.rows - 1, st.cursor.r + 1) }; redrawAll(); st.hist._typing = false; }
      else if (e.key.startsWith('Arrow')) { e.preventDefault(); const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; st.cursor = { c: Math.max(0, Math.min(doc.cols - 1, st.cursor.c + d[0])), r: Math.max(0, Math.min(doc.rows - 1, st.cursor.r + d[1])) }; redrawAll(); st.hist._typing = false; }
    });
  }

  // ---------- save / open ----------
  function toAns(d, meta) {
    const out = [], M = Ansi.ANSI2VGA; const push = (...b) => out.push(...b); const esc = s => { for (const ch of s) push(ch.charCodeAt(0)); };
    let cur = -1, ice = false; esc('\x1b[0m');
    for (let r = 0; r < d.rows; r++) {
      let last = -1; for (let k = d.cols - 1; k >= 0; k--) { const i = r * d.cols + k; if (d.ch[i] !== 32 || (d.at[i] >> 4) !== 0) { last = k; break; } }
      for (let k = 0; k <= last; k++) {
        const i = r * d.cols + k, a = d.at[i]; let c = d.ch[i]; if (!SAFE(c)) c = 32;
        if (a !== cur) { const fg = a & 15, bg = a >> 4; if (bg >= 8) ice = true; esc(`\x1b[0;${fg >= 8 ? '1;' : ''}${bg >= 8 ? '5;' : ''}${30 + M[fg & 7]};${40 + M[bg & 7]}m`); cur = a; }
        push(c);
      }
      if (last < d.cols - 1 && r < d.rows - 1) { push(13, 10); } // full-width rows rely on the wrap
    }
    esc('\x1b[0m'); push(0x1A);
    const size = out.length, sauce = new Uint8Array(128), str = (s, o, n) => { for (let i = 0; i < n; i++) sauce[o + i] = i < s.length ? s.charCodeAt(i) & 255 : 32; };
    str('SAUCE', 0, 5); sauce[5] = 48; sauce[6] = 48; str(meta.title || '', 7, 35); str(meta.author || '', 42, 20); str(meta.group || '', 62, 20);
    const dt = new Date(), pad = (n, l) => String(n).padStart(l, '0'); str(pad(dt.getFullYear(), 4) + pad(dt.getMonth() + 1, 2) + pad(dt.getDate(), 2), 82, 8);
    const dv = new DataView(sauce.buffer); dv.setUint32(90, size - 1, true); sauce[94] = 1; sauce[95] = 1; dv.setUint16(96, d.cols, true); dv.setUint16(98, d.rows, true); sauce[105] = ice ? 1 : 0; for (let i = 0; i < 22; i++) sauce[106 + i] = i < 7 ? 'IBM VGA'.charCodeAt(i) : 0;
    const res = new Uint8Array(size + 128); res.set(out); res.set(sauce, size); return res;
  }
  function download(bytes, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const safeName = () => ((st.meta.title || 'catcam-art').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 30) || 'catcam-art') + '.ans';

  // ---------- persistence ----------
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  function persist() { try { localStorage.setItem(KEY, JSON.stringify({ cols: doc.cols, rows: doc.rows, ch: b64(doc.ch), at: b64(doc.at), meta: st.meta, ui: { ch: st.ch, fg: st.fg, bg: st.bg, zoom: st.zoom } })); } catch (e) { } }
  function restore() { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!j) return false; doc = Ansi.blank(j.cols, j.rows); doc.ch = unb64(j.ch); doc.at = unb64(j.at); st.meta = Object.assign(st.meta, j.meta || {}); if (j.ui) Object.assign(st, j.ui); return doc.ch.length === doc.cols * doc.rows; } catch (e) { return false; } }
  function changed(typing) { if (!typing) st.hist._typing = false; persist(); if (onChange) onChange(); }

  // ---------- UI ----------
  const TOOLS = [['brush', '✏️', 'Brush'], ['pixel', '🔲', 'Pixels'], ['erase', '🧽', 'Erase'], ['text', '🔤', 'Type'], ['line', '📏', 'Line'], ['box', '▭', 'Box'], ['fill', '🪣', 'Fill'], ['pick', '💧', 'Pick']];
  function html() {
    return `<div class="adtools">${TOOLS.map(([k, i, n]) => `<button type="button" data-tool="${k}"><span>${i}</span><small>${n}</small></button>`).join('')}</div>
    <div class="adopts"><label class="chk"><input type="checkbox" name="mirror"> Mirror</label><label class="chk"><input type="checkbox" name="grid"> Grid</label><label class="chk"><input type="checkbox" name="filled"> Filled box</label>
      <label class="chk"><input type="checkbox" name="useCh" checked> Character</label><label class="chk"><input type="checkbox" name="useFg" checked> Ink</label><label class="chk"><input type="checkbox" name="useBg" checked> Paper</label></div>
    <div class="sub">Ink (foreground)</div><div class="adsw" name="fgs"></div><div class="sub">Paper (background)</div><div class="adsw" name="bgs"></div>
    <div class="row" style="align-items:center"><canvas name="cur" width="32" height="16" style="flex:0 0 64px;width:64px;height:32px;image-rendering:pixelated;border:2px solid #555;border-radius:4px"></canvas><select name="size" style="flex:0 0 96px"><option value="1">Brush 1</option><option value="2">Brush 2</option><option value="3">Brush 3</option></select><button type="button" name="more">Characters…</button></div>
    <div class="adchars" name="favs"></div><canvas name="allch" hidden width="256" height="512" style="width:100%;max-width:352px;image-rendering:pixelated;margin:6px auto;display:none;border:1px solid #444;border-radius:6px"></canvas>
    <div class="advp" name="vp"><canvas name="cv"></canvas></div><input name="txt" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px">
    <div class="row"><button type="button" name="mode">✍️ Drawing</button><button type="button" name="zout">−</button><button type="button" name="zin">＋</button><button type="button" name="undo">↶</button><button type="button" name="redo">↷</button></div>
    <div class="row"><button type="button" name="new">New…</button><button type="button" name="open">📂 Open .ANS</button><button type="button" name="save" class="pri">💾 Save .ANS</button><input name="file" type="file" hidden></div>
    <div class="row"><input name="title" type="text" placeholder="Title" maxlength="35"><input name="author" type="text" placeholder="Artist" maxlength="20"></div>
    <div class="sub">Print as</div><div class="row"><select name="dir"><option value="side">Sideways, real size</option><option value="up">Upright, shrunk</option></select><select name="look"><option value="screen">Screen look</option><option value="paper">Light paper</option></select></div>
    <div class="sub">Draw in Draw mode; switch to Move to scroll around the canvas. “Pixels” paints two pixels per character with half blocks. Your work is kept on this phone and saved as a normal .ANS file you can open in other ANSI editors.</div>`;
  }
  function ui() { // refresh the toolbar state
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('pri', b.dataset.tool === st.tool));
    root.querySelectorAll('[name=fgs] i').forEach((e, i) => e.classList.toggle('on', i === st.fg)); root.querySelectorAll('[name=bgs] i').forEach((e, i) => e.classList.toggle('on', i === st.bg));
    const cx = q('cur').getContext('2d'); Ansi.drawCell(cx, st.ch, attr(), 0, 0); Ansi.drawCell(cx, st.ch, attr(), 1, 0);
    q('mode').textContent = st.move ? '✋ Move' : '✍️ Draw'; q('mode').className = st.move ? '' : 'pri'; view.style.touchAction = st.move ? 'auto' : 'none';
    q('favs').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.c === st.ch));
  }
  function newDoc(cols, rows) { doc = Ansi.blank(cols, rows); doc.sauce = null; st.hist = []; st.redo = []; st.cursor = null; resize(); changed(); }

  async function mount(el, opts) {
    onChange = opts && opts.onChange; root = el; el.innerHTML = html(); q = n => el.querySelector('[name=' + n + ']'); view = q('cv'); vx = view.getContext('2d'); buf = document.createElement('canvas'); bx = buf.getContext('2d', { willReadFrequently: true });
    await Ansi.ready(); if (!restore()) doc = Ansi.blank(80, 25); resize();
    for (const [name, key] of [['fgs', 'fg'], ['bgs', 'bg']]) { const box = q(name); for (let i = 0; i < 16; i++) { const e = document.createElement('i'); e.style.background = Ansi.VGA[i]; e.onclick = () => { st[key] = i; ui(); }; box.appendChild(e); } }
    const favs = q('favs'); for (const c of FAV) { const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; const cv = document.createElement('canvas'); cv.width = 8; cv.height = 16; cv.style.cssText = 'width:16px;height:32px;image-rendering:pixelated'; Ansi.drawCell(cv.getContext('2d'), c, 0x0F, 0, 0); b.appendChild(cv); b.onclick = () => { st.ch = c; if (st.tool === 'erase' || st.tool === 'pick') st.tool = 'brush'; ui(); }; favs.appendChild(b); }
    // full character table
    const all = q('allch'), ax = all.getContext('2d'); for (let c = 0; c < 256; c++) Ansi.drawCell(ax, SAFE(c) ? c : 32, SAFE(c) ? 0x0F : 0x08, c % 16, c >> 4); all.style.display = 'none';
    all.onclick = e => { const rc = all.getBoundingClientRect(), c = Math.floor((e.clientX - rc.left) / rc.width * 16) + 16 * Math.floor((e.clientY - rc.top) / rc.height * 16); if (SAFE(c)) { st.ch = c; ui(); } };
    q('more').onclick = () => { const on = all.style.display === 'none'; all.hidden = !on; all.style.display = on ? 'block' : 'none'; };
    root.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { st.tool = b.dataset.tool; if (st.tool === 'text') { st.move = false; } ui(); });
    for (const k of ['mirror', 'grid', 'filled', 'useCh', 'useFg', 'useBg']) q(k).onchange = e => { st[k] = e.target.checked; blit(); };
    q('size').onchange = e => { st.size = +e.target.value; };
    q('mode').onclick = () => { st.move = !st.move; ui(); };
    q('zin').onclick = () => { st.zoom = Math.min(3, st.zoom + 0.5); applyZoom(); persist(); }; q('zout').onclick = () => { st.zoom = Math.max(0.5, st.zoom - 0.5); applyZoom(); persist(); };
    q('undo').onclick = undo; q('redo').onclick = redo;
    q('new').onclick = () => { const cols = prompt('Width in characters (40, 80 or 132)?', String(doc.cols)); if (cols === null) return; const rows = prompt('Height in rows (1 to ' + MAXROWS + ')?', String(doc.rows)); if (rows === null) return; if (!confirm('Start a blank canvas? The current drawing will be replaced (use Save .ANS first if you want to keep it).')) return; newDoc(Math.max(10, Math.min(255, +cols || 80)), Math.max(1, Math.min(MAXROWS, +rows || 25))); };
    q('open').onclick = () => q('file').click();
    q('file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const d = Ansi.parse(new Uint8Array(await f.arrayBuffer())); snapshot(); doc = d; if (d.sauce) { st.meta.title = d.sauce.title || ''; st.meta.author = d.sauce.author || ''; syncMeta(); } resize(); changed(); toast('Opened ' + f.name); } catch (err) { toast('Could not read that file', 'bad'); } };
    q('save').onclick = () => { download(toAns(doc, st.meta), safeName()); toast('Saved ' + safeName()); };
    for (const k of ['title', 'author']) q(k).oninput = e => { st.meta[k] = e.target.value; persist(); };
    syncMeta(); view.addEventListener('pointerdown', onDown); view.addEventListener('pointermove', onMove); view.addEventListener('pointerup', onUp); view.addEventListener('pointercancel', onUp);
    bindText(); ui();
  }
  function syncMeta() { q('title').value = st.meta.title || ''; q('author').value = st.meta.author || ''; }
  async function toBits() { await Ansi.ready(); const d = Object.assign({}, doc, { sauce: { title: st.meta.title, author: st.meta.author, group: st.meta.group } }); return Ansi.toBits(d, { dir: q('dir').value, look: q('look').value }); }
  function load(d) { snapshot(); doc = d; resize(); changed(); }
  return { mount, toBits, load, toAns, get doc() { return doc; }, st, undo, redo, newDoc };
})();
