'use strict';
// "Game Boy Color camera" look: 128x112 colour image, 8x8 tiles each assigned one of 8 palettes of 4 colours (15-bit RGB), ordered-dithered.
const GBC = (() => {
  const TX = 16, TY = 14, NP = 8, B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const B8 = (() => { const m = [], q = [0, 2, 3, 1]; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) m[y * 8 + x] = 4 * B4[(y & 3) * 4 + (x & 3)] + q[((y >> 2) & 1) * 2 + ((x >> 2) & 1)]; return m; })();
  let W = 128, H = 112;
  let f = new Float32Array(128 * 112 * 3), luma = new Float32Array(128 * 112); const tileP = new Uint8Array(TX * TY);
  const out = document.createElement('canvas'); out.width = 128; out.height = 112;
  let ox = out.getContext('2d'), oimg = ox.createImageData(128, 112);
  function ensure(w, h) { if (w === W && h === H) return; W = w; H = h; f = new Float32Array(w * h * 3); luma = new Float32Array(w * h); out.width = w; out.height = h; ox = out.getContext('2d'); oimg = ox.createImageData(w, h); }
  let pals = null;

  function prep(rgba, c) {
    const n = W * H;
    for (let i = 0; i < n; i++) { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]; f[i * 3] = r; f[i * 3 + 1] = g; f[i * 3 + 2] = b; luma[i] = 0.299 * r + 0.587 * g + 0.114 * b; }
    let lo = 0, hi = 255;
    if (c.auto) {
      const h = new Uint32Array(256); for (let i = 0; i < n; i++) h[Math.min(255, luma[i] | 0)]++;
      let a = 0; for (let i = 0; i < 256; i++) { a += h[i]; if (a >= n * 0.02) { lo = i; break; } }
      a = 0; for (let i = 255; i >= 0; i--) { a += h[i]; if (a >= n * 0.02) { hi = i; break; } }
      if (hi - lo < 20) { lo = 0; hi = 255; }
    }
    const sc = 255 / (hi - lo), sh = c.sharpen * 0.5, con = c.contrast, sat = c.sat, br = c.brightness * 255;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let e = 0;
      if (sh > 0) { let s = 0, k = 0; for (let j = -1; j <= 1; j++) { const yy = y + j; if (yy < 0 || yy >= H) continue; for (let q = -1; q <= 1; q++) { const xx = x + q; if (xx < 0 || xx >= W) continue; s += luma[yy * W + xx]; k++; } } e = sh * (luma[i] - s / k); }
      const L = (luma[i] - lo) * sc;
      for (let ch = 0; ch < 3; ch++) {
        let v = (f[i * 3 + ch] - lo) * sc; v = L + (v - L) * sat; v = (v - 128) * con + 128 + br + e;
        f[i * 3 + ch] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  // k-means on points (Float32Array n*3). init: array of k colours or null (seeded by luma quantiles)
  function kmeans(pts, k, init, iters) {
    const n = pts.length / 3; let cs;
    if (init) cs = init.map(c => c.slice());
    else {
      const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => (pts[a * 3] * 0.299 + pts[a * 3 + 1] * 0.587 + pts[a * 3 + 2] * 0.114) - (pts[b * 3] * 0.299 + pts[b * 3 + 1] * 0.587 + pts[b * 3 + 2] * 0.114));
      cs = []; for (let j = 0; j < k; j++) { const p = ord[Math.min(n - 1, Math.floor((j + 0.5) / k * n))]; cs.push([pts[p * 3], pts[p * 3 + 1], pts[p * 3 + 2]]); }
    }
    const asg = new Uint8Array(n);
    for (let it = 0; it < iters; it++) {
      const s = Array.from({ length: k }, () => [0, 0, 0, 0]);
      for (let i = 0; i < n; i++) {
        const r = pts[i * 3], g = pts[i * 3 + 1], b = pts[i * 3 + 2]; let best = 0, bd = 1e12;
        for (let q = 0; q < k; q++) { const c = cs[q], dr = r - c[0], dg = g - c[1], db = b - c[2], d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = q; } }
        asg[i] = best; const a = s[best]; a[0] += r; a[1] += g; a[2] += b; a[3]++;
      }
      for (let q = 0; q < k; q++) if (s[q][3]) cs[q] = [s[q][0] / s[q][3], s[q][1] / s[q][3], s[q][2] / s[q][3]];
    }
    return { c: cs, a: asg };
  }
  function tilePts(list) {
    const pts = new Float32Array(list.length * 64 * 3); let o = 0;
    for (const t of list) { const tx = t % TX, ty = (t / TX) | 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const p = ((ty * 8 + j) * W + tx * 8 + i) * 3; pts[o++] = f[p]; pts[o++] = f[p + 1]; pts[o++] = f[p + 2]; } }
    return pts;
  }
  function tileErr(t, pal) {
    const tx = t % TX, ty = (t / TX) | 0; let e = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const p = ((ty * 8 + j) * W + tx * 8 + i) * 3, r = f[p], g = f[p + 1], b = f[p + 2]; let bd = 1e12;
      for (let k = 0; k < 4; k++) { const c = pal[k], dr = r - c[0], dg = g - c[1], db = b - c[2], d = dr * dr + dg * dg + db * db; if (d < bd) bd = d; }
      e += bd;
    }
    return e;
  }
  function fit(fresh) {
    const nt = TX * TY, all = Array.from({ length: nt }, (_, i) => i);
    if (fresh || !pals) {
      const tm = new Float32Array(nt * 3);
      for (let t = 0; t < nt; t++) { const tx = t % TX, ty = (t / TX) | 0; let r = 0, g = 0, b = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const p = ((ty * 8 + j) * W + tx * 8 + i) * 3; r += f[p]; g += f[p + 1]; b += f[p + 2]; } tm[t * 3] = r / 64; tm[t * 3 + 1] = g / 64; tm[t * 3 + 2] = b / 64; }
      const cl = kmeans(tm, NP, null, 4); pals = [];
      for (let p = 0; p < NP; p++) { const mem = all.filter(t => cl.a[t] === p); pals.push(kmeans(tilePts(mem.length ? mem : all), 4, null, 3).c); tileP.fill(0); }
      for (let t = 0; t < nt; t++) tileP[t] = cl.a[t];
    }
    for (let it = 0; it < (fresh ? 3 : 1); it++) {
      for (let t = 0; t < nt; t++) { let best = 0, bd = 1e12; for (let p = 0; p < NP; p++) { const e = tileErr(t, pals[p]); if (e < bd) { bd = e; best = p; } } tileP[t] = best; }
      for (let p = 0; p < NP; p++) { const mem = all.filter(t => tileP[t] === p); if (mem.length) pals[p] = kmeans(tilePts(mem), 4, pals[p], 2).c; }
    }
    for (const pal of pals) for (const c of pal) for (let k = 0; k < 3; k++) c[k] = Math.round(Math.max(0, Math.min(255, c[k])) / 255 * 31) * 255 / 31; // 15-bit colour
  }
  function render() {
    const d = oimg.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const pal = pals[tileP[(y >> 3) * TX + (x >> 3)]], i = y * W + x, off = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * 40;
      const r = f[i * 3] + off, g = f[i * 3 + 1] + off, b = f[i * 3 + 2] + off; let best = 0, bd = 1e12;
      for (let k = 0; k < 4; k++) { const c = pal[k], dr = r - c[0], dg = g - c[1], db = b - c[2], dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = k; } }
      const c = pal[best], o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    ox.putImageData(oimg, 0, 0);
  }
  return {
    // rgba: Uint8ClampedArray 128x112x4; c: cfg(); fresh: refit palettes from scratch; ctx: optional 2d context to draw upscaled
    draw(rgba, c, fresh, ctx) {
      ensure(128, 112); prep(rgba, c); fit(fresh); render();
      if (ctx) { ctx.imageSmoothingEnabled = false; ctx.drawImage(out, 0, 0, ctx.canvas.width, ctx.canvas.height); }
    },
    // colour photo dithered to levels^3 colours (Bayer 8x8 or Floyd-Steinberg) at any resolution
    dither(rgba, w, h, c, ctx) {
      ensure(w, h); prep(rgba, c);
      const L = c.levels, step = 255 / (L - 1), d = oimg.data, cl = v => v < 0 ? 0 : v > 255 ? 255 : v;
      if (c.cdm === 'fs') {
        const e = Float32Array.from(f);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x;
          for (let ch = 0; ch < 3; ch++) {
            const k = i * 3 + ch, old = e[k], q = cl(Math.round(old / step) * step); d[i * 4 + ch] = q; const er = old - q;
            if (x + 1 < w) e[k + 3] += er * 7 / 16;
            if (y + 1 < h) { if (x > 0) e[k + w * 3 - 3] += er * 3 / 16; e[k + w * 3] += er * 5 / 16; if (x + 1 < w) e[k + w * 3 + 3] += er / 16; }
          }
          d[i * 4 + 3] = 255;
        }
      } else {
        const nz = c.cdm === 'noise';
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x, off = (nz ? BLUE[(y & 63) * 64 + (x & 63)] - 0.5 : (B8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 - 0.5) * step;
          for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = cl(Math.round((f[i * 3 + ch] + off) / step) * step);
          d[i * 4 + 3] = 255;
        }
      }
      ox.putImageData(oimg, 0, 0);
      if (ctx) { ctx.imageSmoothingEnabled = false; ctx.drawImage(out, 0, 0, ctx.canvas.width, ctx.canvas.height); }
    },
    reset() { pals = null; }
  };
})();
