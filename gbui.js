'use strict';
// Game Boy tab: runs the emulator with the phone camera as the Pocket Camera sensor and routes Game Boy Printer output to the cat printer.
(() => {
  const camv = [$('camview'), $('camview2')], gbv = $('gbview');
  const scr = $('gbscreen'), sx = scr.getContext('2d'), imgd = sx.createImageData(160, 144);
  let gb = null, rom = null, acc = 0, lastT = 0, sensT = 0, saveT = 0, started = false, page = null;
  const sensorImg = new Uint8Array(128 * 112);
  const sc = document.createElement('canvas'); sc.width = 128; sc.height = 112; const scx = sc.getContext('2d', { willReadFrequently: true });

  // ---- storage (IndexedDB store 'gb') ----
  async function kvGet(k) { try { const d = await idb(); return await new Promise(r => { const q = d.transaction('gb').objectStore('gb').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; } }
  async function kvPut(k, v) { try { const d = await idb(); await new Promise(r => { const q = d.transaction('gb', 'readwrite').objectStore('gb').put(v, k); q.onsuccess = () => r(); q.onerror = () => r(); }); } catch (e) { log('gb save failed', e.message); } }

  // ---- tabs ----
  function setTab(t) {
    tab = t; const gm = t === 'gb';
    camv.forEach(e => e.hidden = gm); gbv.hidden = !gm;
    $('camsettings').hidden = t === 'fx'; $('fxpanel').hidden = t !== 'fx';
    $('tabcam').className = t === 'cam' ? 'pri' : ''; $('tabfx').className = t === 'fx' ? 'pri' : ''; $('tabgb').className = gm ? 'pri' : '';
    $('view').style.touchAction = t === 'fx' ? 'none' : 'pan-y';
    if (window.Fx) Fx.badge();
    if (gm && !started) { started = true; boot(); }
    if (!gm) saveSram();
    try { localStorage.setItem('catcam-tab', t); } catch (e) { }
  }
  $('tabcam').onclick = () => setTab('cam'); $('tabfx').onclick = () => setTab('fx'); $('tabgb').onclick = () => setTab('gb');

  // ---- boot / ROM ----
  async function boot() {
    const saved = await kvGet('rom');
    if (saved) start(new Uint8Array(saved)); else if (!(await fetchRom(true)) && !gb) $('gbhint').hidden = false;
  }
  function validRom(b) { if (b.length < 0x8000) return 'file too small to be a Game Boy ROM'; const t = String.fromCharCode(...b.slice(0x134, 0x13F)); if (!t.startsWith('GAMEBOYCAMERA') && b[0x147] !== 0xFC) return 'this does not look like the Game Boy Camera ROM (cartridge type ' + b[0x147].toString(16) + ')'; return null; }
  async function start(bytes) {
    const err = validRom(bytes); if (err) { alert(err); log('ROM rejected:', err); return false; }
    rom = bytes; gb = new GameBoy(rom); $('gbhint').hidden = true;
    const sram = await kvGet('sram'); if (sram && sram.byteLength === gb.sram.length) gb.sram.set(new Uint8Array(sram));
    gb.cameraSource = () => sensorImg; gb.sensorGain = +$('gbgain').value;
    gb.printer.onPage = onPage;
    log('Game Boy started,', (rom.length >> 10) + 'KB ROM, save', sram ? 'restored' : 'new');
    return true;
  }
  async function fetchRom(quiet) {
    try { const r = await fetch('rom/camera.gb', { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const b = new Uint8Array(await r.arrayBuffer());
      if (b.length < 0x8000 || b[0x147] === undefined) throw new Error('not a ROM'); if (await start(b)) { await kvPut('rom', b.buffer.slice(0)); return true; } }
    catch (e) { log('ROM from server failed:', e.message); if (!quiet) alert('Could not fetch rom/camera.gb from the server: ' + e.message); }
    return false;
  }
  $('gbfetch').onclick = () => fetchRom(false);
  $('gbrom').onclick = () => $('gbfile').click();
  $('gbfile').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; const b = new Uint8Array(await f.arrayBuffer()); if (await start(b)) await kvPut('rom', b.buffer.slice(0)); ev.target.value = ''; };
  $('gbreset').onclick = () => { if (gb && confirm('Reset the game? (Saved photos are kept.)')) { saveSram(); gb.reset(); } };
  $('gbflip').onclick = () => $('flip').click();
  $('gbconnect').onclick = () => $('connect').click();
  $('gbgain').addEventListener('input', () => { if (gb) gb.sensorGain = +$('gbgain').value; syncOutputs(); try { localStorage.setItem('catcam-gain', $('gbgain').value); } catch (e) { } });
  $('gbpal').addEventListener('input', () => { try { localStorage.setItem('catcam-gbpal', $('gbpal').value); } catch (e) { } });
  try { const g = localStorage.getItem('catcam-gain'); if (g) $('gbgain').value = g; const p = localStorage.getItem('catcam-gbpal'); if (p) $('gbpal').value = p; } catch (e) { }
  syncOutputs();
  $('gbsave').onclick = () => { if (!gb) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gb.sram])); a.download = 'camera.sav'; a.click(); };
  async function saveSram() { if (gb && gb.sramDirty) { gb.sramDirty = false; await kvPut('sram', gb.sram.slice().buffer); } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSram(); });

  // ---- input ----
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'b', x: 'a', Enter: 'start', Backspace: 'select', Shift: 'select' };
  addEventListener('keydown', e => { if (tab === 'gb' && gb && KEYMAP[e.key]) { gb.setKey(KEYMAP[e.key], true); e.preventDefault(); } });
  addEventListener('keyup', e => { if (tab === 'gb' && gb && KEYMAP[e.key]) { gb.setKey(KEYMAP[e.key], false); e.preventDefault(); } });
  document.querySelectorAll('#gbpad button').forEach(b => {
    const k = b.dataset.k, dn = e => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); if (gb) gb.setKey(k, true); b.style.filter = 'brightness(1.5)'; if (navigator.vibrate) navigator.vibrate(8); };
    const up = e => { e.preventDefault(); if (gb) gb.setKey(k, false); b.style.filter = ''; };
    b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('contextmenu', e => e.preventDefault());
  });

  // ---- camera sensor ----
  function updateSensor() {
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    const s = Math.max(128 / vw, 112 / vh), dw = vw * s, dh = vh * s;
    scx.save(); if (facing === 'user') { scx.translate(128, 0); scx.scale(-1, 1); } scx.drawImage(video, (128 - dw) / 2, (112 - dh) / 2, dw, dh); scx.restore();
    const d = scx.getImageData(0, 0, 128, 112).data;
    for (let i = 0; i < sensorImg.length; i++) sensorImg[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }

  // ---- main loop ----
  function drawFrame() {
    const p = palOf($('gbpal').value), d = imgd.data, fb = gb.fb;
    for (let i = 0; i < 160 * 144; i++) { const c = p[fb[i]], o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
    sx.putImageData(imgd, 0, 0);
  }
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(100, t - lastT); lastT = t;
    if (tab !== 'gb' || !gb) return;
    acc += dt; let n = 0;
    while (acc >= 16.74 && n < 3) { gb.runFrame(); acc -= 16.74; n++; }
    if (n) drawFrame(); else if (acc > 100) acc = 0;
    if (t - sensT > 66) { sensT = t; updateSensor(); }
    if (t - saveT > 5000) { saveT = t; saveSram(); }
  }
  requestAnimationFrame(loop);

  // ---- printing ----
  function pageToBits(pg) {
    const hh = pg.h * 2, bits = new Uint8Array(W * hh), off = (W - 320) / 2, ORDER = [0, 3, 1, 2], INK = [0, 1, 3, 4];
    for (let y = 0; y < pg.h; y++) for (let x = 0; x < 160; x++) {
      const n = INK[pg.shades[y * 160 + x]]; if (!n) continue;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (ORDER[j * 2 + i] < n) bits[(y * 2 + j) * W + off + x * 2 + i] = 1;
    }
    return bits;
  }
  async function sendPage(pg) {
    const c = cfg(), pr = $('prog'), bar = pr.firstElementChild; pr.style.display = 'block';
    try {
      const job = buildJob(pageToBits(pg), c); log('GB print job', job.length, 'packets');
      if (!c.mock && !ble.wc) await bleConnect();
      await (c.mock ? mockSend : bleSend)(job, c, p => bar.style.width = (p * 100) + '%');
      log('GB print done');
    } catch (e) { log('PRINT ERROR', e.message); alert('Print failed: ' + e.message); }
    finally { setTimeout(() => { pr.style.display = 'none'; bar.style.width = 0; }, 800); }
  }
  function showPage(pg) {
    const c = $('gbpage'); c.width = pg.w; c.height = pg.h; const x = c.getContext('2d'), im = x.createImageData(pg.w, pg.h), pp = palOf($('gbpal').value);
    for (let i = 0; i < pg.w * pg.h; i++) { const v = pp[pg.shades[i]]; im.data[i * 4] = v[0]; im.data[i * 4 + 1] = v[1]; im.data[i * 4 + 2] = v[2]; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0); $('gbprint').hidden = false;
  }
  function onPage(pg) {
    log('Game Boy printed a page', pg.w + 'x' + pg.h); page = pg; showPage(pg);
    if ($('gbauto').checked && (ble.wc || cfg().mock)) sendPage(pg);
  }
  $('gbsend').onclick = () => { if (page) sendPage(page); };
  $('gbclose').onclick = () => { $('gbprint').hidden = true; };
  $('gbpng').onclick = () => { const a = document.createElement('a'); a.href = $('gbpage').toDataURL('image/png'); a.download = 'gbcam-print-' + Date.now() + '.png'; a.click(); };

  window.gbui = { tick(n) { for (let i = 0; i < n; i++) { if (i % 4 === 0) updateSensor(); gb.runFrame(); } drawFrame(); }, get gb() { return gb; }, start, setTab, pageToBits, sensorImg, onPage };
  try { const lt = localStorage.getItem('catcam-tab'); if (lt === 'gb' || lt === 'fx') setTab(lt); } catch (e) { }
})();
