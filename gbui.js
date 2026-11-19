'use strict';
// Game Boy tab: emulator UI. Several stored games, audio, save import/export, phone camera as the Pocket Camera sensor
// (with an optional colour viewfinder), and Game Boy Printer output routed to the cat printer.
(() => {
  const camv = [$('camview'), $('camview2')], gbv = $('gbview');
  const scr = $('gbscreen'), sx = scr.getContext('2d'), imgd = sx.createImageData(160, 144);
  let gb = null, gameId = null, acc = 0, lastT = 0, sensT = 0, saveT = 0, started = false, page = null;
  const sensorImg = new Uint8Array(128 * 112), sensorRGB = new Uint8ClampedArray(128 * 112 * 4);
  const sc = document.createElement('canvas'); sc.width = 128; sc.height = 112; const scx = sc.getContext('2d', { willReadFrequently: true });

  // ---- storage (IndexedDB store 'gb') ----
  async function kvGet(k) { try { const d = await idb(); return await new Promise(r => { const q = d.transaction('gb').objectStore('gb').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; } }
  async function kvPut(k, v) { try { const d = await idb(); await new Promise(r => { const q = d.transaction('gb', 'readwrite').objectStore('gb').put(v, k); q.onsuccess = () => r(); q.onerror = () => r(); }); } catch (e) { log('gb save failed', e.message); } }
  async function kvDel(k) { try { const d = await idb(); await new Promise(r => { const q = d.transaction('gb', 'readwrite').objectStore('gb').delete(k); q.onsuccess = () => r(); q.onerror = () => r(); }); } catch (e) { } }

  // ---- tabs ----
  function setTab(t) {
    tab = t; const gm = t === 'gb', hideCam = gm || t === 'pr';
    camv.forEach(e => e.hidden = hideCam); gbv.hidden = !gm; $('printview').hidden = t !== 'pr';
    $('camsettings').hidden = t === 'fx'; $('fxpanel').hidden = t !== 'fx';
    for (const k of ['cam', 'fx', 'pr', 'gb']) $('tab' + k).className = t === k ? 'pri' : '';
    $('view').style.touchAction = t === 'fx' ? 'none' : 'pan-y';
    if (window.Fx) Fx.badge();
    if (gm && !started) { started = true; boot(); }
    if (gm) ensureAudio(); else { saveSram(); if (ac && ac.state === 'running') ac.suspend(); }
    try { localStorage.setItem('catcam-tab', t); } catch (e) { }
  }
  $('tabcam').onclick = () => setTab('cam'); $('tabfx').onclick = () => setTab('fx'); $('tabpr').onclick = () => setTab('pr'); $('tabgb').onclick = () => setTab('gb');

  // ---- audio ----
  let ac = null, muted = false;
  try { muted = localStorage.getItem('catcam-muted') === '1'; } catch (e) { }
  function ensureAudio() {
    $('gbmute').textContent = muted ? '🔇' : '🔊';
    if (muted || !gb) return;
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        const node = ac.createScriptProcessor(1024, 0, 2);
        node.onaudioprocess = e => { const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1); if (gb) gb.apu.pull(L, R); else { L.fill(0); R.fill(0); } };
        node.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
      gb.apu.sampleCycles = 4194304 / ac.sampleRate; gb.apu.on = true;
    } catch (e) { log('audio unavailable:', e.message); }
  }
  $('gbmute').onclick = () => { muted = !muted; try { localStorage.setItem('catcam-muted', muted ? '1' : '0'); } catch (e) { } if (gb) gb.apu.on = false; ensureAudio(); };
  addEventListener('pointerdown', () => { if (tab === 'gb') ensureAudio(); }, { passive: true });

  // ---- games ----
  let games = [];
  const titleOf = b => { let t = ''; for (let i = 0x134; i < 0x143; i++) { const c = b[i]; if (c >= 32 && c < 127) t += String.fromCharCode(c); else if (c === 0) break; } return t.trim() || 'Untitled'; };
  const idOf = b => titleOf(b).replace(/[^A-Za-z0-9]/g, '') + '-' + ((b[0x14E] << 8) | b[0x14F]).toString(16) + '-' + (b.length >> 10);
  const SUPPORTED = new Set([0x00, 0x01, 0x02, 0x03, 0x08, 0x09, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0xFC]);
  function validRom(b) {
    if (b.length < 0x8000) return 'file too small to be a Game Boy ROM';
    if (!SUPPORTED.has(b[0x147])) return 'cartridge type 0x' + b[0x147].toString(16) + ' is not supported yet (supported: plain, MBC1, MBC3, MBC5, Game Boy Camera)';
    return null;
  }
  async function loadGames() {
    games = (await kvGet('games')) || [];
    const legacy = await kvGet('rom'); // single-ROM storage from earlier versions
    if (legacy && !games.length) { const b = new Uint8Array(legacy), id = idOf(b); await kvPut('rom:' + id, legacy); const sr = await kvGet('sram'); if (sr) await kvPut('sram:' + id, sr); games = [{ id, title: titleOf(b), size: b.length }]; await kvPut('games', games); await kvPut('last', id); await kvDel('rom'); await kvDel('sram'); }
    refreshGames();
  }
  function refreshGames() {
    const sel = $('gbgame'); sel.innerHTML = '';
    if (!games.length) { const o = document.createElement('option'); o.value = ''; o.textContent = '(no game loaded)'; sel.appendChild(o); return; }
    for (const g of games) { const o = document.createElement('option'); o.value = g.id; o.textContent = g.title; if (g.id === gameId) o.selected = true; sel.appendChild(o); }
  }
  async function boot() {
    await loadGames();
    const last = await kvGet('last'), g = games.find(x => x.id === last) || games[0];
    if (g) { await loadGame(g.id); return; }
    if (!(await fetchRom(true)) && !gb) $('gbhint').hidden = false;
  }
  async function loadGame(id) {
    const r = await kvGet('rom:' + id); if (!r) return false;
    await saveSram(); await startBytes(new Uint8Array(r), false); return true;
  }
  async function startBytes(bytes, store) {
    const err = validRom(bytes); if (err) { alert(err); log('ROM rejected:', err); return false; }
    if (bytes[0x143] === 0xC0 && !confirm('This is a Game Boy Color-only game. This emulator is Game Boy (mono) only, so it will probably not run properly. Add it anyway?')) return false;
    const id = idOf(bytes), g = new GameBoy(bytes); gameId = id; gb = g; $('gbhint').hidden = true;
    const sram = await kvGet('sram:' + id); if (sram && sram.byteLength === g.sram.length) g.sram.set(new Uint8Array(sram));
    g.cameraSource = () => sensorImg; g.cameraColour = () => sensorRGB; g.sensorGain = +$('gbgain').value; g.printer.onPage = onPage;
    if (store) { await kvPut('rom:' + id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); if (!games.find(x => x.id === id)) { games.push({ id, title: titleOf(bytes), size: bytes.length }); await kvPut('games', games); } }
    await kvPut('last', id); refreshGames(); place = null; if (tab === 'gb') ensureAudio();
    log('Game Boy started:', titleOf(bytes), (bytes.length >> 10) + 'KB,', g.mbc, 'mapper, save', sram ? 'restored' : 'new');
    return true;
  }
  const start = bytes => startBytes(bytes, true);
  async function fetchRom(quiet) {
    try { const r = await fetch('rom/camera.gb', { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const b = new Uint8Array(await r.arrayBuffer()); if (b.length < 0x8000) throw new Error('not a ROM'); if (await start(b)) return true; }
    catch (e) { log('ROM from server failed:', e.message); if (!quiet) alert('Could not fetch rom/camera.gb from the server: ' + e.message); }
    return false;
  }
  $('gbfetch').onclick = () => fetchRom(false);
  $('gbrom').onclick = () => $('gbfile').click();
  $('gbfile').onchange = async ev => { for (const f of ev.target.files) await start(new Uint8Array(await f.arrayBuffer())); ev.target.value = ''; };
  $('gbgame').onchange = async () => { const id = $('gbgame').value; if (id && id !== gameId) await loadGame(id); };
  $('gbdelgame').onclick = async () => {
    if (!gameId || !confirm('Remove this game and its saved data from the browser?')) return;
    const id = gameId; games = games.filter(x => x.id !== id); await kvPut('games', games); await kvDel('rom:' + id); await kvDel('sram:' + id); gb = null; gameId = null; refreshGames();
    scr.getContext('2d').clearRect(0, 0, 160, 144); if (games.length) await loadGame(games[0].id); else $('gbhint').hidden = false;
  };
  $('gbreset').onclick = () => { if (gb && confirm('Reset the game? (Saved data is kept.)')) { saveSram(); gb.reset(); } };
  $('gbflip').onclick = () => $('flip').click();
  $('gbconnect').onclick = () => $('connect').click();
  $('gbgain').addEventListener('input', () => { if (gb) gb.sensorGain = +$('gbgain').value; syncOutputs(); try { localStorage.setItem('catcam-gain', $('gbgain').value); } catch (e) { } });
  $('gbpal').addEventListener('input', () => { try { localStorage.setItem('catcam-gbpal', $('gbpal').value); } catch (e) { } });
  $('gbcolour').addEventListener('input', () => { try { localStorage.setItem('catcam-gbcolour', $('gbcolour').checked ? '1' : '0'); } catch (e) { } });
  try { const g = localStorage.getItem('catcam-gain'); if (g) $('gbgain').value = g; const p = localStorage.getItem('catcam-gbpal'); if (p) $('gbpal').value = p; const c = localStorage.getItem('catcam-gbcolour'); if (c) $('gbcolour').checked = c === '1'; } catch (e) { }
  syncOutputs();
  $('gbsave').onclick = () => { if (!gb) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gb.ramBytes && gb.mbc !== 'cam' ? gb.sram.slice(0, gb.ramBytes) : gb.sram])); a.download = titleOf(gb.rom).replace(/\W+/g, '_') + '.sav'; a.click(); };
  $('gbimport').onclick = () => $('gbsavefile').click();
  $('gbsavefile').onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f || !gb) return;
    const b = new Uint8Array(await f.arrayBuffer()); if (!confirm('Replace this game\'s save with ' + f.name + ' (' + b.length + ' bytes)?')) return;
    gb.sram.fill(0); gb.sram.set(b.subarray(0, gb.sram.length)); gb.sramDirty = true; await saveSram(); gb.reset(); log('save imported:', f.name);
  };
  async function saveSram() { if (gb && gameId && gb.sramDirty) { gb.sramDirty = false; await kvPut('sram:' + gameId, gb.sram.slice().buffer); } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSram(); });

  // ---- input ----
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'b', x: 'a', Enter: 'start', Backspace: 'select', Shift: 'select' };
  addEventListener('keydown', e => { if (tab === 'gb' && gb && KEYMAP[e.key] && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { gb.setKey(KEYMAP[e.key], true); e.preventDefault(); } });
  addEventListener('keyup', e => { if (tab === 'gb' && gb && KEYMAP[e.key]) { gb.setKey(KEYMAP[e.key], false); e.preventDefault(); } });
  document.querySelectorAll('#gbpad button').forEach(b => {
    const k = b.dataset.k, dn = e => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); if (gb) gb.setKey(k, true); b.style.filter = 'brightness(1.5)'; if (navigator.vibrate) navigator.vibrate(8); ensureAudio(); };
    const up = e => { e.preventDefault(); if (gb) gb.setKey(k, false); b.style.filter = ''; };
    b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('contextmenu', e => e.preventDefault());
  });

  // ---- camera sensor ----
  function updateSensor() {
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    const s = Math.max(128 / vw, 112 / vh), dw = vw * s, dh = vh * s;
    scx.save(); if (facing === 'user') { scx.translate(128, 0); scx.scale(-1, 1); } scx.drawImage(video, (128 - dw) / 2, (112 - dh) / 2, dw, dh); scx.restore();
    const d = scx.getImageData(0, 0, 128, 112).data; sensorRGB.set(d);
    for (let i = 0; i < sensorImg.length; i++) sensorImg[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }

  // ---- colour viewfinder: find where the game shows the 128x112 camera image and tint it with the real colours ----
  const SAMP = (() => { const a = []; let s = 7; for (let i = 0; i < 500; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const x = s % 128; s = (s * 1103515245 + 12345) & 0x7fffffff; a.push([x, s % 112]); } return a; })();
  let place = null, placeT = 0;
  function score(ox, oy, n) {
    const bgp = gb.io[0x47], ids = gb.camIds, fb = gb.fb; let m = 0;
    for (let i = 0; i < n; i++) { const x = SAMP[i][0], y = SAMP[i][1]; if (fb[(oy + y) * 160 + ox + x] === ((bgp >> (ids[y * 128 + x] * 2)) & 3)) m++; }
    return m / n;
  }
  function findPlace() {
    if (!gb.camIds || !gb.camRGB) return null;
    if (place) { if (score(place.ox, place.oy, 160) >= 0.75) return place; place = null; }
    if ((placeT++ % 5) !== 0) return null;
    // the image must stand out from chance: a flat picture matches everywhere, a real viewfinder matches at one offset only
    let best = 0, bo = null, sum = 0, cnt = 0; for (let oy = 0; oy <= 32; oy++) for (let ox = 0; ox <= 32; ox++) { const s = score(ox, oy, 90); sum += s; cnt++; if (s > best) { best = s; bo = { ox, oy }; } }
    if (bo && best >= 0.85 && best - sum / cnt >= 0.25 && score(bo.ox, bo.oy, 400) >= 0.85) place = bo;
    return place;
  }
  const YS = [1, 0.7, 0.4, 0.07];
  function colourise(d) {
    const p = findPlace(); if (!p) return; const rgb = gb.camRGB, fb = gb.fb;
    for (let y = 0; y < 112; y++) for (let x = 0; x < 128; x++) {
      const si = (y * 128 + x) * 4, i = ((p.oy + y) * 160 + p.ox + x), o = i * 4, Y = YS[fb[i]] * 255;
      const r = rgb[si], g = rgb[si + 1], b = rgb[si + 2], L = Math.max(30, 0.299 * r + 0.587 * g + 0.114 * b), k = Y / L;
      d[o] = Math.min(255, Y * 0.1 + r * k * 0.9); d[o + 1] = Math.min(255, Y * 0.1 + g * k * 0.9); d[o + 2] = Math.min(255, Y * 0.1 + b * k * 0.9);
    }
  }

  // ---- main loop ----
  function drawFrame() {
    const p = palOf($('gbpal').value), d = imgd.data, fb = gb.fb;
    for (let i = 0; i < 160 * 144; i++) { const c = p[fb[i]], o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
    if (gb.mbc === 'cam' && $('gbcolour').checked) colourise(d);
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

  // ---- printing (Game Boy Printer output -> cat printer) ----
  function pageToBits(pg) {
    const hh = pg.h * 2, bits = new Uint8Array(W * hh), off = (W - 320) / 2, ORDER = [0, 3, 1, 2], INK = [0, 1, 3, 4];
    for (let y = 0; y < pg.h; y++) for (let x = 0; x < 160; x++) {
      const n = INK[pg.shades[y * 160 + x]]; if (!n) continue;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (ORDER[j * 2 + i] < n) bits[(y * 2 + j) * W + off + x * 2 + i] = 1;
    }
    return bits;
  }
  const sendPage = pg => Prt.printBits(pageToBits(pg), 'GB print');
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
  $('gbpng').onclick = () => { const a = document.createElement('a'); a.href = $('gbpage').toDataURL('image/png'); a.download = 'gb-print-' + Date.now() + '.png'; a.click(); };

  window.gbui = { tick(n) { for (let i = 0; i < n; i++) { if (i % 4 === 0) updateSensor(); gb.runFrame(); } drawFrame(); }, get gb() { return gb; }, get place() { return place; }, start, startBytes, setTab, pageToBits, sensorImg, sensorRGB, onPage, drawFrame };
  try { const lt = localStorage.getItem('catcam-tab'); if (lt === 'gb' || lt === 'fx' || lt === 'pr') setTab(lt); } catch (e) { }
})();
