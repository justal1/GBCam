'use strict';
// Power goo (after Kai's Power Goo): drag the live picture like liquid. Smear, bloat, pinch, twirl, melt, ripple, restore.
// A displacement field persists while the camera keeps running, so the goo stays put and the world moves under it.
(() => {
  const { E, st } = Fx, W = 384, H = 336, CELL = 4, GW = W / CELL, GH = H / CELL, CAP = 170;
  const paintCv = document.createElement('canvas'); paintCv.width = W; paintCv.height = H; const px = paintCv.getContext('2d', { willReadFrequently: true });
  const NOISE = (() => { const n = new Float32Array(W * H * 2); let a = 12345; for (let i = 0; i < n.length; i++) { a = (a * 1664525 + 1013904223) >>> 0; n[i] = a / 4294967296 - 0.5; } return n; })();
  const G = { scat: new Float32Array(W * H), scatOn: false, hasPaint: false, pdata: null, pdirty: true, drips: [], hue: 330, rainbow: true, color: '#ff3d81', dripsOn: true, dripTimer: 0, fx: new Float32Array(GW * GH), fy: new Float32Array(GW * GH), tool: 'smear', size: 64, press: 0.8, relax: 0, wob: 0, down: false, px: 0, py: 0, ripples: [], undo: [], any: false, t: 0, timer: 0, lastT: 0 };
  Fx.goo = G;
  const TOOLS = [['smear', '👆', 'Smear'], ['bloat', '🎈', 'Bloat'], ['pinch', '🤏', 'Pinch'], ['twirl', '🌀', 'Twirl'], ['untwirl', '🔄', 'Twirl back'], ['melt', '🫠', 'Melt'], ['ripple', '💧', 'Ripple'], ['scatter', '💨', 'Scatter'], ['paint', '🎨', 'Goo paint'], ['restore', '🧽', 'Restore']];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lim = v => clamp(v, -CAP, CAP);

  function brush(cx, cy, fn) {
    const r = G.size, r2 = r * r, x0 = Math.max(0, Math.floor((cx - r) / CELL)), x1 = Math.min(GW - 1, Math.ceil((cx + r) / CELL)), y0 = Math.max(0, Math.floor((cy - r) / CELL)), y1 = Math.min(GH - 1, Math.ceil((cy + r) / CELL));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const dx = gx * CELL + CELL / 2 - cx, dy = gy * CELL + CELL / 2 - cy, d2 = dx * dx + dy * dy; if (d2 >= r2) continue; const q = 1 - d2 / r2; fn(gy * GW + gx, dx, dy, q * q); }
  }

  const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  function blob(x, y, r, col, shine) {
    const base = col.hsl ? null : col.rgb, g = px.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    if (col.hsl) { g.addColorStop(0, `hsl(${col.hsl},95%,78%)`); g.addColorStop(0.5, `hsl(${col.hsl},90%,52%)`); g.addColorStop(1, `hsl(${col.hsl},85%,30%)`); }
    else { g.addColorStop(0, mix(base, [255, 255, 255], 0.5)); g.addColorStop(0.5, mix(base, base, 0)); g.addColorStop(1, mix(base, [0, 0, 0], 0.55)); }
    px.fillStyle = g; px.beginPath(); px.arc(x, y, r, 0, 7); px.fill();
    if (shine) { px.fillStyle = 'rgba(255,255,255,.45)'; px.beginPath(); px.ellipse(x - r * 0.25, y - r * 0.45, r * 0.3, r * 0.1, -0.2, 0, 7); px.fill(); }
    G.hasPaint = true; G.pdirty = true;
  }
  const curColor = () => G.rainbow ? { hsl: Math.round(G.hue) % 360 } : { rgb: hexRgb(G.color) };
  let lastPaint = null, stepN = 0;
  function paintTo(x, y) {
    const r = Math.max(5, G.size * 0.3), step = Math.max(1.5, r * 0.13); let [lx, ly] = lastPaint || [x, y];
    const d = Math.hypot(x - lx, y - ly), n = Math.max(1, Math.round(d / step));
    for (let i = 1; i <= n; i++) {
      const bx = lx + (x - lx) * i / n, by = ly + (y - ly) * i / n; G.hue += 0.9; stepN++;
      blob(bx, by, r, curColor(), stepN % 2 === 0);
      if (G.dripsOn && Math.random() < 0.05) { G.drips.push({ x: bx + (Math.random() - 0.5) * r, y: by + r * 0.5, r: r * (0.3 + Math.random() * 0.25), vy: 25 + Math.random() * 45, len: 0, max: 25 + Math.random() * 100, col: curColor() }); ensureDrips(); }
    }
    lastPaint = [x, y];
  }
  function stepDrips(dt) { for (const d of G.drips) { const dy = d.vy * dt; d.y += dy; d.len += dy; d.r *= 1 - dt * 0.35; blob(d.x, d.y, d.r, d.col, false); } G.drips = G.drips.filter(d => d.len < d.max && d.r > 1.2); }
  function ensureDrips() { if (G.dripTimer) return; G.dripTimer = setInterval(() => { stepDrips(0.05); if (!G.drips.length) { clearInterval(G.dripTimer); G.dripTimer = 0; } rerender(); }, 50); }
  function snapshot() { G.undo.push({ fx: G.fx.slice(), fy: G.fy.slice(), scat: G.scat.slice(), paint: G.hasPaint ? px.getImageData(0, 0, W, H) : null }); if (G.undo.length > 10) G.undo.shift(); }
  function restoreSnap(u) { G.fx.set(u.fx); G.fy.set(u.fy); G.scat.set(u.scat); px.clearRect(0, 0, W, H); if (u.paint) px.putImageData(u.paint, 0, 0); G.hasPaint = !!u.paint; G.pdirty = true; G.drips = []; }
  function eraseAt(x, y, dt) { // restore tool also wipes paint and scatter under the brush
    const r = G.size; px.save(); px.globalCompositeOperation = 'destination-out'; const g = px.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${Math.min(1, dt * 9)})`); g.addColorStop(1, 'rgba(0,0,0,0)'); px.fillStyle = g; px.fillRect(x - r, y - r, 2 * r, 2 * r); px.restore(); G.pdirty = true;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dx = xx - x, dy = yy - y, d2 = dx * dx + dy * dy; if (d2 < r * r) G.scat[yy * W + xx] *= Math.max(0, 1 - (1 - d2 / (r * r)) * dt * 9); }
  }
  function scatterAt(x, y, dt) {
    const r = G.size, x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dx = xx - x, dy = yy - y, d2 = dx * dx + dy * dy; if (d2 < r * r) { const q = 1 - d2 / (r * r); G.scat[yy * W + xx] = Math.min(1, G.scat[yy * W + xx] + q * G.press * dt * 3); } }
    G.scatOn = true;
  }
  function smear(x0, y0, x1, y1) { const ddx = x1 - x0, ddy = y1 - y0, k = G.press * 1.1; brush(x1, y1, (i, dx, dy, w) => { G.fx[i] = lim(G.fx[i] - ddx * w * k); G.fy[i] = lim(G.fy[i] - ddy * w * k); }); }
  function hold(dt) {
    if (!G.down) return; const k = G.press, x = G.px, y = G.py;
    switch (G.tool) {
      case 'bloat': brush(x, y, (i, dx, dy, w) => { G.fx[i] = lim(G.fx[i] - dx * w * k * dt * 2.2); G.fy[i] = lim(G.fy[i] - dy * w * k * dt * 2.2); }); break;
      case 'pinch': brush(x, y, (i, dx, dy, w) => { G.fx[i] = lim(G.fx[i] + dx * w * k * dt * 2.2); G.fy[i] = lim(G.fy[i] + dy * w * k * dt * 2.2); }); break;
      case 'twirl': case 'untwirl': { const sg = (G.tool === 'twirl' ? 1 : -1) * k * dt * 2.4; brush(x, y, (i, dx, dy, w) => { G.fx[i] = lim(G.fx[i] - dy * w * sg); G.fy[i] = lim(G.fy[i] + dx * w * sg); }); break; }
      case 'melt': brush(x, y, (i, dx, dy, w) => { G.fy[i] = lim(G.fy[i] - w * k * dt * 140); G.fx[i] = lim(G.fx[i] + (Math.random() - 0.5) * w * k * dt * 30); }); break;
      case 'scatter': scatterAt(x, y, dt); break;
      case 'restore': brush(x, y, (i, dx, dy, w) => { const f = Math.max(0, 1 - w * dt * 8); G.fx[i] *= f; G.fy[i] *= f; }); eraseAt(x, y, dt); break;
    }
  }

  E.goo = { group: 'Goo (drag on the picture!)', label: 'Power goo', icon: '🫧', filter(s, W, H, P) {
    const dt = clamp(P.t - G.t, 0, 0.1); G.t = P.t;
    if (G.relax > 0) { const f = Math.exp(-G.relax * 2.5 * dt); for (let i = 0; i < G.fx.length; i++) { G.fx[i] *= f; G.fy[i] *= f; } if (G.scatOn) for (let i = 0; i < G.scat.length; i++) G.scat[i] *= f; }
    if (G.hasPaint) { if (G.pdirty || !G.pdata) { G.pdata = px.getImageData(0, 0, W, H).data; G.pdirty = false; } const pd = G.pdata; for (let i = 0, o = 0; i < W * H; i++, o += 4) { const a = pd[o + 3]; if (a) { const k = a / 255; s[o] = s[o] * (1 - k) + pd[o] * k; s[o + 1] = s[o + 1] * (1 - k) + pd[o + 1] * k; s[o + 2] = s[o + 2] * (1 - k) + pd[o + 2] * k; } } }
    let mx = 0; for (let i = 0; i < G.fx.length; i++) { const a = Math.abs(G.fx[i]) + Math.abs(G.fy[i]); if (a > mx) mx = a; } G.any = mx > 0.05;
    G.ripples = G.ripples.filter(r => P.t - r.t0 < 2.8);
    const wob = G.wob, rip = G.ripples; if (!G.any && !rip.length && wob < 0.01 && !G.scatOn) return;
    const nOff = (Math.floor(P.t * 14) * 7919) % (W * H);
    const c = new Uint8ClampedArray(s), t = P.t;
    for (let y = 0; y < H; y++) {
      const gyf = clamp(y / CELL - 0.5, 0, GH - 1.001), gy0 = gyf | 0, wy = gyf - gy0;
      for (let x = 0; x < W; x++) {
        const gxf = clamp(x / CELL - 0.5, 0, GW - 1.001), gx0 = gxf | 0, wx = gxf - gx0, a = gy0 * GW + gx0, b = a + GW;
        let ox = (G.fx[a] * (1 - wx) + G.fx[a + 1] * wx) * (1 - wy) + (G.fx[b] * (1 - wx) + G.fx[b + 1] * wx) * wy, oy = (G.fy[a] * (1 - wx) + G.fy[a + 1] * wx) * (1 - wy) + (G.fy[b] * (1 - wx) + G.fy[b + 1] * wx) * wy;
        for (const r of rip) { const age = t - r.t0, dx = x - r.x, dy = y - r.y, d = Math.hypot(dx, dy) + 0.001, ring = d - 150 * age; if (ring > -70 && ring < 70) { const amp = 11 * (1 - age / 2.8) * (1 - Math.abs(ring) / 70) * Math.sin(ring * 0.32); ox += dx / d * amp; oy += dy / d * amp; } }
        if (G.scatOn) { const sc = G.scat[y * W + x]; if (sc > 0.02) { const ni = ((y * W + x + nOff) % (W * H)) * 2, amp = sc * 30; ox += NOISE[ni] * 2 * amp; oy += NOISE[ni + 1] * 2 * amp; } }
        if (wob > 0.01) { ox += Math.sin(y * 0.035 + t * 3.1) * wob * 7; oy += Math.cos(x * 0.03 + t * 2.5) * wob * 7; }
        if (ox > 0.02 || ox < -0.02 || oy > 0.02 || oy < -0.02) Fx.sample(c, W, H, x + ox, y + oy, s, (y * W + x) * 4);
      }
    } } };

  // ---- pointer handling on the viewfinder ----
  const view = document.getElementById('view');
  const pos = ev => { const r = view.getBoundingClientRect(); return [(ev.clientX - r.left) * W / r.width, (ev.clientY - r.top) * H / r.height]; };
  const isOn = () => typeof tab !== 'undefined' && tab === 'fx' && st.name === 'goo' && !(typeof Overlay !== 'undefined' && Overlay.st.drag === 'sticker');
  const rerender = () => { if (typeof live !== 'undefined' && !live && typeof lastBmp !== 'undefined' && lastBmp) loadBitmap(lastBmp); };
  function tick() { const now = performance.now(), dt = Math.min(0.08, (now - G.lastT) / 1000); G.lastT = now; hold(dt); rerender(); }
  const stop = () => { G.down = false; lastPaint = null; clearInterval(G.timer); G.timer = 0; rerender(); };
  view.addEventListener('pointerdown', ev => {
    if (!isOn()) return; snapshot();
    G.down = true; [G.px, G.py] = pos(ev); lastPaint = null; if (G.tool === 'paint') paintTo(G.px, G.py); G.lastT = performance.now(); if (G.tool === 'ripple') G.ripples.push({ x: G.px, y: G.py, t0: performance.now() / 1000 });
    if (!G.timer) G.timer = setInterval(tick, 33);
  });
  view.addEventListener('pointermove', ev => { if (!G.down) return; const [x, y] = pos(ev); if (G.tool === 'smear') smear(G.px, G.py, x, y); else if (G.tool === 'paint') paintTo(x, y); G.px = x; G.py = y; });
  view.addEventListener('pointerup', stop); view.addEventListener('pointercancel', stop);

  // ---- controls ----
  const panel = document.createElement('div'); panel.id = 'fxgoo'; panel.hidden = true;
  panel.innerHTML = `<div class="sub" style="margin-top:12px">Drag on the picture to push it around like liquid. Press and hold for bloat, pinch, twirl, melt and scatter. “Goo paint” draws glossy dripping goo that you can then smear. It works on the live camera: the goo stays put while the world moves under it, and the shutter captures the gooed picture.</div>
    <div id="goo-tools"></div>
    <div class="ctl"><span>Brush</span><input id="goo-size" type="range" min="20" max="150" step="2" value="64"><output></output>
      <span>Pressure</span><input id="goo-press" type="range" min="0.2" max="1.6" step="0.05" value="0.8"><output></output>
      <span>Snap back</span><input id="goo-relax" type="range" min="0" max="1" step="0.05" value="0"><output></output>
      <span>Wobble</span><input id="goo-wob" type="range" min="0" max="1" step="0.05" value="0"><output></output></div>
    <div class="row" id="goo-paintrow"><label class="chk" style="margin:0"><input id="goo-rb" type="checkbox" checked> Rainbow goo</label><input id="goo-col" type="color" value="#ff3d81" aria-label="Goo colour" style="flex:0 0 56px;height:40px;padding:2px;border-radius:10px;background:var(--panel);border:1px solid #2f353d"><label class="chk" style="margin:0"><input id="goo-drip" type="checkbox" checked> Drips</label></div>
    <div class="row"><button id="goo-undo" type="button">↶ Undo</button><button id="goo-reset" type="button">Reset goo</button></div>`;
  const hint = document.getElementById('fxhint'); hint.parentNode.insertBefore(panel, hint.nextSibling);
  const box = panel.querySelector('#goo-tools');
  for (const [k, ic, lb] of TOOLS) { const b = document.createElement('button'); b.type = 'button'; b.dataset.t = k; b.innerHTML = `<span>${ic}</span><small>${lb}</small>`; b.onclick = () => { G.tool = k; mark(); }; box.appendChild(b); }
  const mark = () => box.querySelectorAll('button').forEach(b => b.className = b.dataset.t === G.tool ? 'pri' : ''); mark();
  const bind = (id, key) => { const el = panel.querySelector('#' + id), o = el.nextElementSibling, f = () => { G[key] = +el.value; if (o) o.textContent = el.value; }; el.addEventListener('input', f); f(); };
  bind('goo-size', 'size'); bind('goo-press', 'press'); bind('goo-relax', 'relax'); bind('goo-wob', 'wob');
  panel.querySelector('#goo-reset').onclick = () => { snapshot(); G.fx.fill(0); G.fy.fill(0); G.scat.fill(0); G.scatOn = false; px.clearRect(0, 0, W, H); G.hasPaint = false; G.pdirty = true; G.drips = []; G.ripples = []; rerender(); };
  panel.querySelector('#goo-rb').onchange = e => { G.rainbow = e.target.checked; }; panel.querySelector('#goo-col').oninput = e => { G.color = e.target.value; G.rainbow = false; panel.querySelector('#goo-rb').checked = false; }; panel.querySelector('#goo-drip').onchange = e => { G.dripsOn = e.target.checked; };
  panel.querySelector('#goo-undo').onclick = () => { const u = G.undo.pop(); if (u) { restoreSnap(u); rerender(); } };
  Fx.onSelect(k => { panel.hidden = k !== 'goo'; });
  Fx.rebuild();
  try { const k = localStorage.getItem('catcam-fx'); if (k === 'goo') { st.name = 'goo'; Fx.badge(); panel.hidden = false; document.querySelectorAll('#fxgrid button').forEach(b => b.className = b.dataset.k === 'goo' ? 'pri' : ''); } } catch (e) { }
})();
