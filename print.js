'use strict';
// Small toast used instead of alert() across the app.
function toast(msg, kind) {
  let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show' + (kind ? ' ' + kind : ''); clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, kind === 'bad' ? 4500 : 2200);
}
if ('serviceWorker' in navigator) { const had = !!navigator.serviceWorker.controller; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('GB CatCam updated. Reload to use the new version.'); }); }
// Print helpers: text -> 1-bit rows, label printing, calibration page, shared print/preview plumbing.
const Prt = (() => {
  const cx = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function wrap(x, text, maxw) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const t = line ? line + ' ' + word : word;
        if (x.measureText(t).width <= maxw || !line) line = t; else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  }
  // text -> {bits, h}; bits is W-wide, 1 = ink
  function textBits(text, o = {}) {
    const size = o.size || 40, pad = o.pad == null ? 8 : o.pad, align = o.align || 'center', font = o.font || 'system-ui, "Helvetica Neue", Arial, sans-serif';
    const tmp = cx(W, 10).getContext('2d'); tmp.font = `${o.bold === false ? 400 : 800} ${size}px ${font}`;
    const lines = wrap(tmp, text || ' ', W - 2 * pad), lh = Math.round(size * 1.15), h = Math.max(8, lines.length * lh + 2 * pad);
    const c = cx(W, h), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, h); x.fillStyle = '#000'; x.font = tmp.font; x.textBaseline = 'top';
    lines.forEach((l, i) => { const w = x.measureText(l).width; const px = align === 'left' ? pad : align === 'right' ? W - pad - w : (W - w) / 2; x.fillText(l, px, pad + i * lh); });
    return { bits: canvasBits(c), h };
  }
  function canvasBits(c, thresh = 140) {
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, bits = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) bits[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) < thresh ? 1 : 0;
    return bits;
  }
  function bitsCanvas(bits, scale = 1) {
    const h = bits.length / W, c = cx(W, h), x = c.getContext('2d'), im = x.createImageData(W, h);
    for (let i = 0; i < W * h; i++) { const v = bits[i] ? 20 : 250; im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0); return c;
  }
  function stack(parts) { // [{bits,h}] -> {bits,h}
    let h = 0; for (const p of parts) h += p.h; const bits = new Uint8Array(W * h); let o = 0;
    for (const p of parts) { bits.set(p.bits, o * W); o += p.h; } return { bits, h };
  }
  const blank = h => ({ bits: new Uint8Array(W * h), h });
  const solid = h => ({ bits: new Uint8Array(W * h).fill(1), h });

  // ---- calibration page ----
  function calibration() {
    const c = cfg(), parts = [];
    parts.push(textBits('CATCAM TEST', { size: 44 }));
    parts.push(textBits('LEFT edge', { size: 22, align: 'left', bold: true }));
    parts.push(textBits('RIGHT edge', { size: 22, align: 'right', bold: true }));
    // ruler: tick every 8 dots, long every 32
    { const h = 26, b = new Uint8Array(W * h); for (let x = 0; x < W; x++) { const len = x % 32 === 0 ? 24 : x % 8 === 0 ? 9 : 0; for (let y = 0; y < len; y++) b[y * W + x] = 1; } parts.push({ bits: b, h }); }
    parts.push(textBits('ruler: ticks 8 / 32 dots (384 wide)', { size: 15, bold: false }));
    parts.push(blank(8));
    // 16-step grey ramp (Bayer 8x8)
    { const h = 44, b = new Uint8Array(W * h); for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) { const step = Math.min(15, (x / 24) | 0), ink = step / 15, t = (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64; b[y * W + x] = ink > t ? 1 : 0; } parts.push({ bits: b, h }); }
    parts.push(textBits('grey ramp: all 16 steps should differ', { size: 15, bold: false }));
    parts.push(blank(8)); parts.push(solid(20)); parts.push(textBits('solid black (check darkness, banding)', { size: 15, bold: false }));
    // 1px lines / checker
    { const h = 16, b = new Uint8Array(W * h); for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) b[y * W + x] = ((x + y) & 1) ? 1 : 0; parts.push({ bits: b, h }); }
    parts.push(textBits('1-dot checkerboard', { size: 15, bold: false }));
    { const h = 16, b = new Uint8Array(W * h); for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) b[y * W + x] = (x & 3) < 2 ? 1 : 0; parts.push({ bits: b, h }); }
    parts.push(textBits('2-dot vertical lines', { size: 15, bold: false }));
    parts.push(textBits('Darkness ' + c.energy + '%  chunk ' + c.chunk + '  delay ' + c.delay + 'ms  ' + (c.msb ? 'MSB' : 'LSB') + '-first', { size: 15, bold: false }));
    parts.push(textBits('Mirrored text/ticks in 8-dot blocks? toggle MSB-first.', { size: 15, bold: false }));
    parts.push(blank(16));
    return stack(parts);
  }

  // ---- shared plumbing ----
  let last = null;
  let rest = null;
  async function printBits(bits, label) {
    if (window.Kid && !Kid.canPrint()) return false;
    const c = cfg(), pr = $('prog'), bar = pr.firstElementChild, sb = $('pstop'); pr.style.display = 'block'; bar.style.width = 0; ble.abort = false; sb.hidden = false; sb.disabled = false; sb.textContent = '⏹ Stop printing'; sb.onclick = () => { ble.abort = true; sb.disabled = true; sb.textContent = 'Stopping…'; };
    try {
      const job = buildJob(bits, c); log((label || 'print') + ':', job.length, 'packets');
      if (!c.mock && !ble.wc) await bleConnect();
      const stopped = await (c.mock ? mockSend : bleSend)(job, c, p => bar.style.width = (p * 100) + '%');
      last = { bits, label };
      if (stopped != null) { const done = Math.max(0, stopped - 4), total = bits.length / W; rest = done < total ? { bits: bits.slice(done * W), label: (label || 'print') + '-rest' } : null; log((label || 'print') + ' stopped after row ' + done + ' of ' + total); if (window.Health) Health.record(done + (c.feed || 0), true); toast('Stopped after ' + (done / 80).toFixed(1) + ' cm. “Print the rest” carries on from there.'); window.dispatchEvent(new Event('printrest')); return true; }
      rest = null; window.dispatchEvent(new Event('printrest'));
      log((label || 'print') + ' done'); toast('Printed ✓'); if (window.Kid) Kid.printed(); if (window.Health) Health.record(bits.length / W + (c.feed || 0), true); if (navigator.vibrate) navigator.vibrate(25); return true;
    } catch (e) { log('PRINT ERROR', e.message); last = { bits, label }; if (window.Health) Health.record(0, false, e.message); toast('Print failed: ' + e.message + ' — see Log at the bottom', 'bad'); return false; }
    finally { sb.hidden = true; setTimeout(() => { pr.style.display = 'none'; bar.style.width = 0; }, 800); }
  }
  const printRest = () => rest ? printBits(rest.bits, rest.label) : false;
  // preview modal: show a canvas, with Print / Save / Close (+ optional extra button)
  function preview(canvas, bits, label, extra) {
    const m = $('modal'), body = $('modalbody'); body.innerHTML = '';
    const pc = cx(canvas.width, canvas.height); pc.getContext('2d').drawImage(canvas, 0, 0); pc.style.cssText = 'width:100%;max-width:384px;display:block;margin:0 auto;background:#fff;image-rendering:pixelated;border-radius:4px';
    body.appendChild(pc);
    const row = document.createElement('div'); row.className = 'row';
    const mk = (t, cls, fn) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; row.appendChild(b); return b; };
    if (bits) mk('🖨 Print', 'pri', async () => { await printBits(bits, label); });
    mk('Save PNG', '', () => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = (label || 'catcam') + '-' + Date.now() + '.png'; a.click(); });
    if (extra) mk(extra.text, '', async () => { await extra.fn(); });
    mk('Close', '', () => { m.hidden = true; });
    body.appendChild(row); m.hidden = false;
  }
  function previewBits(bits, label, extra) { preview(bitsCanvas(bits), bits, label, extra); }

  // ---- label printer UI ----
  function initUI() {
    const go = (doPrint) => {
      const t = $('lbltext').value || ' ', o = { size: +$('lblsize').value, align: $('lblalign').value, bold: $('lblbold').checked };
      const parts = [textBits(t, o)]; if ($('lbldate').checked) parts.push(textBits(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), { size: 18, bold: false, align: o.align }));
      const s = stack(parts); if (doPrint) printBits(s.bits, 'label'); else previewBits(s.bits, 'label');
    };
    $('lblprev').onclick = () => go(false); $('lblprint').onclick = () => go(true);
    $('calprev').onclick = () => { const s = calibration(); previewBits(s.bits, 'calibration'); };
    $('calprint').onclick = () => { const s = calibration(); printBits(s.bits, 'calibration'); };
    $('pvclose') && ($('pvclose').onclick = () => { $('modal').hidden = true; });
    $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });
  }
  initUI();
  return { get last() { return last; }, get rest() { return rest; }, printRest, textBits, canvasBits, bitsCanvas, stack, blank, solid, calibration, printBits, preview, previewBits };
})();
