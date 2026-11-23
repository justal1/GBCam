'use strict';
// ZX tab: the emulator screen, an on-screen Spectrum keyboard, a tape library (with the UK flag program), and printing to the cat printer.
const ZX = (() => {
  const $$ = id => document.getElementById(id), LIB = 'catcam-zxlib';
  let spec = null, ready = null, running = true, turbo = 1, acc = 0, lastT = 0, started = false, ac = null, node = null, queue = [], muted = true;
  const BW = 32, SW = 256 + 2 * BW, SH = 192 + 2 * BW;
  let scr, sx, img, lib = [], listings = {}, autoRun = false, lineBuf = [], lineTimer = 0, lastPage = null;

  // ---------- keyboard ----------
  // [main label, keyword (green), symbol-shift legend (red), matrix key]
  const ROWS = [
    [['1', 'EDIT', '!', '1'], ['2', 'CAPS', '@', '2'], ['3', '', '#', '3'], ['4', '', '$', '4'], ['5', '←', '%', '5'], ['6', '↓', '&', '6'], ['7', '↑', "'", '7'], ['8', '→', '(', '8'], ['9', '', ')', '9'], ['0', 'DEL', '_', '0']],
    [['Q', 'PLOT', '<=', 'Q'], ['W', 'DRAW', '<>', 'W'], ['E', 'REM', '>=', 'E'], ['R', 'RUN', '<', 'R'], ['T', 'RAND', '>', 'T'], ['Y', 'RETURN', 'AND', 'Y'], ['U', 'IF', 'OR', 'U'], ['I', 'INPUT', 'AT', 'I'], ['O', 'POKE', ';', 'O'], ['P', 'PRINT', '"', 'P']],
    [['A', 'NEW', 'STOP', 'A'], ['S', 'SAVE', 'NOT', 'S'], ['D', 'DIM', 'STEP', 'D'], ['F', 'FOR', 'TO', 'F'], ['G', 'GOTO', 'THEN', 'G'], ['H', 'GOSUB', '↑', 'H'], ['J', 'LOAD', '-', 'J'], ['K', 'LIST', '+', 'K'], ['L', 'LET', '=', 'L'], ['⏎', 'ENTER', '', 'ENTER']],
    [['⇧', 'CAPS', '', 'CAPS'], ['Z', 'COPY', ':', 'Z'], ['X', 'CLEAR', '£', 'X'], ['C', 'CONT', '?', 'C'], ['V', 'CLS', '/', 'V'], ['B', 'BORDER', '*', 'B'], ['N', 'NEXT', ',', 'N'], ['M', 'PAUSE', '.', 'M'], ['sym', '', '', 'SYM'], ['␣', 'BREAK', '', 'SPACE']],
  ];
  const latched = { CAPS: false, SYM: false };
  // key presses are counted in emulated frames (not milliseconds) so they behave the same at any speed
  const kq = [];
  function press(keys, hold = 6, gap = 5) { return new Promise(res => { kq.push({ keys, hold, gap, res, phase: 0 }); }); }
  function stepKeys() {
    const q = kq[0]; if (!q) return;
    if (q.phase === 0) { for (const k of q.keys) { const [r, b] = Spectrum.MATRIX[k]; spec.setKey(r, b, true); } q.phase = 1; q.left = q.hold; return; }
    if (q.phase === 1) { if (--q.left <= 0) { for (const k of q.keys) { const [r, b] = Spectrum.MATRIX[k]; spec.setKey(r, b, false); } q.phase = 2; q.left = q.gap; } return; }
    if (--q.left <= 0) { kq.shift(); q.res(); }
  }
  async function tap(key) { const ks = [key]; for (const s of ['CAPS', 'SYM']) if (latched[s] && key !== s) ks.push(s); if (key === 'CAPS' || key === 'SYM') { latched[key] = !latched[key]; paintShifts(); return; } await press(ks); if (latched.CAPS || latched.SYM) { latched.CAPS = latched.SYM = false; paintShifts(); } }
  const paintShifts = () => { document.querySelectorAll('#zxkeys [data-k=CAPS]').forEach(b => b.classList.toggle('on', latched.CAPS)); document.querySelectorAll('#zxkeys [data-k=SYM]').forEach(b => b.classList.toggle('on', latched.SYM)); };
  function buildKeys() {
    const box = $$('zxkeys'); box.innerHTML = '';
    for (const row of ROWS) { const r = document.createElement('div'); r.className = 'zxrow'; for (const [m, kw, sy, key] of row) { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = key; b.innerHTML = `<i class="kw">${kw}</i><b>${m}</b><i class="sy">${sy}</i>`; b.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); tap(key); }); r.appendChild(b); } box.appendChild(r); }
  }
  async function typeKeys(seq) { for (const step of seq) { await press(Array.isArray(step) ? step : [step], 8, 6); } }
  const LOAD_SEQ = [['J'], ['SYM', 'P'], ['SYM', 'P'], ['ENTER']], RUN_SEQ = [['R'], ['ENTER']];
  const MAP = { Enter: 'ENTER', ' ': 'SPACE', Shift: 'CAPS', Control: 'SYM', Backspace: ['CAPS', '0'] };
  function onKey(e, down) {
    if (typeof tab === 'undefined' || tab !== 'zx' || !spec) return; const t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    let k = MAP[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : null); if (!k) return; const keys = Array.isArray(k) ? k : [k];
    if (!keys.every(x => Spectrum.MATRIX[x])) return; e.preventDefault(); for (const x of keys) { const [r, b] = Spectrum.MATRIX[x]; spec.setKey(r, b, down); }
  }

  // ---------- sound ----------
  function ensureAudio() {
    if (ac || muted) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); node = ac.createScriptProcessor(2048, 0, 1); let cur = null, pos = 0; node.onaudioprocess = e => { const o = e.outputBuffer.getChannelData(0); for (let i = 0; i < o.length; i++) { if (!cur || pos >= cur.length) { cur = queue.shift(); pos = 0; } o[i] = cur ? cur[pos++] : 0; } }; node.connect(ac.destination); } catch (e) { ac = null; }
  }
  const pushAudio = () => { if (!ac || muted) return; queue.push(spec.audio(Math.round(ac.sampleRate / 50))); if (queue.length > 12) queue.splice(0, queue.length - 6); };

  // ---------- printing ----------
  function pageBitsForPrinter(page, scale) {
    const W = 384, w = page.w, h = page.h, oh = Math.round(h * scale) + 30, bits = new Uint8Array(W * oh), ow = Math.round(w * scale), ox = (W - ow) >> 1;
    for (let y = 0; y < oh - 30; y++) { const sy = Math.min(h - 1, Math.floor(y / scale)); for (let x = 0; x < ow; x++) { const sx2 = Math.min(w - 1, Math.floor(x / scale)); if (page.bits[sy * w + sx2]) bits[(y + 4) * W + ox + x] = 1; } }
    return bits;
  }
  function showPage(page) {
    lastPage = page; const c = $$('zxpage'); c.width = page.w; c.height = page.h; const x = c.getContext('2d'), im = x.createImageData(page.w, page.h); for (let i = 0; i < page.w * page.h; i++) { const v = page.bits[i] ? 25 : 235; im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = page.bits[i] ? 30 : 228; im.data[i * 4 + 3] = 255; } x.putImageData(im, 0, 0); $$('zxprint').hidden = false;
  }
  const sendPage = async page => { if (!page) return; const bits = pageBitsForPrinter(page, +$$('zxsize').value); await Prt.printBits(bits, 'ZX print'); };
  function onPrint(page, kind) {
    if (kind === 'copy') { showPage(page); if ($$('zxauto').checked) sendPage(page); return; }
    lineBuf.push(page); clearTimeout(lineTimer); lineTimer = setTimeout(() => { // LPRINT / LLIST: gather the lines into one page
      const h = lineBuf.reduce((n, p) => n + p.h, 0), bits = new Uint8Array(256 * h); let o = 0; for (const p of lineBuf) { bits.set(p.bits, o); o += p.bits.length; } lineBuf = [];
      let last = h - 1; while (last > 0 && !bits.subarray(last * 256, last * 256 + 256).some(v => v)) last--; const page2 = { bits: bits.slice(0, (last + 1) * 256), w: 256, h: last + 1 }; showPage(page2); if ($$('zxauto').checked) sendPage(page2);
    }, 1200);
  }

  // ---------- tape library ----------
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  function loadLib() { try { lib = JSON.parse(localStorage.getItem(LIB) || '[]'); } catch (e) { lib = []; } }
  function saveLib() { try { localStorage.setItem(LIB, JSON.stringify(lib)); } catch (e) { toast('Could not save (storage full?)', 'bad'); } }
  // programs that ship with the app (the flag, plus Spectrum versions of the drawing programs in the ZX Printer booklet)
  const BUILTIN = [
    { id: 'flag', icon: '🇬🇧', name: 'UK flag (Union Jack), typed-in BASIC', file: 'flag.bas', tap: 'flag' },
    { id: 'big', icon: '🔠', name: 'Big letters (ZX Printer booklet no. 2, for the Spectrum)', file: 'programs/bigletters.bas', tap: 'bigletters' },
    { id: 'circles', icon: '⭕', name: 'Circles (booklet no. 3)', file: 'programs/circles.bas', tap: 'circles' },
    { id: 'spiro', icon: '🌀', name: 'Spirograph (booklet no. 3a)', file: 'programs/spiro.bas', tap: 'spiro' },
    { id: 'sketch', icon: '✏️', name: 'Sketchpad (booklet no. 5): keys 1 0 2 3 and 5 6 7 8', file: 'programs/sketchpad.bas', tap: 'sketchpad' },
    { id: 'flower', icon: '🌸', name: 'Flower (booklet no. 6)', file: 'programs/flower.bas', tap: 'flower' },
    { id: 'sine', icon: '📈', name: 'Sine and cosine graph (booklet no. 7)', file: 'programs/sinecos.bas', tap: 'sinecos' },
  ];
  const blocksOf = e => ZXBasic.fromTap(unb64(e.tap));
  function addLib(name, blocks) { const e = { id: Date.now() + Math.random().toString(36).slice(2, 6), name, tap: b64(ZXBasic.toTap(blocks)) }; lib.unshift(e); saveLib(); renderLib(); return e; }
  function insert(blocks, label, andRun) { spec.insert(blocks.map(b => b.slice())); autoRun = !!andRun; toast('Tape inserted: ' + label); renderTape(); }
  function renderTape() { const t = $$('zxtape'); t.textContent = spec.tape.blocks.length ? 'On the tape: ' + spec.tape.blocks.map(ZXBasic.describe).join('  →  ') + `  (position ${Math.min(spec.tape.pos, spec.tape.blocks.length)}/${spec.tape.blocks.length})` : 'No tape inserted.'; }
  function renderLib() {
    const box = $$('zxlib'); box.innerHTML = '';
    const items = BUILTIN.map(b => Object.assign({ builtin: true }, b)).concat(lib);
    for (const e of items) {
      const d = document.createElement('div'); d.className = 'zxitem'; d.innerHTML = `<span>${e.builtin ? e.icon + ' ' : '💾 '}${e.name}</span>`;
      const mk = (txt, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; if (cls) b.className = cls; b.onclick = fn; d.appendChild(b); };
      const blocks = () => e.builtin ? ZXBasic.programTape(e.tap, listings[e.id] || '10 REM missing', -1) : blocksOf(e);
      mk('▶ Load & run', async () => { insert(blocks(), e.name, true); await typeKeys(LOAD_SEQ); }, 'pri'); mk('Insert', () => insert(blocks(), e.name, false));
      mk('📄 Listing', () => { const b = blocks(), data = b.find(x => x[0] === 0xFF); showListing(e.name, data ? ZXBasic.list(data.slice(1, data.length - 1)) : '(no program in this tape)'); });
      mk('⬇ .TAP', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ZXBasic.toTap(blocks())])); a.download = (e.name.replace(/[^\w\- ]+/g, '').trim().slice(0, 30) || 'program') + '.tap'; a.click(); });
      if (!e.builtin) mk('🗑', () => { if (confirm('Delete "' + e.name + '"?')) { lib = lib.filter(x => x.id !== e.id); saveLib(); renderLib(); } });
      box.appendChild(d);
    }
  }
  function showListing(name, text) { let d = $$('kiddlg'); if (d) d.remove(); d = document.createElement('div'); d.id = 'kiddlg'; d.innerHTML = `<div class="kidcard"><h3>${name}</h3><pre style="white-space:pre-wrap;font:12px/1.35 ui-monospace,monospace;max-height:55vh;overflow:auto;background:#111;padding:8px;border-radius:8px">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre><div class="row"><button type="button" id="zxcopylist">Copy</button><button type="button" id="zxclose" class="pri">Close</button></div></div>`; document.body.appendChild(d); d.onclick = e => { if (e.target === d) d.remove(); }; $$('zxclose').onclick = () => d.remove(); $$('zxcopylist').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { } }; }


  // ---------- opening files: tapes, snapshots, ROMs, and ZIPs of those ----------
  const ROMKEY = 'catcam-zxrom'; let origRom = null, romName = 'Sinclair 48K (original)';
  const kindOf = (name, size) => { const x = ZXFiles.ext(name); if (x === 'tap' || x === 'tzx') return 'tape'; if (x === 'z80' || x === 'sna') return 'snap'; if ((x === 'rom' || x === 'bin') && size % 16384 === 0 && size <= 65536) return 'rom'; return null; };
  function describeRom() { const h = spec.hook; $$('zxromname').textContent = `ROM: ${romName}` + (h.load && h.copy ? '' : ` — this ROM has no standard ${!h.load ? 'tape' : ''}${!h.load && !h.copy ? ' or ' : ''}${!h.copy ? 'printer' : ''} routines, so ${!h.load ? 'quick tape loading' : ''}${!h.load && !h.copy ? ' and ' : ''}${!h.copy ? 'COPY printing' : ''} will not work`); }
  function useRom(bytes, name, save = true) {
    let rom = bytes, note = ''; if (bytes.length > 16384) { rom = bytes.slice(bytes.length - 16384); note = ' (it holds several ROMs, so I used the last 16K, the 48K BASIC)'; }
    if (rom.length !== 16384) throw new Error('A Spectrum ROM must be 16K (16384 bytes); this one is ' + bytes.length);
    spec.setRom(rom); spec.reset(); for (let i = 0; i < 100; i++) spec.runFrame(); romName = name;
    if (save) { try { localStorage.setItem(ROMKEY, JSON.stringify({ name, b64: b64(rom) })); } catch (e) { } }
    describeRom(); toast('Using ROM: ' + name + note); renderTape();
  }
  function useOriginalRom() { try { localStorage.removeItem(ROMKEY); } catch (e) { } useRom(origRom, 'Sinclair 48K (original)', false); }
  async function useData(name, data) {
    const x = ZXFiles.ext(name);
    if (x === 'tap' || x === 'tzx') { const blocks = x === 'tap' ? ZXBasic.fromTap(data) : ZXFiles.tzxBlocks(data); if (!blocks.length) throw new Error('that tape is empty'); const base = name.replace(/^.*\//, '').replace(/\.\w+$/, ''); addLib(base, blocks); insert(blocks, base, false); return; }
    if (x === 'sna' || x === 'z80') { spec.reset(); (x === 'sna' ? ZXFiles.loadSna : ZXFiles.loadZ80)(spec, data); toast('Snapshot loaded: ' + name.replace(/^.*\//, '')); return; }
    if (x === 'rom' || x === 'bin') { useRom(data, name.replace(/^.*\//, '')); return; }
    throw new Error('I do not know what to do with a .' + x + ' file (try .tap .tzx .z80 .sna .rom or a .zip of those)');
  }
  async function openFile(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()), x = ZXFiles.ext(file.name);
      if (x !== 'zip') { await useData(file.name, bytes); return; }
      const items = ZXFiles.zipList(bytes).map(e => ({ e, kind: kindOf(e.name, e.size) })).filter(i => i.kind);
      if (!items.length) throw new Error('Nothing the Spectrum can use in that ZIP (I look for .tap .tzx .z80 .sna and 16K .rom files)');
      if (items.length === 1) { await useData(items[0].e.name, await ZXFiles.zipRead(bytes, items[0].e)); return; }
      let d = $$('kiddlg'); if (d) d.remove(); d = document.createElement('div'); d.id = 'kiddlg'; d.innerHTML = `<div class="kidcard"><h3>${file.name}</h3><div class="sub">Pick what to use:</div><div id="zxpick"></div><div class="row"><button type="button" id="zxpclose">Cancel</button></div></div>`; document.body.appendChild(d);
      $$('zxpclose').onclick = () => d.remove(); d.onclick = ev => { if (ev.target === d) d.remove(); };
      for (const it of items) { const row = document.createElement('div'); row.className = 'zxitem'; const label = { tape: 'Add tape', snap: 'Load snapshot', rom: 'Use as ROM' }[it.kind]; row.innerHTML = `<span>${it.e.name} <small>(${it.e.size} bytes)</small></span>`; const b = document.createElement('button'); b.type = 'button'; b.className = 'pri'; b.textContent = label; b.onclick = async () => { try { await useData(it.e.name, await ZXFiles.zipRead(bytes, it.e)); d.remove(); } catch (er) { toast(er.message, 'bad'); } }; row.appendChild(b); $$('zxpick').appendChild(row); }
    } catch (e) { toast(e.message, 'bad'); }
  }

  // ---------- main loop ----------
  function loop(t) {
    requestAnimationFrame(loop); const dt = Math.min(100, t - lastT); lastT = t;
    if (typeof tab === 'undefined' || tab !== 'zx' || !spec) return;
    if (running) { acc += dt; let n = 0; while (acc >= 20 && n < 4 * turbo) { for (let k = 0; k < turbo; k++) { stepKeys(); spec.runFrame(); if (k === 0) pushAudio(); } acc -= 20; n++; } if (acc > 200) acc = 0; }
    spec.draw(img, BW); sx.putImageData(img, 0, 0);
  }
  async function init() {
    scr = $$('zxscreen'); sx = scr.getContext('2d'); img = sx.createImageData(SW, SH); scr.width = SW; scr.height = SH;
    let rom; try { rom = new Uint8Array(await (await fetch('spectrum/48.rom')).arrayBuffer()); if (rom.length !== 16384) throw new Error('bad ROM'); } catch (e) { $$('zxhint').textContent = 'Could not load the Spectrum ROM (' + e.message + ').'; return; }
    origRom = rom; spec = new Spectrum(rom); spec.onPrint = onPrint; spec.onLoad = (blk, ok) => { renderTape(); if (autoRun && blk[0] === 0xFF && ok) { autoRun = false; setTimeout(() => typeKeys(RUN_SEQ), 400); } };
    spec.onSave = (blk, all) => { if (blk[0] === 0xFF && all.length >= 2 && all[all.length - 2][0] === 0) { const h = all[all.length - 2], name = String.fromCharCode(...h.slice(2, 12)).trim() || 'program'; addLib(name + ' (' + new Date().toLocaleDateString() + ')', [h, blk]); spec.recorded = []; toast('Saved “' + name + '” to your programs'); } };
    for (const b of BUILTIN) { try { listings[b.id] = await (await fetch('spectrum/' + b.file)).text(); } catch (e) { listings[b.id] = '10 PRINT "PROGRAM MISSING"'; } }
    loadLib(); renderLib(); buildKeys(); $$('zxhint').textContent = '';
    try { const j = JSON.parse(localStorage.getItem(ROMKEY) || 'null'); if (j && j.b64) { const r = unb64(j.b64); if (r.length === 16384) { spec.setRom(r); spec.reset(); romName = j.name; } } } catch (e) { }
    describeRom(); renderTape();
    for (let i = 0; i < 100; i++) spec.runFrame(); // let the ROM start up
    requestAnimationFrame(loop);
  }
  function bind() {
    $$('zxpause').onclick = () => { running = !running; $$('zxpause').textContent = running ? '⏸ Pause' : '▶ Resume'; };
    $$('zxreset').onclick = () => { spec.reset(); for (let i = 0; i < 100; i++) spec.runFrame(); renderTape(); };
    $$('zxturbo').onclick = () => { turbo = turbo === 1 ? 3 : turbo === 3 ? 8 : 1; $$('zxturbo').textContent = '⏩ ×' + turbo; };
    $$('zxsound').onclick = () => { muted = !muted; $$('zxsound').textContent = muted ? '🔇 Off' : '🔊 On'; if (!muted) ensureAudio(); queue = []; };
    $$('zxcopy').onclick = () => { onPrint(spec.screenBits(176), 'copy'); };
    $$('zxsend').onclick = () => sendPage(lastPage); $$('zxdismiss').onclick = () => { $$('zxprint').hidden = true; };
    $$('zxload').onclick = () => typeKeys(LOAD_SEQ); $$('zxrun').onclick = () => typeKeys(RUN_SEQ); $$('zxlist').onclick = () => typeKeys([['K'], ['ENTER']]);
    $$('zxrewind').onclick = () => { spec.tape.pos = 0; renderTape(); }; $$('zxeject').onclick = () => { spec.insert([]); renderTape(); };
    $$('zxopen').onclick = () => $$('zxfile').click();
    $$('zxfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
    $$('zxorig').onclick = useOriginalRom;
    $$('zxsnap').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ZXFiles.saveSna(spec)])); a.download = 'zx-snapshot.sna'; a.click(); toast('Snapshot saved'); };
    $$('zxmake').onclick = () => { const text = $$('zxbas').value, name = ($$('zxname').value || 'program').trim().slice(0, 10), { lines } = ZXBasic.compile(text); if (!lines) { toast('No numbered lines found (each line must start with a line number)', 'bad'); return; } const blocks = ZXBasic.programTape(name, text, -1); addLib(name, blocks); insert(blocks, name, false); toast(lines + ' lines turned into a tape. Tap LOAD, then RUN.'); };
    document.addEventListener('keydown', e => onKey(e, true)); document.addEventListener('keyup', e => onKey(e, false));
  }
  function onShow() { if (!started) { started = true; bind(); init(); } }
  const api = { onShow, get spec() { return spec; }, press, typeKeys, showPage, openFile, useRom, useOriginalRom };
  return api;
})();
window.ZX = ZX;
