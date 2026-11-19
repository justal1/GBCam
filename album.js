'use strict';
// Album: saving, favourites, multi-select (print / zip / share / delete), batch import, install prompt.
const Album = (() => {
  let all = [], selMode = false, favOnly = false; const sel = new Set();

  // 384x336 canvas of a stored shot rendered with the given settings
  function renderCanvas(gray, rgb, c) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const r = process(gray, c);
    const src = document.createElement('canvas'); let ctxSrc = null;
    const needRGB = c.look !== 'mono';
    const getRGB = (w, h) => { // resample stored rgb (192x168) or fall back to grey
      const a = document.createElement('canvas'); a.width = 192; a.height = 168; const ax = a.getContext('2d');
      if (rgb) ax.putImageData(new ImageData(new Uint8ClampedArray(rgb), 192, 168), 0, 0);
      else { const im = ax.createImageData(192, 168); for (let j = 0; j < 168; j++) for (let i = 0; i < 192; i++) { const v = gray[(j * 2) * W + i * 2] * 255; const o = (j * 192 + i) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255; } ax.putImageData(im, 0, 0); }
      const b = document.createElement('canvas'); b.width = w; b.height = h; const bx = b.getContext('2d'); bx.imageSmoothingEnabled = true; bx.drawImage(a, 0, 0, w, h); return bx.getImageData(0, 0, w, h).data;
    };
    if (c.look === 'gbc') GBC.draw(getRGB(128, 112), c, true, x);
    else if (c.look === 'cdith') { const rs = RES[c.res] || RES['192']; GBC.dither(getRGB(rs[0], rs[1]), rs[0], rs[1], c, x); }
    else draw(r, c, x);
    return cv;
  }
  async function save(g, rgb, quiet) {
    const c = cfg(), gray8 = new Uint8Array(W * H); for (let i = 0; i < g.length; i++) gray8[i] = g[i] * 255;
    const cv = renderCanvas(g, rgb, c), tc = document.createElement('canvas'); tc.width = 128; tc.height = 112; tc.getContext('2d').drawImage(cv, 0, 0, 128, 112);
    const id = await dbPut({ gray: gray8, rgb, thumb: tc.toDataURL('image/png'), t: Date.now(), fav: false });
    if (!quiet) { if (navigator.vibrate) navigator.vibrate(30); }
    log('saved shot', id); refresh(); return id;
  }
  const grayOf = s => { const g = new Float32Array(W * H); for (let i = 0; i < g.length; i++) g[i] = s.gray[i] / 255; return g; };

  // ---- gallery ----
  async function refresh() {
    all = (await dbAll()).reverse(); const g = $('gallery'); g.innerHTML = '';
    const list = favOnly ? all.filter(s => s.fav) : all;
    $('empty').style.display = list.length ? 'none' : 'block'; $('empty').textContent = favOnly ? 'No favourites yet.' : 'No photos yet.';
    for (const s of list) {
      const d = document.createElement('div'); d.className = 'it'; const im = new Image(); im.src = s.thumb; if (s.id === stillId) im.className = 'sel'; d.appendChild(im);
      if (s.fav) { const st = document.createElement('i'); st.className = 'star'; st.textContent = '★'; d.appendChild(st); }
      if (selMode) { const ck = document.createElement('i'); ck.className = 'ck' + (sel.has(s.id) ? ' on' : ''); ck.textContent = sel.has(s.id) ? '✓' : ''; d.appendChild(ck); }
      d.onclick = () => { if (selMode) { sel.has(s.id) ? sel.delete(s.id) : sel.add(s.id); refresh(); } else openStill(s); };
      g.appendChild(d);
    }
    $('selbar').hidden = !selMode; $('selcount').textContent = sel.size + ' selected';
    $('albsel').className = selMode ? 'pri' : ''; $('albfav').className = favOnly ? 'pri' : '';
  }
  const chosen = () => all.filter(s => sel.has(s.id));

  $('albsel').onclick = () => { selMode = !selMode; if (!selMode) sel.clear(); refresh(); };
  $('albfav').onclick = () => { favOnly = !favOnly; refresh(); };
  $('selfav').onclick = async () => { const items = chosen(); const to = !items.every(s => s.fav); for (const s of items) { s.fav = to; await dbPut(s); } refresh(); };
  $('seldel').onclick = async () => { const items = chosen(); if (!items.length || !confirm('Delete ' + items.length + ' photo(s)?')) return; for (const s of items) await dbDel(s.id); sel.clear(); refresh(); };
  $('selprint').onclick = async () => {
    const items = chosen(); if (!items.length) return; const c = cfg();
    for (let i = 0; i < items.length; i++) { const ok = await Prt.printBits(process(grayOf(items[i]), c).bits, 'queue ' + (i + 1) + '/' + items.length); if (!ok) break; }
  };
  $('selshare').onclick = async () => {
    const items = chosen(); if (!items.length) return; const c = cfg(), files = [];
    for (const s of items) { const cv = renderCanvas(grayOf(s), s.rgb, c); const b = await new Promise(r => cv.toBlob(r, 'image/png')); files.push(new File([b], 'catcam-' + s.id + '.png', { type: 'image/png' })); }
    if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, title: 'CatCam' }); } catch (e) { } } else alert('Sharing files is not supported in this browser. Use Zip instead.');
  };
  $('selzip').onclick = async () => {
    const items = chosen(); if (!items.length) return; const c = cfg(), files = [];
    for (const s of items) { const cv = renderCanvas(grayOf(s), s.rgb, c); const b = await new Promise(r => cv.toBlob(r, 'image/png')); files.push({ name: 'catcam-' + s.id + '.png', data: new Uint8Array(await b.arrayBuffer()) }); }
    const blob = new Blob([zip(files)], { type: 'application/zip' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'catcam-photos.zip'; a.click();
  };

  // ---- minimal ZIP (stored) ----
  const CT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
      const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0)]);
      parts.push(lh, name, f.data);
      cen.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
      off += lh.length + name.length + n;
    }
    let cl = 0; for (const c of cen) cl += c.length;
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), ...u16(0)]);
    return concat([...parts, ...cen, end]);
  }
  function concat(arrs) { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; }

  // ---- batch import (camera roll) ----
  $('albbatch').onclick = () => $('batchfile').click();
  $('batchfile').onchange = async ev => {
    const files = [...ev.target.files]; ev.target.value = ''; if (!files.length) return;
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tx = tmp.getContext('2d', { willReadFrequently: true }); let n = 0;
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f), s = Math.max(W / bmp.width, H / bmp.height), dw = bmp.width * s, dh = bmp.height * s;
        tx.fillStyle = '#000'; tx.fillRect(0, 0, W, H); tx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh); Fx.apply(tx); Overlay.apply(tx);
        const g = toGray(tx.getImageData(0, 0, W, H).data), r = document.createElement('canvas'); r.width = 192; r.height = 168; const rx = r.getContext('2d'); rx.imageSmoothingQuality = 'high'; rx.drawImage(tmp, 0, 0, 192, 168);
        await save(g, new Uint8ClampedArray(rx.getImageData(0, 0, 192, 168).data), true); n++; $('albbatch').textContent = 'Importing ' + n + '/' + files.length;
      } catch (e) { log('import failed', f.name, e.message); }
    }
    $('albbatch').textContent = 'Import photos…'; log('imported', n, 'photo(s) with the current effect/look');
  };

  // ---- install prompt ----
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('install').hidden = false; });
  $('install').onclick = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) { } deferred = null; $('install').hidden = true; };

  refresh();
  return { save, refresh, renderCanvas, zip, crc32, get all() { return all; } };
})();
