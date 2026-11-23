'use strict';
// Origami to fold from the printer paper. Everything is drawn to suit a 48 mm wide roll (384 dots, 8 per mm):
// strips for lucky stars and a paper snake, and small squares and rectangles for a dart, a pinwheel and a snowflake.
// Crease key: ---- valley fold   -.-. mountain fold   solid line = cut.
const Origami = (() => {
  const W = 384, cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineCap = x.lineJoin = 'round'; return [c, x]; };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const STY = { valley: { d: [12, 7], w: 2.6 }, mountain: { d: [16, 5, 3, 5], w: 2.6 }, cut: { d: [], w: 3 }, faint: { d: [3, 5], w: 1.5 } };
  function ln(x, kind, x1, y1, x2, y2) { const s = STY[kind]; x.save(); if (kind === 'cut') { x.lineWidth = 9; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); x.strokeStyle = '#000'; } x.setLineDash(s.d); x.lineWidth = s.w; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); x.restore(); }
  const label = (x, t, px, py, size = 18, bold = true) => { x.save(); x.font = `${bold ? 800 : 500} ${size}px system-ui, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, px, py); x.restore(); };
  const bubble = (x, n, px, py) => { x.save(); x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, 14, 0, 7); x.fill(); x.lineWidth = 2.5; x.stroke(); x.restore(); label(x, String(n), px, py + 1, 17); };
  function key() { const [c, x] = cv(W, 62); ln(x, 'valley', 8, 14, 70, 14); label(x, 'valley fold', 164, 14, 15, false); ln(x, 'mountain', 205, 14, 258, 14); label(x, 'mountain fold', 322, 14, 14, false); ln(x, 'cut', 8, 44, 70, 44); label(x, 'cut here', 134, 44, 15, false); return c; }
  const steps = (title, list) => { const [c, x] = cv(W, 40 + list.length * 46 + 12); label(x, title.toUpperCase(), W / 2, 18, 20); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 36); x.lineTo(W - 8, 36); x.stroke(); let y = 40; for (const [i, t] of list.entries()) { bubble(x, i + 1, 22, y + 22); x.font = '500 15px system-ui, Arial, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; const words = t.split(' '); let line = '', lines = []; for (const w of words) { const test = line ? line + ' ' + w : w; if (x.measureText(test).width > W - 60 && line) { lines.push(line); line = w; } else line = test; } lines.push(line); lines.slice(0, 2).forEach((l, k) => x.fillText(l, 48, y + (lines.length > 1 ? 13 + k * 19 : 22))); y += 46; } return c; };
  const stack = parts => { let h = 0; for (const p of parts) h += p.height; const [c, x] = cv(W, h); let y = 0; for (const p of parts) { x.drawImage(p, 0, y); y += p.height; } return c; };
  const gap = () => { const [c, x] = cv(W, 22); x.save(); x.setLineDash([7, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 11); x.lineTo(W - 8, 11); x.stroke(); x.restore(); label(x, '✂', 20, 9, 14); return c; };
  const title = t => { const [c, x] = cv(W, 44); label(x, t, W / 2, 22, 26); return c; };

  // ---------- models ----------
  function dart() { // paper aeroplane from a 48 x 72 mm sheet
    const H = 576, [c, x] = cv(W, H), cx = W / 2; x.lineWidth = 3; x.strokeRect(5, 5, W - 10, H - 10);
    ln(x, 'valley', cx, 8, cx, H - 8);
    ln(x, 'valley', cx, 8, 8, cx + 8); ln(x, 'valley', cx, 8, W - 8, cx + 8);
    ln(x, 'valley', cx, 8, 8, 463); ln(x, 'valley', cx, 8, W - 8, 463);
    ln(x, 'mountain', cx, 8, 100, H - 8); ln(x, 'mountain', cx, 8, W - 100, H - 8);
    bubble(x, 1, cx + 22, 330); bubble(x, 2, 70, 150); bubble(x, 2, W - 70, 150); bubble(x, 3, 52, 380); bubble(x, 3, W - 52, 380); bubble(x, 5, 122, 520); bubble(x, 5, W - 122, 520);
    return stack([title('PAPER DART'), c, gap(), key(), steps('How to fold', ['Fold in half down the middle, then open it again.', 'Fold both top corners in to the middle crease.', 'Fold the two slanted edges in to the middle again.', 'Fold the whole thing in half along the middle, bumps on the outside.', 'Fold each wing down along the line from the nose, and throw!'])]);
  }
  function stars(o) { // lucky-star strips: three strips side by side
    const L = o.length === 'long' ? 2400 : 1600, [c, x] = cv(W, L), sw = 116, xs = [8, 134, 260], pat = o.pattern, msg = (o.message || '').trim(), rand = rng(7);
    for (const x0 of xs) {
      x.save(); x.lineWidth = 3; x.strokeRect(x0, 4, sw, L - 8); x.beginPath(); x.rect(x0 + 2, 6, sw - 4, L - 12); x.clip();
      if (pat === 'stripes') { x.lineWidth = 5; for (let k = -sw; k < L; k += 22) { x.beginPath(); x.moveTo(x0 - 4, k + sw * 0.5); x.lineTo(x0 + sw + 4, k); x.stroke(); } }
      else if (pat === 'dots') { for (let yy = 30; yy < L - 20; yy += 26) for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(x0 + 18 + k * 28 + (Math.round(yy / 26) % 2 ? 14 : 0), yy, 5, 0, 7); x.fill(); } }
      else if (pat === 'zigzag') { x.lineWidth = 4; for (let yy = 20; yy < L - 20; yy += 24) { x.beginPath(); x.moveTo(x0 + 6, yy); for (let k = 1; k <= 6; k++) x.lineTo(x0 + 6 + k * (sw - 12) / 6, yy + (k % 2 ? -10 : 0)); x.stroke(); } }
      else if (pat === 'hearts') { for (let yy = 34; yy < L - 20; yy += 40) for (let k = 0; k < 3; k++) { const hx = x0 + 22 + k * 36 + (Math.round(yy / 40) % 2 ? 16 : 0), s = 0.5; x.beginPath(); for (let i = 0; i <= 30; i++) { const t = i / 30 * Math.PI * 2, px = 16 * Math.pow(Math.sin(t), 3), py = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); x[i ? 'lineTo' : 'moveTo'](hx + px * s, yy - py * s); } x.closePath(); x.fill(); } }
      if (msg) { x.save(); x.fillStyle = '#fff'; for (let yy = 150; yy < L - 150; yy += 300) { x.fillRect(x0 + 30, yy, 56, 230); } x.fillStyle = '#000'; x.font = '800 22px system-ui, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; for (let yy = 150; yy < L - 150; yy += 300) { x.save(); x.translate(x0 + sw / 2, yy + 115); x.rotate(Math.PI / 2); x.fillText(msg.slice(0, 22), 0, 0); x.restore(); } x.restore(); }
      x.restore();
      x.fillStyle = '#fff'; x.fillRect(x0 + 20, 12, sw - 40, 56); x.fillStyle = '#000'; label(x, '▼ START', x0 + sw / 2, 40, 17);
      x.fillStyle = '#fff'; x.fillRect(x0 + 20, L - 70, sw - 40, 56); x.fillStyle = '#000'; label(x, 'end', x0 + sw / 2, L - 42, 17, false);
    }
    return stack([title('LUCKY STARS'), c, gap(), key(), steps('How to fold', ['Cut out the three strips. Write a wish on the plain side if you like.', 'Tie a loose, flat knot at the START end and press it flat: a pentagon!', 'Fold the long end over the pentagon, tuck it in, and wrap it round the edges.', 'Keep wrapping until only a stub is left. Tuck the stub in.', 'Pinch every point of the star in towards the middle so it puffs up.'])]);
  }
  function pinwheel(o) { // a pinwheel from a 48 mm square
    const S = 384, [c, x] = cv(S, S), cx = S / 2, m = 5; x.save(); x.beginPath(); x.rect(m, m, S - 2 * m, S - 2 * m); x.clip();
    if (o.pattern === 'stripes') { x.lineWidth = 7; for (let k = 0; k < S; k += 22) { x.beginPath(); x.moveTo(m, S - k); x.lineTo(S - m, -k + 0); x.stroke(); } } else if (o.pattern === 'rings') { x.lineWidth = 6; for (let r = 24; r < 290; r += 26) { x.beginPath(); x.arc(cx, cx, r, 0, 7); x.stroke(); } } else if (o.pattern === 'dots') { for (let yy = 22; yy < S; yy += 36) for (let xx = 22; xx < S; xx += 36) { x.beginPath(); x.arc(xx + ((yy / 36 | 0) % 2 ? 18 : 0), yy, 6, 0, 7); x.fill(); } }
    x.restore(); x.lineWidth = 3; x.strokeRect(m, m, S - 2 * m, S - 2 * m);
    const f = 0.62; // cut about 62% of the way to the middle
    for (const [px, py] of [[m, m], [S - m, m], [S - m, S - m], [m, S - m]]) ln(x, 'cut', px, py, px + (cx - px) * f, py + (cx - py) * f);
    x.fillStyle = '#fff'; for (const [px, py] of [[84, 30], [S - 30, 84], [S - 84, S - 30], [30, S - 84]]) { x.beginPath(); x.arc(px, py, 17, 0, 7); x.fill(); x.lineWidth = 3; x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill(); x.fillStyle = '#fff'; }
    x.beginPath(); x.arc(cx, cx, 11, 0, 7); x.fill(); x.lineWidth = 3; x.stroke();
    return stack([title('PINWHEEL'), c, gap(), key(), steps('How to fold', ['Cut along the four solid lines from the corners. Stop at the circles near the middle!', 'Take each corner that has a ● on it and bend it to the middle (do not crease it).', 'Hold all four corners together over the centre circle.', 'Push a pin through all of them and into the end of a pencil. Blow!'])]);
  }
  function snowflake(o) { // fold-and-cut snowflake
    const S = 384, [c, x] = cv(S, S), cx = S / 2, R = 186, rand = rng(o.seed || 1);
    x.lineWidth = 3; x.beginPath(); x.arc(cx, cx, R, 0, 7); x.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 - Math.PI / 2; ln(x, k % 2 ? 'mountain' : 'valley', cx, cx, cx + R * Math.cos(a), cx + R * Math.sin(a)); }
    // sample cuts inside the first sector (between the 12 o'clock and 2 o'clock folds)
    const a0 = -Math.PI / 2, a1 = a0 + Math.PI / 3, pt = (r, t) => [cx + r * Math.cos(a0 + t * (a1 - a0)), cx + r * Math.sin(a0 + t * (a1 - a0))];
    x.save(); x.lineWidth = 2.6; x.setLineDash([]); const poly = pts => { x.beginPath(); pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0], p[1])); x.closePath(); x.stroke(); };
    for (let i = 0; i < 4; i++) { const r = 40 + i * 36 + rand() * 12, w = 0.1 + rand() * 0.18, d = 12 + rand() * 18; poly([pt(r, 0), pt(r + d, w), pt(r + 2 * d, 0)]); const r2 = 52 + i * 36 + rand() * 12; poly([pt(r2, 1), pt(r2 + d, 1 - w), pt(r2 + 2 * d, 1)]); }
    for (let i = 0; i < 3; i++) { const r = 70 + i * 40 + rand() * 20, t = 0.3 + rand() * 0.4, s = 7 + rand() * 7; poly([pt(r, t - s / 150), pt(r + s, t), pt(r, t + s / 150), pt(r - s, t)]); }
    const t = 0.5, r = 150 + rand() * 10; poly([pt(r, t - 0.12), pt(r + 18, t), pt(r, t + 0.12), pt(r + 6, t)]);
    x.restore(); label(x, '✂ cut', pt(100, 0.5)[0] + 38, pt(100, 0.5)[1], 15, false);
    return stack([title('SNOWFLAKE'), c, gap(), key(), steps('How to fold', ['Cut out the circle and turn it so the dashed pie slices face up.', 'Fold along every line, valley and mountain alternately, so it folds up like a fan.', 'You should end up with one thin pie slice. The marked slice is on top.', 'Cut along the shapes drawn on top (change them if you like), then unfold!'])]);
  }
  function snake(o) { // concertina snake
    const segs = 11, sh = 84, L = segs * sh + 8, [c, x] = cv(W, L), x0 = 100, w = 184;
    x.save(); x.beginPath(); x.rect(x0, 4, w, L - 8); x.clip();
    for (let k = 0; k < segs; k++) { const y0 = 4 + k * sh; if (o.pattern === 'diamonds') { x.lineWidth = 3; x.beginPath(); x.moveTo(x0 + w / 2, y0 + 8); x.lineTo(x0 + w - 12, y0 + sh / 2); x.lineTo(x0 + w / 2, y0 + sh - 8); x.lineTo(x0 + 12, y0 + sh / 2); x.closePath(); if (k % 2) x.fill(); else x.stroke(); } else if (o.pattern === 'bands') { x.fillRect(x0, y0 + sh * 0.3, w, sh * 0.4); } else { for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(x0 + 28 + i * 42, y0 + sh / 2 + (k % 2 ? 0 : 0), 10, 0, 7); x.fill(); } } }
    x.restore(); x.lineWidth = 3; x.strokeRect(x0, 4, w, L - 8);
    for (let k = 1; k < segs; k++) ln(x, k % 2 ? 'valley' : 'mountain', x0 - 14, 4 + k * sh, x0 + w + 14, 4 + k * sh);
    // head: two eyes and a tongue to cut; tail: pointed
    x.fillStyle = '#fff'; for (const sd of [-1, 1]) { x.beginPath(); x.arc(x0 + w / 2 + sd * 46, 4 + 40, 17, 0, 7); x.fill(); x.lineWidth = 3; x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(x0 + w / 2 + sd * 46, 4 + 40, 8, 0, 7); x.fill(); x.fillStyle = '#fff'; }
    x.fillStyle = '#000'; label(x, 'HEAD', x0 + w / 2, 4 + 70, 16);
    ln(x, 'cut', x0, L - 4 - sh, x0 + w / 2, L - 4); ln(x, 'cut', x0 + w, L - 4 - sh, x0 + w / 2, L - 4);
    label(x, 'cut the tail', x0 + w / 2, L - 4 - sh * 0.55, 15, false);
    return stack([title('PAPER SNAKE'), c, gap(), key(), steps('How to fold', ['Cut out the strip and trim the tail to a point.', 'Fold along every line, valley then mountain, like a concertina.', 'Squash it flat then stretch it out so it wiggles.', 'Add a tiny red paper tongue to the head!'])]);
  }
  const MODELS = { dart: ['✈️ Paper dart (aeroplane)', dart], stars: ['⭐ Lucky star strips', stars], pinwheel: ['🌀 Pinwheel', pinwheel], snowflake: ['❄️ Snowflake (fold and cut)', snowflake], snake: ['🐍 Concertina snake', snake] };
  const build = (model, opts) => MODELS[model][1](opts || {});
  return { MODELS, build };
})();
if (typeof window !== 'undefined') window.Origami = Origami;
