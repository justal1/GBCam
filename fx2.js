'use strict';
// More camera effects: looks made for thermal paper (halftone, engraving, line art, ASCII, emoji mosaic, stencil, maze portrait),
// live distortions (slit-scan, spinning mirror, zoom burst, sparkles, melt, pixel sort), cartoon, AI/empty-room cut-out, face accessories.
(() => {
  const { E, st, m } = Fx;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hyp = Math.hypot;
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const lumOf = (s, W, H) => { const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = (0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2]) / 255; return L; };
  function boxBlur(src, W, H, r) {
    if (r < 1) return Float32Array.from(src);
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
    for (let y = 0; y < H; y++) { let acc = 0; const o = y * W; for (let x = -r; x <= r; x++) acc += src[o + clamp(x, 0, W - 1)]; for (let x = 0; x < W; x++) { tmp[o + x] = acc / n; acc += src[o + clamp(x + r + 1, 0, W - 1)] - src[o + clamp(x - r, 0, W - 1)]; } }
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = acc / n; acc += tmp[clamp(y + r + 1, 0, H - 1) * W + x] - tmp[clamp(y - r, 0, H - 1) * W + x]; } }
    return out;
  }
  function autoLevel(L) { // stretch the 2%..98% range to 0..1
    const h = new Uint32Array(128); for (let i = 0; i < L.length; i++) h[clamp((L[i] * 127) | 0, 0, 127)]++;
    let acc = 0, lo = 0, hi = 127; const a = L.length * 0.02, b = L.length * 0.98;
    for (let i = 0; i < 128; i++) { acc += h[i]; if (acc < a) lo = i + 1; if (acc <= b) hi = i; }
    const l = lo / 127, r = Math.max(l + 0.12, hi / 127), o = new Float32Array(L.length); for (let i = 0; i < L.length; i++) o[i] = clamp((L[i] - l) / (r - l), 0, 1); return o;
  }
  const bw = (s, i, black) => { const v = black ? 0 : 255; s[i] = s[i + 1] = s[i + 2] = v; s[i + 3] = 255; };
  const oc = (() => { let c = null, x = null; return (W, H) => { if (!c || c.width !== W || c.height !== H) { c = document.createElement('canvas'); c.width = W; c.height = H; x = c.getContext('2d', { willReadFrequently: true }); } return x; }; })();
  const toCtx = (s, W, H) => { const x = oc(W, H); x.putImageData(new ImageData(new Uint8ClampedArray(s.buffer, s.byteOffset, s.length), W, H), 0, 0); return x; };
  const fromCtx = (x, s, W, H) => { s.set(x.getImageData(0, 0, W, H).data); };
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const state = {}; // per-effect stateful stuff, cleared on effect change
  Fx.onReset(() => { for (const k of Object.keys(state)) delete state[k]; });

  // ================= print looks (pure black & white) =================
  E.halftone = { group: 'Print looks (made for thermal paper)', label: 'Halftone', icon: '⚪', filter(s, W, H, P) {
    const L = autoLevel(boxBlur(lumOf(s, W, H), W, H, 1)), c = 5 + P.amt * 9, ca = Math.SQRT1_2, sa = Math.SQRT1_2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x * ca + y * sa) / c, v = (-x * sa + y * ca) / c, fu = Math.floor(u) + 0.5, fv = Math.floor(v) + 0.5, cx = (fu * ca - fv * sa) * c, cy = (fu * sa + fv * ca) * c;
      const l = L[clamp(Math.round(cy), 0, H - 1) * W + clamp(Math.round(cx), 0, W - 1)], r = c * 0.74 * Math.sqrt(1 - l);
      bw(s, (y * W + x) * 4, hyp(x - cx, y - cy) < r);
    } } };
  E.engrave = { group: 'Print looks (made for thermal paper)', label: 'Engraving', icon: '🖋', filter(s, W, H, P) {
    const L = autoLevel(boxBlur(lumOf(s, W, H), W, H, 1)), sp = 4 + P.amt * 5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, l = L[i], wave = Math.sin(x * 0.045 + y * 0.012) * 2.4 + Math.sin(x * 0.013) * 3, p = (y + wave + (l - 0.5) * sp * 0.9) / sp, f = p - Math.floor(p);
      let black = f < (1 - l) * 0.95;
      if (l < 0.3) { const q = (x - wave * 0.6 + l * sp) / (sp * 1.15), fq = q - Math.floor(q); if (fq < (0.3 - l) * 2.2) black = true; }
      if (l > 0.94) black = false; bw(s, i * 4, black);
    } } };
  E.lineart = { group: 'Print looks (made for thermal paper)', label: 'Line art', icon: '✏️', filter(s, W, H, P) {
    const L = boxBlur(lumOf(s, W, H), W, H, 1), mag = new Float32Array(W * H), t = 0.62 - P.amt * 0.5;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1], gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1]; mag[i] = hyp(gx, gy); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; bw(s, i * 4, mag[i] > t || (x + 1 < W && mag[i + 1] > t * 1.5) || (y + 1 < H && mag[i + W] > t * 1.5)); } } };
  const ASC = ' .,:;ilftrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
  E.ascii = { group: 'Print looks (made for thermal paper)', label: 'ASCII', icon: '🔤', filter(s, W, H, P) {
    const L = autoLevel(lumOf(s, W, H)), cw = Math.round(6 + P.amt * 6), ch = Math.round(cw * 1.7), x = oc(W, H);
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#000'; x.font = `700 ${ch}px ui-monospace, Menlo, monospace`; x.textBaseline = 'top'; x.textAlign = 'left';
    for (let y = 0; y < H; y += ch) for (let xx = 0; xx < W; xx += cw) {
      let a = 0, n = 0; for (let j = 0; j < ch; j += 3) for (let i = 0; i < cw; i += 3) { a += L[Math.min(H - 1, y + j) * W + Math.min(W - 1, xx + i)]; n++; }
      const k = Math.floor((1 - a / n) * (ASC.length - 1)); if (k > 0) x.fillText(ASC[k], xx, y);
    }
    fromCtx(x, s, W, H); } };
  const EMO = ['⬛', '🌑', '🍇', '🐙', '🍄', '🐻', '🍪', '🌰', '🍩', '🥔', '🍑', '🐥', '🌕', '🍋', '🌼', '⬜'];
  function emojiSet() {
    if (state.emoji) return state.emoji; const out = [], c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d', { willReadFrequently: true });
    for (const e of EMO) { x.fillStyle = '#fff'; x.fillRect(0, 0, 32, 32); x.font = '26px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, 16, 17); const d = x.getImageData(0, 0, 32, 32).data; let a = 0; for (let i = 0; i < d.length; i += 4) a += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; const img = document.createElement('canvas'); img.width = img.height = 32; img.getContext('2d').drawImage(c, 0, 0); out.push({ l: a / (1024 * 255), img }); }
    out.sort((a, b) => a.l - b.l); const lo = out[0].l, hi = out[out.length - 1].l; out.forEach(o => o.n = (o.l - lo) / (hi - lo)); return state.emoji = out;
  }
  E.emoji = { group: 'Print looks (made for thermal paper)', label: 'Emoji mosaic', icon: '🧩', filter(s, W, H, P) {
    const L = autoLevel(boxBlur(lumOf(s, W, H), W, H, 2)), set = emojiSet(), cell = Math.round(13 + P.amt * 16), x = oc(W, H);
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += cell) for (let xx = 0; xx < W; xx += cell) {
      const l = L[Math.min(H - 1, y + (cell >> 1)) * W + Math.min(W - 1, xx + (cell >> 1))]; let best = set[0], bd = 9; for (const o of set) { const d = Math.abs(o.n - l); if (d < bd) { bd = d; best = o; } }
      x.drawImage(best.img, xx, y, cell, cell);
    }
    fromCtx(x, s, W, H); } };
  E.stencil = { group: 'Print looks (made for thermal paper)', label: 'Stencil', icon: '🎭', filter(s, W, H, P) {
    const L = autoLevel(boxBlur(lumOf(s, W, H), W, H, 2 + Math.round(P.amt * 3))), t1 = 0.3 + P.amt * 0.05, t2 = 0.62;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const l = L[y * W + x] + (Math.sin(x * 0.13) * Math.sin(y * 0.11) + Math.sin(x * 0.05 + y * 0.07)) * 0.035; bw(s, (y * W + x) * 4, l < t1 || (l < t2 && (x + y) % 4 === 0)); } } };
  function mazeSegs(W, H, cell) {
    const key = 'maze' + cell; if (state[key]) return state[key];
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), n = cols * rows, r = rng(7); 
    const right = new Uint8Array(n), down = new Uint8Array(n), seen = new Uint8Array(n), stack = [0]; seen[0] = 1;
    while (stack.length) { const i = stack[stack.length - 1], x = i % cols, y = (i / cols) | 0, nb = []; if (x + 1 < cols && !seen[i + 1]) nb.push(0); if (y + 1 < rows && !seen[i + cols]) nb.push(1); if (x > 0 && !seen[i - 1]) nb.push(2); if (y > 0 && !seen[i - cols]) nb.push(3);
      if (!nb.length) { stack.pop(); continue; } const d = nb[(r() * nb.length) | 0]; let j; if (d === 0) { j = i + 1; right[i] = 1; } else if (d === 1) { j = i + cols; down[i] = 1; } else if (d === 2) { j = i - 1; right[j] = 1; } else { j = i - cols; down[j] = 1; } seen[j] = 1; stack.push(j); }
    const segs = []; for (let i = 0; i < n; i++) { const x = (i % cols) * cell, y = ((i / cols) | 0) * cell; if (!right[i]) segs.push([x + cell, y, x + cell, y + cell]); if (!down[i]) segs.push([x, y + cell, x + cell, y + cell]); }
    return state[key] = segs;
  }
  E.mazeportrait = { group: 'Print looks (made for thermal paper)', label: 'Maze portrait', icon: '🌀', filter(s, W, H, P) {
    const cell = Math.round(9 + P.amt * 8), segs = mazeSegs(W, H, cell), L = autoLevel(boxBlur(lumOf(s, W, H), W, H, Math.max(1, cell >> 1))), x = oc(W, H);
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.strokeStyle = '#000'; x.lineCap = 'round';
    for (const g of segs) { const l = L[clamp(((g[1] + g[3]) >> 1), 0, H - 1) * W + clamp(((g[0] + g[2]) >> 1), 0, W - 1)]; if (l > 0.9) continue; x.lineWidth = 0.8 + 4.2 * Math.pow(1 - l, 1.3); x.beginPath(); x.moveTo(g[0], g[1]); x.lineTo(g[2], g[3]); x.stroke(); }
    fromCtx(x, s, W, H); } };

  // ================= live distortions =================
  E.slitscan = { group: 'Live distortions', label: 'Time smear', icon: '⏳', filter(s, W, H, P) {
    const N = 40, buf = state.slit || (state.slit = []); buf.push(new Uint8ClampedArray(s)); if (buf.length > N) buf.shift();
    const span = Math.floor((buf.length - 1) * (0.35 + P.amt * 0.65));
    for (let y = 0; y < H; y++) { const age = Math.floor(span * (y / (H - 1))), f = buf[buf.length - 1 - age]; s.set(f.subarray(y * W * 4, (y + 1) * W * 4), y * W * 4); } } };
  E.mirrorspin = { group: 'Live distortions', label: 'Spinning mirror', icon: '🪩', make: P => { const a = P.t * (0.25 + P.amt * 0.9), nx = Math.cos(a), ny = Math.sin(a); return (x, y) => { const d = (x - P.cx) * nx + (y - P.cy) * ny; if (d > 0) { m.x = x - 2 * d * nx; m.y = y - 2 * d * ny; } }; } };
  E.quadmirror = { group: 'Live distortions', label: 'Four-way mirror', icon: '🔲', make: P => (x, y) => { if (x > P.cx) m.x = 2 * P.cx - x; if (y > P.cy) m.y = 2 * P.cy - y; } };
  E.zoomburst = { group: 'Live distortions', label: 'Hyperspace', icon: '🚀', filter(s, W, H, P) {
    const c = new Uint8ClampedArray(s), N = 10, rmax = hyp(W, H) * 0.5, pulse = 1 + 0.15 * Math.sin(P.t * 5);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - P.cx, dy = y - P.cy, k = P.amt * 0.4 * pulse * Math.min(1, hyp(dx, dy) / rmax * 1.5); let r = 0, g = 0, b = 0;
      for (let j = 0; j < N; j++) { const f = 1 - k * j / (N - 1), sx = clamp(Math.round(P.cx + dx * f), 0, W - 1), sy = clamp(Math.round(P.cy + dy * f), 0, H - 1), o = (sy * W + sx) * 4; r += c[o]; g += c[o + 1]; b += c[o + 2]; }
      const i = (y * W + x) * 4; s[i] = r / N; s[i + 1] = g / N; s[i + 2] = b / N;
    } } };
  E.sparkles = { group: 'Live distortions', label: 'Sparkles & confetti', icon: '🎉', filter(s, W, H, P) {
    const SP = state.sp || (state.sp = { p: [], prev: null, t: P.t, r: Math.random }), dt = clamp(P.t - SP.t, 0.01, 0.08); SP.t = P.t;
    const cur = new Float32Array(W * H); for (let i = 0; i < W * H; i++) cur[i] = 0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2];
    const lumAt = i => cur[i], cap = 6 + Math.round(P.amt * 14); let sp = 0;
    if (SP.prev) for (let k = 0; k < 600 && sp < cap; k++) { const i = (Math.random() * W * H) | 0; if (Math.abs(lumAt(i) - SP.prev[i]) > 30) { SP.p.push(newP(i % W, (i / W) | 0)); sp++; } }
    if (!sp) for (let k = 0; k < 30 && sp < 2; k++) { const i = (Math.random() * W * H) | 0; if (lumAt(i) > 190 && Math.random() < 0.5) { SP.p.push(newP(i % W, (i / W) | 0)); sp++; } }
    function newP(x, y) { const a = Math.random() * 6.283, v = 20 + Math.random() * 70, sparkle = Math.random() < 0.55; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (sparkle ? 0 : 40), life: 0.6 + Math.random() * 0.9, max: 1.5, sparkle, size: (5 + Math.random() * 9) * (0.7 + P.amt * 0.7), rot: Math.random() * 6.283, hue: Math.floor(Math.random() * 360) }; }
    const x = toCtx(s, W, H);
    SP.p = SP.p.filter(q => (q.life -= dt) > 0 && q.y < H + 20);
    for (const q of SP.p) {
      q.x += q.vx * dt; q.y += q.vy * dt; if (!q.sparkle) q.vy += 160 * dt; q.rot += dt * 6; const f = Math.min(1, q.life * 3);
      x.save(); x.translate(q.x, q.y); x.rotate(q.sparkle ? 0 : q.rot); x.lineWidth = 1.6; x.strokeStyle = '#000';
      if (q.sparkle) { const r = q.size * f * (0.75 + 0.25 * Math.sin(q.life * 20)); x.fillStyle = '#fff'; x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); }
      else { x.fillStyle = `hsl(${q.hue},90%,55%)`; const w = q.size * f, h = w * 0.5; x.fillRect(-w / 2, -h / 2, w, h); x.strokeRect(-w / 2, -h / 2, w, h); }
      x.restore();
    }
    SP.prev = cur; fromCtx(x, s, W, H); } };
  E.melt = { group: 'Live distortions', label: 'Melt', icon: '🫠', make: P => { const k = 20 + P.amt * 90; return (x, y) => { const d = (Math.sin(x * 0.06 + 1) + Math.sin(x * 0.17 + 2) + Math.sin(x * 0.023 + P.t * 0.7) + 3) / 6 * k, f = Math.pow(y / P.H, 1.4); m.y = y - d * f; m.x = x + Math.sin(y * 0.05 + P.t * 2) * f * 4 * P.amt; }; } };
  E.pixelsort = { group: 'Live distortions', label: 'Pixel sort', icon: '🎚', filter(s, W, H, P) {
    const c = new Uint8ClampedArray(s), lo = 255 * (0.3 - P.amt * 0.22), hi = 255 * (0.62 + P.amt * 0.35), lum = new Float32Array(W);
    for (let y = 0; y < H; y++) {
      const o = y * W * 4; for (let x = 0; x < W; x++) lum[x] = 0.299 * c[o + x * 4] + 0.587 * c[o + x * 4 + 1] + 0.114 * c[o + x * 4 + 2];
      const maxLen = 24 + Math.round(P.amt * 70); let x = 0; while (x < W) { if (lum[x] < lo || lum[x] > hi) { x++; continue; } let e = x; while (e < W && e - x < maxLen && lum[e] >= lo && lum[e] <= hi) e++;
        if (e - x > 6) { const idx = []; for (let k = x; k < e; k++) idx.push(k); idx.sort((a, b) => lum[a] - lum[b]); for (let k = 0; k < idx.length; k++) { const sI = o + idx[k] * 4, dI = o + (x + k) * 4; s[dI] = c[sI]; s[dI + 1] = c[sI + 1]; s[dI + 2] = c[sI + 2]; } }
        x = e; } } } };
  E.cartoon = { group: 'Live distortions', label: 'Cartoon', icon: '💥', filter(s, W, H, P) {
    const n = W * H, ch = [0, 1, 2].map(k => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = s[i * 4 + k]; return boxBlur(a, W, H, 2); }), L = new Float32Array(n), levels = 5;
    for (let i = 0; i < n; i++) L[i] = (0.299 * ch[0][i] + 0.587 * ch[1][i] + 0.114 * ch[2][i]) / 255;
    const Lb = boxBlur(L, W, H, 1), t = 0.3 - P.amt * 0.2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, l = Math.max(0.02, L[i]), q = (Math.floor(l * levels * 0.999) + 0.5) / levels, f = q / l, o = i * 4;
      s[o] = clamp(ch[0][i] * f * 1.04, 0, 255); s[o + 1] = clamp(ch[1][i] * f * 1.04, 0, 255); s[o + 2] = clamp(ch[2][i] * f * 1.04, 0, 255); s[o + 3] = 255;
    }
    const e = new Uint8Array(n);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, gx = -Lb[i - W - 1] - 2 * Lb[i - 1] - Lb[i + W - 1] + Lb[i - W + 1] + 2 * Lb[i + 1] + Lb[i + W + 1], gy = -Lb[i - W - 1] - 2 * Lb[i - W] - Lb[i - W + 1] + Lb[i + W - 1] + 2 * Lb[i + W] + Lb[i + W + 1]; if (hyp(gx, gy) > t) e[i] = 1; }
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const i = y * W + x; if (e[i] || e[i + 1] || e[i + W]) { s[i * 4] = s[i * 4 + 1] = s[i * 4 + 2] = 0; } } } };

  // ================= camera-aware: cut-out =================
  const CO = { method: 'ai', bg: 'white', ref: null, capture: false, ml: null, mlState: 'idle', mask: null, lastRun: 0, invert: null, W: 0, H: 0 };
  Fx.cutout = CO;
  async function initML() {
    if (CO.mlState !== 'idle') return; CO.mlState = 'loading'; setStatus('Loading AI cut-out model (about 250 KB)…');
    try {
      const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14', vision = await import(base + '/vision_bundle.mjs'), fs = await vision.FilesetResolver.forVisionTasks(base + '/wasm');
      const opts = d => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', delegate: d }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
      try { CO.ml = await vision.ImageSegmenter.createFromOptions(fs, opts('GPU')); } catch (e) { CO.ml = await vision.ImageSegmenter.createFromOptions(fs, opts('CPU')); }
      CO.mlState = 'ready'; setStatus('AI cut-out ready.');
    } catch (e) { CO.mlState = 'failed'; setStatus('AI model could not load (' + (e.message || e) + '). Use “Empty room” instead.'); if (typeof log === 'function') log('cutout ML failed', e.message || e); }
  }
  function runML(s, W, H) {
    const now = performance.now(); if (CO.mlState !== 'ready' || now - CO.lastRun < 70) return; CO.lastRun = now;
    try {
      const x = toCtx(s, W, H), res = CO.ml.segmentForVideo(x.canvas, now), mk = res.confidenceMasks[0], d = mk.getAsFloat32Array(), mw = mk.width, mh = mk.height;
      const out = CO.mask && CO.W === W && CO.H === H ? CO.mask : new Float32Array(W * H); // resample to W x H
      for (let y = 0; y < H; y++) { const sy = Math.min(mh - 1, (y * mh / H) | 0); for (let xx = 0; xx < W; xx++) out[y * W + xx] = d[sy * mw + Math.min(mw - 1, (xx * mw / W) | 0)]; }
      try { mk.close(); } catch (e) { } try { res.close(); } catch (e) { }
      if (CO.invert === null) { let c = 0, b = 0, nc = 0, nb = 0; for (let y = 0; y < H; y += 4) for (let xx = 0; xx < W; xx += 4) { const v = out[y * W + xx], inC = xx > W * 0.3 && xx < W * 0.7 && y > H * 0.25; if (inC) { c += v; nc++; } else if (xx < W * 0.12 || xx > W * 0.88) { b += v; nb++; } } CO.invert = (b / nb) > (c / nc); }
      if (CO.invert) for (let i = 0; i < out.length; i++) out[i] = 1 - out[i];
      CO.mask = out; CO.W = W; CO.H = H;
    } catch (e) { CO.mlState = 'failed'; setStatus('AI cut-out stopped: ' + e.message); }
  }
  function keyMask(s, W, H, P) { // difference against the captured empty background
    const r = CO.ref, n = W * H, D = new Float32Array(n);
    for (let i = 0; i < n; i++) D[i] = (Math.abs(s[i * 4] - r[i * 4]) + Math.abs(s[i * 4 + 1] - r[i * 4 + 1]) + Math.abs(s[i * 4 + 2] - r[i * 4 + 2])) / 765;
    const B = boxBlur(D, W, H, 3), t = 0.05 + (1 - P.amt) * 0.07, M = new Float32Array(n); for (let i = 0; i < n; i++) M[i] = smooth(t, t * 1.8, B[i]);
    const C = boxBlur(boxBlur(M, W, H, 4), W, H, 4); for (let i = 0; i < n; i++) M[i] = smooth(0.35, 0.65, C[i]); return M;
  }
  const bgPix = (mode, x, y) => { // -> 0 black, 1 white
    if (mode === 'dots') { const dx = (x % 9) - 4, dy = (y % 9) - 4; return dx * dx + dy * dy < 5 ? 0 : 1; }
    if (mode === 'stripes') return ((x + y) % 10) < 3 ? 0 : 1;
    if (mode === 'checks') return (((x / 14) | 0) + ((y / 14) | 0)) & 1 ? 0 : 1;
    if (mode === 'black') return 0; return 1;
  };
  E.cutout = { group: 'Camera-aware', label: 'Cut-out', icon: '✂️', filter(s, W, H, P) {
    if (CO.capture) { CO.ref = new Uint8ClampedArray(s); CO.capture = false; setStatus('Empty background captured.'); toast && toast('Background captured'); }
    let M = null;
    if (CO.method === 'ai') { if (CO.mlState === 'idle') initML(); runML(s, W, H); if (CO.mask && CO.W === W) { M = Float32Array.from(CO.mask); for (let i = 0; i < M.length; i++) M[i] = smooth(0.3, 0.7, M[i]); } }
    else if (CO.ref) M = keyMask(s, W, H, P);
    if (!M) return;
    Fx.lastMask = M;
    let ring = null; if (CO.bg === 'sticker') { const D = boxBlur(M, W, H, 5), D2 = boxBlur(M, W, H, 9); ring = new Uint8Array(W * H); for (let i = 0; i < ring.length; i++) { if (M[i] < 0.5 && D[i] > 0.04) ring[i] = 1; else if (M[i] < 0.5 && D2[i] > 0.03 && D2[i] <= 0.04) ring[i] = 2; } }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4, a = M[i]; if (a >= 0.999) continue;
      const mode = CO.bg === 'sticker' ? 'white' : CO.bg, v = bgPix(mode, x, y) * 255;
      let r = s[o] * a + v * (1 - a), g = s[o + 1] * a + v * (1 - a), b = s[o + 2] * a + v * (1 - a);
      if (ring && ring[i] === 1) r = g = b = 0; else if (ring && ring[i] === 2 && ((x + y) >> 2) % 2) r = g = b = 0;
      s[o] = r; s[o + 1] = g; s[o + 2] = b;
    } } };
  // ---- cut-out controls (shown only while the effect is selected) ----
  const panel = document.createElement('div'); panel.id = 'fxcut'; panel.hidden = true;
  panel.innerHTML = `<div class="sub" style="margin-top:12px">Cut-out: removes the background. “AI” needs internet once to load a small model; “Empty room” needs no internet: capture the scene without you in it, then step back in.</div>
    <div class="row"><select id="cutmethod"><option value="ai">AI person cut-out</option><option value="key">Empty room (no internet)</option></select><select id="cutbg"><option value="white">White background</option><option value="sticker">Sticker outline</option><option value="dots">Dots</option><option value="stripes">Stripes</option><option value="checks">Checks</option><option value="black">Black</option></select></div>
    <div class="row"><button id="cutcap" type="button">📷 Capture empty background (3 s)</button></div><div class="sub" id="cutstat"></div>`;
  const hint = document.getElementById('fxhint'); hint.parentNode.insertBefore(panel, hint.nextSibling);
  const setStatus = t => { const e = document.getElementById('cutstat'); if (e) e.textContent = t; };
  document.getElementById('cutmethod').onchange = e => { CO.method = e.target.value; if (CO.method === 'ai') initML(); setStatus(CO.method === 'key' && !CO.ref ? 'Tap “Capture empty background”, then step back in.' : ''); };
  document.getElementById('cutbg').onchange = e => { CO.bg = e.target.value; };
  document.getElementById('cutcap').onclick = () => { let n = 3; const tick = () => { if (n > 0) { setStatus('Step out of the picture… ' + n--); setTimeout(tick, 1000); } else { CO.capture = true; } }; tick(); };
  Fx.onSelect(k => { panel.hidden = k !== 'cutout'; if (k === 'cutout' && CO.method === 'ai') initML(); });

  // ================= face accessories =================
  const face = P => { const es = P.eyes.slice().sort((a, b) => a.x - b.x), e0 = es[0], e1 = es[1] || es[0], R = P.R; return { cx: P.cx, cy: P.cy, R, e0, e1, fy: (e0.y + e1.y) / 2, ang: Math.atan2(e1.y - e0.y, (e1.x - e0.x) || 1), top: P.cy - R * 1.1, lw: Math.max(2.5, R * 0.05) }; };
  const accessory = (label, icon, draw) => ({ group: 'Face accessories (best with “Follow my face”)', label, icon, filter(s, W, H, P) { const x = toCtx(s, W, H), f = face(P); x.save(); x.lineJoin = x.lineCap = 'round'; x.strokeStyle = '#000'; x.lineWidth = f.lw; draw(x, f); x.restore(); fromCtx(x, s, W, H); } });
  E.shades = accessory('Shades', '🕶️', (x, f) => {
    const R = f.R; x.fillStyle = '#111';
    for (const e of [f.e0, f.e1]) { x.save(); x.translate(e.x, e.y); x.rotate(f.ang); x.beginPath(); x.ellipse(0, 0, R * 0.36, R * 0.25, 0, 0, 7); x.fill(); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = f.lw * 0.7; x.beginPath(); x.moveTo(-R * 0.2, -R * 0.1); x.lineTo(-R * 0.06, -R * 0.17); x.stroke(); x.restore(); }
    x.beginPath(); x.moveTo(f.e0.x + R * 0.34, f.e0.y); x.lineTo(f.e1.x - R * 0.34, f.e1.y); x.stroke();
    x.beginPath(); x.moveTo(f.e0.x - R * 0.36, f.e0.y); x.lineTo(f.e0.x - R * 0.75, f.e0.y - R * 0.04); x.moveTo(f.e1.x + R * 0.36, f.e1.y); x.lineTo(f.e1.x + R * 0.75, f.e1.y - R * 0.04); x.stroke(); });
  E.crown = accessory('Crown', '👑', (x, f) => {
    const w = f.R * 1.2, h = f.R * 0.75, yb = f.top + f.R * 0.28; x.save(); x.translate(f.cx, yb); x.fillStyle = '#f2b705';
    x.beginPath(); [[-w / 2, 0], [-w / 2, -h], [-w / 4, -h * 0.5], [0, -h * 1.15], [w / 4, -h * 0.5], [w / 2, -h], [w / 2, 0]].forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0], p[1])); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(-w / 2, -h * 0.2); x.lineTo(w / 2, -h * 0.2); x.stroke();
    x.fillStyle = '#e63946'; for (const [px, py] of [[-w / 2, -h], [0, -h * 1.15], [w / 2, -h]]) { x.beginPath(); x.arc(px, py, f.R * 0.07, 0, 7); x.fill(); x.stroke(); }
    x.fillStyle = '#fff'; for (const px of [-w / 4, 0, w / 4]) { x.beginPath(); x.arc(px, -h * 0.02 - h * 0.1, f.R * 0.045, 0, 7); x.fill(); x.stroke(); } x.restore(); });
  E.catface = accessory('Cat face', '🐱', (x, f) => {
    const R = f.R, ny = f.fy + R * 0.42;
    for (const sd of [-1, 1]) { x.fillStyle = '#2b2b2b'; x.beginPath(); x.moveTo(f.cx + sd * R * 0.95, f.top + R * 0.5); x.lineTo(f.cx + sd * R * 0.8, f.top - R * 0.4); x.lineTo(f.cx + sd * R * 0.25, f.top + R * 0.12); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#ff9db8'; x.beginPath(); x.moveTo(f.cx + sd * R * 0.78, f.top + R * 0.28); x.lineTo(f.cx + sd * R * 0.72, f.top - R * 0.12); x.lineTo(f.cx + sd * R * 0.42, f.top + R * 0.12); x.closePath(); x.fill(); }
    x.fillStyle = '#ff7aa8'; x.beginPath(); x.moveTo(f.cx - R * 0.13, ny); x.lineTo(f.cx + R * 0.13, ny); x.lineTo(f.cx, ny + R * 0.11); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(f.cx, ny + R * 0.11); x.lineTo(f.cx, ny + R * 0.2); x.moveTo(f.cx - R * 0.18, ny + R * 0.3); x.quadraticCurveTo(f.cx, ny + R * 0.18, f.cx, ny + R * 0.2); x.quadraticCurveTo(f.cx, ny + R * 0.18, f.cx + R * 0.18, ny + R * 0.3); x.stroke();
    x.lineWidth = Math.max(2, f.lw * 0.7); for (const sd of [-1, 1]) for (const k of [-1, 0, 1]) { x.beginPath(); x.moveTo(f.cx + sd * R * 0.28, ny + R * 0.08 + k * R * 0.04); x.lineTo(f.cx + sd * R * 1.05, ny + R * 0.08 + k * R * 0.17); x.stroke(); } });
  E.moustache = accessory('Moustache', '🥸', (x, f) => {
    const R = f.R, y0 = f.fy + R * 0.62, cx = f.cx; x.fillStyle = '#111'; x.lineWidth = f.lw * 0.5;
    for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(cx, y0 - R * 0.04); x.bezierCurveTo(cx + sd * R * 0.18, y0 - R * 0.17, cx + sd * R * 0.52, y0 - R * 0.12, cx + sd * R * 0.66, y0 + R * 0.12); x.bezierCurveTo(cx + sd * R * 0.42, y0 + R * 0.02, cx + sd * R * 0.16, y0 + R * 0.12, cx, y0 + R * 0.1); x.closePath(); x.fill(); x.stroke(); } });
  E.partyhat = accessory('Party hat', '🥳', (x, f) => {
    const R = f.R, bx = f.cx + R * 0.05, by = f.top + R * 0.4, ax = f.cx + R * 0.2, ay = f.top - R * 1.0, hw = R * 0.58;
    x.save(); x.beginPath(); x.moveTo(bx - hw, by); x.lineTo(ax, ay); x.lineTo(bx + hw, by); x.closePath(); x.fillStyle = '#ff4f9a'; x.fill(); x.clip();
    x.fillStyle = '#fff'; for (let k = 0; k < 4; k++) { const t = 0.2 + k * 0.22; x.beginPath(); x.moveTo(bx - hw * 1.2, by + (ay - by) * t + R * 0.1); x.lineTo(bx + hw * 1.2, by + (ay - by) * t - R * 0.1); x.lineTo(bx + hw * 1.2, by + (ay - by) * t - R * 0.1 + R * 0.09); x.lineTo(bx - hw * 1.2, by + (ay - by) * t + R * 0.1 + R * 0.09); x.closePath(); x.fill(); } x.restore();
    x.beginPath(); x.moveTo(bx - hw, by); x.lineTo(ax, ay); x.lineTo(bx + hw, by); x.closePath(); x.stroke(); x.beginPath(); x.ellipse(bx, by, hw, R * 0.06, 0, 0, 7); x.fillStyle = '#ffd23f'; x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(ax, ay, R * 0.12, 0, 7); x.fill(); x.stroke(); });

  Fx.util = { boxBlur, lumOf, autoLevel };
  Fx.rebuild();
  try { const k = localStorage.getItem('catcam-fx'); if (k && E[k]) { st.name = k; Fx.badge(); document.querySelectorAll('#fxgrid button').forEach(b => b.className = b.dataset.k === k ? 'pri' : ''); if (k === 'cutout') panel.hidden = false; } } catch (e) { }
})();
