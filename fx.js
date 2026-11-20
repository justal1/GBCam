'use strict';
// Silly warp effects applied to the 384x336 work canvas before the dither/colour pipeline.
const Fx = (() => {
  const st = { name: 'none', cx: 0.5, cy: 0.45, size: 1, amt: 0.6, auto: false, face: null };
  const m = { x: 0, y: 0 };
  const hyp = Math.hypot;
  const E = {
    none: { label: 'None', icon: '🚫' },
    football: { label: 'Football head', icon: '🏈', make: P => (x, y) => { const dx = (x - P.cx) / (P.rx * 1.1), dy = (y - P.cy) / (P.ry * 1.1), r2 = dx * dx + dy * dy; if (r2 < 1) { const k = 1 + P.amt * 2.4 * (1 - r2); m.y = P.cy + (y - P.cy) / k; } } },
    bighead: { label: 'Big head', icon: '🎈', make: P => (x, y) => { const dx = x - P.cx, dy = y - P.cy, r2 = (dx * dx + dy * dy) / (P.R * P.R * 1.4); if (r2 < 1) { const f = 1 - P.amt * 0.85 * (1 - r2); m.x = P.cx + dx * f; m.y = P.cy + dy * f; } } },
    bugeyes: { label: 'Bug eyes', icon: '👀', make: P => { const Re = P.R * 0.36; return (x, y) => { for (const e of P.eyes) { const dx = x - e.x, dy = y - e.y, r2 = (dx * dx + dy * dy) / (Re * Re); if (r2 < 1) { const f = 1 - P.amt * 0.9 * (1 - r2); m.x = e.x + dx * f; m.y = e.y + dy * f; return; } } }; } },
    pinch: { label: 'Tiny face', icon: '🔍', make: P => (x, y) => { const dx = x - P.cx, dy = y - P.cy, r2 = (dx * dx + dy * dy) / (P.R * P.R * 1.4); if (r2 < 1) { const f = 1 + P.amt * 1.6 * (1 - r2); m.x = P.cx + dx * f; m.y = P.cy + dy * f; } } },
    swirl: { label: 'Swirl', icon: '🌀', make: P => (x, y) => { const dx = x - P.cx, dy = y - P.cy, r = hyp(dx, dy) / (P.R * 1.8); if (r < 1) { const th = P.amt * 8 * (1 - r) * (1 - r), c = Math.cos(th), s = Math.sin(th); m.x = P.cx + dx * c - dy * s; m.y = P.cy + dx * s + dy * c; } } },
    fisheye: { label: 'Fisheye', icon: '🐟', make: P => { const R = hyp(P.W, P.H) * 0.42; return (x, y) => { const dx = x - P.cx, dy = y - P.cy, r2 = (dx * dx + dy * dy) / (R * R); if (r2 < 1) { const f = 1 - P.amt * 0.7 * (1 - r2); m.x = P.cx + dx * f; m.y = P.cy + dy * f; } }; } },
    mirror: { label: 'Mirror twin', icon: '🪞', make: P => (x, y) => { if (x > P.cx) m.x = 2 * P.cx - x; } },
    mirrorv: { label: 'Mirror flip', icon: '🙃', make: P => (x, y) => { if (y > P.cy) m.y = 2 * P.cy - y; } },
    kaleido: { label: 'Kaleidoscope', icon: '🔮', make: P => { const n = Math.round(4 + P.amt * 6), sec = Math.PI * 2 / n; return (x, y) => { const dx = x - P.cx, dy = y - P.cy, r = hyp(dx, dy); let th = Math.atan2(dy, dx) + P.t * 0.3; th = ((th % sec) + sec) % sec; th = Math.abs(th - sec / 2); m.x = P.cx + r * Math.cos(th); m.y = P.cy + r * Math.sin(th); }; } },
    wobble: { label: 'Wobble', icon: '🌊', make: P => (x, y) => { m.x = x + Math.sin(y * 0.05 + P.t * 4) * P.amt * 18; m.y = y + Math.cos(x * 0.04 + P.t * 3) * P.amt * 10; } },
    pixel: { label: 'Chunky pixels', icon: '🧱', make: P => { const b = Math.max(2, Math.round(3 + P.amt * 28)); return (x, y) => { m.x = (Math.floor(x / b) + 0.5) * b; m.y = (Math.floor(y / b) + 0.5) * b; }; } },
    squash: { label: 'Squash', icon: '🍔', make: P => (x, y) => { m.y = P.cy + (y - P.cy) * (1 + P.amt * 1.1); } },
    skinny: { label: 'Skinny', icon: '📏', make: P => (x, y) => { m.x = P.cx + (x - P.cx) * (1 + P.amt * 1.1); } },
    tile: { label: 'Multiply', icon: '🔳', make: P => { const n = 2 + Math.round(P.amt * 3); return (x, y) => { m.x = (x * n) % P.W; m.y = (y * n) % P.H; }; } },
  };
  // ---- live "glitch" filters (operate on pixel data, some keep state between frames) ----
  const S = { prev: null, raw: null, trail: null };
  const resetHooks = [], selectHooks = [];
  const resetState = () => { S.prev = S.raw = S.trail = null; resetHooks.forEach(f => f()); };
  const rainbow = h => [127.5 + 127.5 * Math.sin(h), 127.5 + 127.5 * Math.sin(h + 2.094), 127.5 + 127.5 * Math.sin(h + 4.188)];
  const lum = (a, i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
  E.scanlines = { label: 'Scanlines', icon: '📺', filter: (s, W, H, P) => { const k = 0.65 - P.amt * 0.35; for (let y = 0; y < H; y += 1) if (y % 3 === 0) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; s[i] *= k; s[i + 1] *= k; s[i + 2] *= k; } } };
  E.rgbsplit = { label: 'RGB split', icon: '🌈', filter: (s, W, H, P) => { const k = Math.round(2 + P.amt * 16), c = new Uint8ClampedArray(s); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; s[i] = c[(y * W + Math.max(0, x - k)) * 4]; s[i + 2] = c[(y * W + Math.min(W - 1, x + k)) * 4 + 2]; } } };
  E.vhs = { label: 'VHS', icon: '📼', filter: (s, W, H, P) => { const c = new Uint8ClampedArray(s), t = P.t; for (let y = 0; y < H; y++) { let sh = Math.sin(y * 0.08 + t * 9) * P.amt * 5; if (((y * 7 + Math.floor(t * 12) * 13) % 97) < 3) sh += P.amt * 26; const k = y % 4 < 2 ? 0.85 : 1; for (let x = 0; x < W; x++) { const sx = Math.min(W - 1, Math.max(0, Math.round(x + sh))), j = (y * W + sx) * 4, jr = (y * W + Math.min(W - 1, sx + 3)) * 4, i = (y * W + x) * 4; s[i] = c[jr] * k; s[i + 1] = c[j + 1] * k; s[i + 2] = c[j + 2] * k; } } } };
  E.edges = { label: 'Neon edges', icon: '💡', filter: (s, W, H, P) => { const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = lum(s, i * 4); const o = new Uint8ClampedArray(s.length), t = P.t;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1], gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1], m = Math.min(1, Math.hypot(gx, gy) * (0.006 + P.amt * 0.012)), c = rainbow(x * 0.02 + y * 0.015 + t); o[i * 4] = c[0] * m; o[i * 4 + 1] = c[1] * m; o[i * 4 + 2] = c[2] * m; o[i * 4 + 3] = 255; } s.set(o); } };
  E.echo = { label: 'Echo trails', icon: '👻', filter: (s, W, H, P) => { if (!S.prev || S.prev.length !== s.length) S.prev = new Uint8ClampedArray(s); const a = 0.25 + P.amt * 0.6; for (let i = 0; i < s.length; i += 4) { s[i] = s[i] * (1 - a) + S.prev[i] * a; s[i + 1] = s[i + 1] * (1 - a) + S.prev[i + 1] * a; s[i + 2] = s[i + 2] * (1 - a) + S.prev[i + 2] * a; } S.prev.set(s); } };
  E.ghost = { label: 'Motion ghosts', icon: '🫥', filter: (s, W, H, P) => { const cur = new Uint8ClampedArray(s); if (!S.raw || S.raw.length !== s.length) S.raw = new Uint8ClampedArray(s);
    for (let i = 0; i < s.length; i += 4) { const d = Math.abs(lum(cur, i) - lum(S.raw, i)), m = Math.min(1, d / 50 * (1 + P.amt * 2)); s[i] = cur[i] * 0.5; s[i + 1] = cur[i + 1] * 0.5 + 255 * 0.5 * m; s[i + 2] = cur[i + 2] * 0.5 + 255 * 0.45 * m; } S.raw.set(cur); } };
  E.rainbow = { label: 'Rainbow trails', icon: '🦄', filter: (s, W, H, P) => { const cur = new Uint8ClampedArray(s); if (!S.raw || S.raw.length !== s.length) S.raw = new Uint8ClampedArray(s); if (!S.trail || S.trail.length !== s.length) S.trail = new Float32Array(s.length); const c = rainbow(P.t * 3), dec = 0.82 + P.amt * 0.13;
    for (let i = 0; i < s.length; i += 4) { const d = Math.abs(lum(cur, i) - lum(S.raw, i)), m = Math.min(1, d / 40); for (let k = 0; k < 3; k++) { S.trail[i + k] = Math.min(255, S.trail[i + k] * dec + c[k] * m); s[i + k] = Math.min(255, cur[i + k] * 0.8 + S.trail[i + k]); } } S.raw.set(cur); } };
  function params(W, H) {
    const f = st.auto ? st.face : null, cx = f ? f.cx : st.cx * W, cy = f ? f.cy : st.cy * H;
    const R = (f ? f.w * 0.55 : Math.min(W, H) * 0.26) * st.size;
    const eyes = f && f.eyes ? f.eyes : [{ x: cx - R * 0.38, y: cy - R * 0.2 }, { x: cx + R * 0.38, y: cy - R * 0.2 }];
    return { W, H, cx, cy, R, rx: R * 0.95, ry: R * 1.35, amt: st.amt, t: performance.now() / 1000, eyes };
  }
  function sample(s, W, H, x, y, o, oi) {
    if (x < 0) x = 0; else if (x > W - 1) x = W - 1; if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
    const x0 = x | 0, y0 = y | 0, x1 = x0 + 1 < W ? x0 + 1 : x0, y1 = y0 + 1 < H ? y0 + 1 : y0, fx = x - x0, fy = y - y0;
    const a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, d = (y1 * W + x1) * 4;
    const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
    o[oi] = s[a] * w0 + s[b] * w1 + s[c] * w2 + s[d] * w3; o[oi + 1] = s[a + 1] * w0 + s[b + 1] * w1 + s[c + 1] * w2 + s[d + 1] * w3; o[oi + 2] = s[a + 2] * w0 + s[b + 2] * w1 + s[c + 2] * w2 + s[d + 2] * w3; o[oi + 3] = 255;
  }
  function apply(ctx) {
    const e = E[st.name]; if (!e || (!e.make && !e.filter)) return;
    if (e.filter) { const W = ctx.canvas.width, H = ctx.canvas.height, im = ctx.getImageData(0, 0, W, H); e.filter(im.data, W, H, params(W, H)); ctx.putImageData(im, 0, 0); return; }
    const W = ctx.canvas.width, H = ctx.canvas.height, im = ctx.getImageData(0, 0, W, H), s = im.data, o = new Uint8ClampedArray(s.length), map = e.make(params(W, H));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      m.x = x; m.y = y; map(x, y); const oi = (y * W + x) * 4;
      if (m.x === x && m.y === y) { o[oi] = s[oi]; o[oi + 1] = s[oi + 1]; o[oi + 2] = s[oi + 2]; o[oi + 3] = 255; } else sample(s, W, H, m.x, m.y, o, oi);
    }
    im.data.set(o); ctx.putImageData(im, 0, 0);
  }

  // ---- UI ----
  const $$ = id => document.getElementById(id);
  const grid = $$('fxgrid');
  function buildGrid() {
    grid.innerHTML = ''; let lastG = null;
    for (const k of Object.keys(E)) {
      const g = E[k].group || (E[k].filter ? 'Glitch filters' : E[k].make ? 'Warps' : '');
      if (g && g !== lastG) { const h = document.createElement('div'); h.className = 'fxh'; h.textContent = g; grid.appendChild(h); } lastG = g || lastG;
      const b = document.createElement('button'); b.dataset.k = k; b.innerHTML = '<span>' + E[k].icon + '</span><small>' + E[k].label + '</small>';
      b.onclick = () => { st.name = k; resetState(); mark(); badge(); selectHooks.forEach(f => f(k)); try { localStorage.setItem('catcam-fx', k); } catch (e) { } };
      grid.appendChild(b);
    }
    mark();
  }
  function mark() { grid.querySelectorAll('button').forEach(b => b.className = b.dataset.k === st.name ? 'pri' : ''); }
  function badge() {
    const el = $$('fxbadge'); if (!el) return;
    const on = st.name !== 'none' && typeof tab !== 'undefined' && tab !== 'fx';
    el.hidden = !on; if (on) el.textContent = '✨ Effect on: ' + E[st.name].label + ' (change it in the Effects tab)';
  }
  $$('fxamt').addEventListener('input', () => { st.amt = +$$('fxamt').value; });
  $$('fxsize').addEventListener('input', () => { st.size = +$$('fxsize').value; });
  // tap / drag on the viewfinder places the effect
  const view = $$('view');
  const place = ev => { if (typeof tab === 'undefined' || tab !== 'fx' || (st.auto && st.face) || (typeof Overlay !== 'undefined' && Overlay.st.drag === 'sticker')) return; const r = view.getBoundingClientRect(); st.cx = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); st.cy = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)); };
  view.addEventListener('pointerdown', ev => { place(ev); view.setPointerCapture && view.setPointerCapture(ev.pointerId); });
  view.addEventListener('pointermove', ev => { if (ev.buttons) place(ev); });

  // ---- optional face tracking (Shape Detection API) ----
  let fd = null, tracking = false;
  const supported = 'FaceDetector' in window;
  if (!supported) { $$('fxauto').disabled = true; $$('fxhint').textContent = 'Tap or drag on the picture to place the effect. Auto face-follow needs Chrome\'s experimental Shape Detection (chrome://flags → “Experimental Web Platform features”); it is off here.'; }
  async function loop() {
    if (!st.auto || !fd) { tracking = false; return; }
    try {
      const v = video; if (v.videoWidth) {
        const faces = await fd.detect(v);
        if (faces.length) {
          const W = 384, H = 336, vw = v.videoWidth, vh = v.videoHeight, s = Math.max(W / vw, H / vh), ox = (W - vw * s) / 2, oy = (H - vh * s) / 2, mir = facing === 'user';
          const mx = x => { const X = x * s + ox; return mir ? W - X : X; }, my = y => y * s + oy;
          const f = faces[0], b = f.boundingBox, n = { cx: mx(b.x + b.width / 2), cy: my(b.y + b.height / 2), w: b.width * s, h: b.height * s, eyes: null };
          const eyes = (f.landmarks || []).filter(l => l.type === 'eye').map(l => ({ x: mx(l.locations[0].x), y: my(l.locations[0].y) }));
          if (eyes.length === 2) n.eyes = eyes;
          const o = st.face; st.face = o ? { cx: o.cx + (n.cx - o.cx) * 0.6, cy: o.cy + (n.cy - o.cy) * 0.6, w: o.w + (n.w - o.w) * 0.5, h: o.h + (n.h - o.h) * 0.5, eyes: n.eyes } : n;
        } else st.face = null;
      }
    } catch (e) { }
    setTimeout(loop, 130);
  }
  $$('fxauto').addEventListener('change', () => {
    st.auto = $$('fxauto').checked;
    if (st.auto && supported) { try { fd = fd || new FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); } catch (e) { st.auto = false; $$('fxauto').checked = false; return; } if (!tracking) { tracking = true; loop(); } }
  });
  try { const k = localStorage.getItem('catcam-fx'); if (k && E[k]) st.name = k; } catch (e) { }
  buildGrid(); $$('fxamt').dispatchEvent(new Event('input'));
  return { st, apply, badge, E, m, sample, rebuild: buildGrid, onReset: f => resetHooks.push(f), onSelect: f => selectHooks.push(f) };
})();
