'use strict';
// Origami to fold from the printer paper. Everything is drawn to suit a 48 mm wide roll (384 dots, 8 per mm):
// strips for lucky stars and a paper snake, small squares and rectangles for a dart, pinwheel and snowflake.
// "Big" prints the sheet in 2 or 3 parts that you tape together, so the models can be 10-15 cm wide.
// Crease key: ---- valley fold   -.-. mountain fold   solid line = cut.   Step pictures come from a real fold simulation.
const Origami = (() => {
  const W = 384, OVERLAP = 24;
  let K = 1; // design scale: 1 = one 48 mm column, 2 = 96 mm (two parts), 3 = 144 mm (three parts)
  const cvs = (w, h, scale = 1) => { const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale); const x = c.getContext('2d'); x.scale(scale, scale); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineCap = x.lineJoin = 'round'; return [c, x]; };
  const cv = (w, h) => cvs(w, h, 1);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const STY = { valley: { d: [12, 7], w: 2.6 }, mountain: { d: [16, 5, 3, 5], w: 2.6 }, cut: { d: [], w: 3 }, faint: { d: [3, 5], w: 1.5 } };
  function ln(x, kind, x1, y1, x2, y2) { const s = STY[kind]; x.save(); if (kind === 'cut') { x.lineWidth = 9; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); x.strokeStyle = '#000'; } x.setLineDash(s.d); x.lineWidth = s.w; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); x.restore(); }
  const label = (x, t, px, py, size = 18, bold = true) => { x.save(); x.font = `${bold ? 800 : 500} ${size}px system-ui, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, px, py); x.restore(); };
  const bubble = (x, n, px, py, r = 14) => { x.save(); x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.lineWidth = 2.5; x.stroke(); x.restore(); label(x, String(n), px, py + 1, r + 3); };
  function key() { const [c, x] = cv(W, 62); ln(x, 'valley', 8, 14, 70, 14); label(x, 'valley fold', 150, 14, 15, false); ln(x, 'mountain', 205, 14, 258, 14); label(x, 'mountain fold', 322, 14, 14, false); ln(x, 'cut', 8, 44, 70, 44); label(x, 'cut here', 134, 44, 15, false); return c; }
  const wrap = (x, t, maxW) => { const words = t.split(' '); let line = '', lines = []; for (const w of words) { const test = line ? line + ' ' + w : w; if (x.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; } lines.push(line); return lines; };
  // steps: [{text, pic?}] where pic is a small canvas drawn at the right of the step
  function steps(title, list) {
    const rowH = list.some(s => s.pic) ? 124 : 46, [c, x] = cv(W, 44 + list.length * rowH + 8); label(x, title.toUpperCase(), W / 2, 18, 20); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 36); x.lineTo(W - 8, 36); x.stroke();
    list.forEach((s, i) => { const y = 42 + i * rowH, hasPic = !!s.pic; bubble(x, i + 1, 22, y + (hasPic ? 30 : 22)); x.font = '500 15px system-ui, Arial, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; const lines = wrap(x, s.text, hasPic ? 170 : W - 60); lines.slice(0, 5).forEach((l, k) => x.fillText(l, 48, y + (hasPic ? 24 : 22) + (k - (hasPic ? 0 : (lines.length - 1) / 2)) * 19)); if (hasPic) { x.drawImage(s.pic, W - 8 - s.pic.width / 1, y + 2, s.pic.width, s.pic.height); } if (i < list.length - 1) { x.save(); x.strokeStyle = '#999'; x.lineWidth = 1; x.setLineDash([2, 4]); x.beginPath(); x.moveTo(10, y + rowH - 4); x.lineTo(W - 10, y + rowH - 4); x.stroke(); x.restore(); } });
    return c;
  }
  const stack = parts => { let h = 0; for (const p of parts) h += p.height; const [c, x] = cv(W, h); let y = 0; for (const p of parts) { x.drawImage(p, 0, y); y += p.height; } return c; };
  const gap = () => { const [c, x] = cv(W, 22); x.save(); x.setLineDash([7, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 11); x.lineTo(W - 8, 11); x.stroke(); x.restore(); label(x, '✂', 20, 9, 14); return c; };

  // ---------- a tiny fold simulator: paper is a pile of polygons, a fold reflects the part on one side of a line ----------
  const clip = (poly, a, b, c) => { const out = []; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], fp = a * p.x + b * p.y + c, fq = a * q.x + b * q.y + c; if (fp >= 0) out.push(p); if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }); } } return out; };
  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i].x * q.y - q.x * p[i].y; } return Math.abs(s / 2); };
  function fold(layers, p0, p1, refPt, behind) { // reflect every part lying on the same side of the line as refPt
    let a = p1.y - p0.y, b = p0.x - p1.x, c = -(a * p0.x + b * p0.y); if (a * refPt.x + b * refPt.y + c < 0) { a = -a; b = -b; c = -c; }
    const stay = [], moved = [], d = a * a + b * b;
    for (const poly of layers) { const s = clip(poly, -a, -b, -c), m = clip(poly, a, b, c); if (s.length > 2 && area(s) > 1) stay.push(s); if (m.length > 2 && area(m) > 1) moved.push(m.map(p => { const k = (a * p.x + b * p.y + c) / d; return { x: p.x - 2 * a * k, y: p.y - 2 * b * k }; }).reverse()); }
    return behind ? moved.concat(stay) : stay.concat(moved);
  }
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  function pic(layers, box, w, h, creases) { // draw a pile of polygons into a w x h picture
    const [c, x] = cv(w, h), k = Math.min((w - 8) / (box[2] - box[0]), (h - 8) / (box[3] - box[1])), ox = (w - (box[2] - box[0]) * k) / 2 - box[0] * k, oy = (h - (box[3] - box[1]) * k) / 2 - box[1] * k;
    x.lineWidth = 2.2; for (const poly of layers) { x.beginPath(); poly.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](ox + p.x * k, oy + p.y * k)); x.closePath(); x.fillStyle = '#fff'; x.fill(); x.stroke(); }
    for (const [x1, y1, x2, y2, kind] of creases || []) { x.save(); x.setLineDash(STY[kind || 'valley'].d.map(v => v * 0.7)); x.lineWidth = 1.8; x.beginPath(); x.moveTo(ox + x1 * k, oy + y1 * k); x.lineTo(ox + x2 * k, oy + y2 * k); x.stroke(); x.restore(); }
    return c;
  }

  // ---------- finished-model pictures for the top of each sheet ----------
  function finished(kind) {
    const [c, x] = cv(W, 96); x.save(); x.translate(W - 70, 48); x.lineWidth = 3;
    if (kind === 'dart') { x.beginPath(); x.moveTo(-50, 8); x.lineTo(50, 0); x.lineTo(-50, -8); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(-10, 4); x.lineTo(-48, 34); x.lineTo(-36, 4); x.moveTo(-10, -4); x.lineTo(-48, -34); x.lineTo(-36, -4); x.stroke(); }
    else if (kind === 'stars') { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 40; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.stroke(); }
    else if (kind === 'pinwheel') { for (let i = 0; i < 4; i++) { x.save(); x.rotate(i * Math.PI / 2); x.beginPath(); x.moveTo(0, 0); x.lineTo(40, -2); x.lineTo(40, 36); x.closePath(); x.stroke(); x.restore(); } x.beginPath(); x.arc(0, 0, 5, 0, 7); x.fill(); x.beginPath(); x.moveTo(0, 8); x.lineTo(0, 46); x.stroke(); }
    else if (kind === 'snowflake') { x.lineWidth = 2.6; for (let i = 0; i < 6; i++) { x.save(); x.rotate(i * Math.PI / 3); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -42); x.moveTo(0, -24); x.lineTo(-12, -34); x.moveTo(0, -24); x.lineTo(12, -34); x.moveTo(0, -12); x.lineTo(-8, -20); x.moveTo(0, -12); x.lineTo(8, -20); x.stroke(); x.restore(); } }
    else if (kind === 'hat') { x.beginPath(); x.moveTo(-52, 6); x.lineTo(52, 6); x.lineTo(34, 30); x.lineTo(-34, 30); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(-26, 6); x.lineTo(0, -40); x.lineTo(26, 6); x.stroke(); x.beginPath(); x.moveTo(0, -40); x.lineTo(0, 6); x.stroke(); }
    else if (kind === 'fan') { x.lineWidth = 2.6; for (let i = -5; i <= 5; i++) { x.beginPath(); x.moveTo(0, 38); x.lineTo(i * 8.5, -30 + Math.abs(i) * 1.2); x.stroke(); } x.beginPath(); x.arc(0, 38, 62, -Math.PI * 0.72, -Math.PI * 0.28); x.stroke(); }
    else if (kind === 'snake') { x.lineWidth = 9; x.beginPath(); x.moveTo(-56, 20); for (let i = 0; i <= 8; i++) x.lineTo(-56 + i * 13, i % 2 ? 4 : 24); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(52, 4, 12, 0, 7); x.fillStyle = '#fff'; x.fill(); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(55, 1, 2.5, 0, 7); x.fill(); }
    x.restore(); return c;
  }
  const title = (t, kind, sub) => { const [c, x] = cv(W, 104); x.font = '800 30px system-ui, Arial, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(t, 14, 38); x.font = '500 14px system-ui, Arial, sans-serif'; x.fillText(sub || '', 14, 70); x.drawImage(finished(kind), 0, 4); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 100); x.lineTo(W - 8, 100); x.stroke(); return c; };

  // ---------- the art (drawn in 384-wide design units, scaled by K for the big sizes) ----------
  function artCanvas(designH) { const s = scale(); const [c, x] = cvs(W, designH, s); return [c, x]; }
  const scale = () => (K * W - (K - 1) * OVERLAP) / W;
  // cut an art canvas into K printable columns with taping overlap and part labels
  function tiles(art, name) {
    if (K === 1) return [art];
    const out = [], colW = W, step = colW - OVERLAP;
    for (let i = 0; i < K; i++) {
      const [c, x] = cv(W, art.height + 36); x.drawImage(art, i * step, 0, colW, art.height, 0, 36, colW, art.height);
      x.font = '800 20px system-ui, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`PART ${'ABC'[i]} of ${K} (${name})`, W / 2, 16);
      if (i < K - 1) { x.save(); x.setLineDash([3, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(W - OVERLAP, 36); x.lineTo(W - OVERLAP, 36 + art.height); x.stroke(); x.restore(); x.save(); x.translate(W - OVERLAP / 2, 36 + art.height / 2); x.rotate(Math.PI / 2); label(x, 'TAPE', 0, 0, 13); x.restore(); }
      if (i > 0) { x.save(); x.setLineDash([3, 6]); x.lineWidth = 2; x.beginPath(); x.moveTo(OVERLAP, 36); x.lineTo(OVERLAP, 36 + art.height); x.stroke(); x.restore(); }
      out.push(c);
    }
    return out;
  }
  const tilesNote = () => { if (K === 1) return []; const [c, x] = cv(W, 84); x.font = '500 15px system-ui, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`Cut out the ${K} parts and tape them`, W / 2, 18); x.fillText('together, edge to edge, along the dotted', W / 2, 40); x.fillText('TAPE lines, to make one big sheet.', W / 2, 62); return [c, gap()]; };

  function dart() {
    const [art, x] = artCanvas(576), cx = W / 2, H = 576; x.lineWidth = 3; x.strokeRect(5, 5, W - 10, H - 10);
    ln(x, 'valley', cx, 8, cx, H - 8); ln(x, 'valley', cx, 8, 8, cx + 8); ln(x, 'valley', cx, 8, W - 8, cx + 8); ln(x, 'valley', cx, 8, 8, 463); ln(x, 'valley', cx, 8, W - 8, 463); ln(x, 'mountain', cx, 8, 100, H - 8); ln(x, 'mountain', cx, 8, W - 100, H - 8);
    bubble(x, 1, cx + 22, 330); bubble(x, 2, 70, 150); bubble(x, 2, W - 70, 150); bubble(x, 3, 52, 380); bubble(x, 3, W - 52, 380); bubble(x, 5, 122, 520); bubble(x, 5, W - 122, 520);
    // step pictures from the fold simulation
    const box = [0, 0, 384, 576], sheet = [rect(0, 0, 384, 576)], d1 = pic(sheet, box, 96, 112, [[192, 0, 192, 576, 'valley']]);
    let L = fold(sheet, { x: 192, y: 0 }, { x: 0, y: 192 }, { x: 8, y: 8 }); L = fold(L, { x: 192, y: 0 }, { x: 384, y: 192 }, { x: 376, y: 8 }); const d2 = pic(L, box, 96, 112);
    L = fold(L, { x: 192, y: 0 }, { x: 0, y: 463 }, { x: 20, y: 150 }); L = fold(L, { x: 192, y: 0 }, { x: 384, y: 463 }, { x: 364, y: 150 }); const d3 = pic(L, box, 96, 112);
    L = fold(L, { x: 192, y: 0 }, { x: 192, y: 576 }, { x: 380, y: 300 }, true); const d4 = pic(L, [100, 0, 292, 576], 70, 112);
    const d5 = pic(L, [100, 0, 292, 576], 70, 112, [[192, 0, 100, 576, 'mountain']]);
    return stack([title('PAPER DART', 'dart', 'A paper aeroplane. Size: ' + (K === 1 ? 'small' : K === 2 ? 'big' : 'huge')), ...tilesNote(), ...tiles(art, 'dart'), gap(), key(), steps('How to fold', [
      { text: 'Fold in half down the middle, then open it again.', pic: d1 }, { text: 'Fold both top corners in to the middle crease.', pic: d2 }, { text: 'Fold the two slanted edges in to the middle crease again.', pic: d3 },
      { text: 'Fold the whole thing in half along the middle, bumps on the outside.', pic: d4 }, { text: 'Fold each wing down along the line from the nose, then throw!', pic: d5 }])]);
  }
  function stars(o) { // lucky-star strips: three strips side by side (always one column wide)
    const L = o.length === 'long' ? 2400 : 1600, [c, x] = cv(W, L), sw = 116, xs = [8, 134, 260], pat = o.pattern, msg = (o.message || '').trim();
    for (const x0 of xs) {
      x.save(); x.lineWidth = 3; x.strokeRect(x0, 4, sw, L - 8); x.beginPath(); x.rect(x0 + 2, 6, sw - 4, L - 12); x.clip();
      if (pat === 'stripes') { x.lineWidth = 5; for (let k = -sw; k < L; k += 22) { x.beginPath(); x.moveTo(x0 - 4, k + sw * 0.5); x.lineTo(x0 + sw + 4, k); x.stroke(); } }
      else if (pat === 'dots') { for (let yy = 30; yy < L - 20; yy += 26) for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(x0 + 18 + k * 28 + (Math.round(yy / 26) % 2 ? 14 : 0), yy, 5, 0, 7); x.fill(); } }
      else if (pat === 'zigzag') { x.lineWidth = 4; for (let yy = 20; yy < L - 20; yy += 24) { x.beginPath(); x.moveTo(x0 + 6, yy); for (let k = 1; k <= 6; k++) x.lineTo(x0 + 6 + k * (sw - 12) / 6, yy + (k % 2 ? -10 : 0)); x.stroke(); } }
      else if (pat === 'hearts') { for (let yy = 34; yy < L - 20; yy += 40) for (let k = 0; k < 3; k++) { const hx = x0 + 22 + k * 36 + (Math.round(yy / 40) % 2 ? 16 : 0), s = 0.5; x.beginPath(); for (let i = 0; i <= 30; i++) { const t = i / 30 * Math.PI * 2, px = 16 * Math.pow(Math.sin(t), 3), py = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); x[i ? 'lineTo' : 'moveTo'](hx + px * s, yy - py * s); } x.closePath(); x.fill(); } }
      if (msg) { x.save(); x.fillStyle = '#fff'; for (let yy = 150; yy < L - 150; yy += 300) x.fillRect(x0 + 30, yy, 56, 230); x.fillStyle = '#000'; x.font = '800 22px system-ui, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; for (let yy = 150; yy < L - 150; yy += 300) { x.save(); x.translate(x0 + sw / 2, yy + 115); x.rotate(Math.PI / 2); x.fillText(msg.slice(0, 22), 0, 0); x.restore(); } x.restore(); }
      x.restore(); x.fillStyle = '#fff'; x.fillRect(x0 + 20, 12, sw - 40, 56); x.fillStyle = '#000'; label(x, '▼ START', x0 + sw / 2, 40, 17); x.fillStyle = '#fff'; x.fillRect(x0 + 20, L - 70, sw - 40, 56); x.fillStyle = '#000'; label(x, 'end', x0 + sw / 2, L - 42, 17, false);
    }
    return stack([title('LUCKY STARS', 'stars', 'Three strips make three puffy stars'), c, gap(), key(), steps('How to fold', ['Cut out the three strips. Write a wish on the plain side if you like.', 'Tie a loose, flat knot at the START end and press it flat: a pentagon!', 'Fold the long end over the pentagon, tuck it in, and wrap it round the edges.', 'Keep wrapping until only a stub is left. Tuck the stub in.', 'Pinch every point of the star in towards the middle so it puffs up.'].map(text => ({ text })))]);
  }
  function pinwheel(o) {
    const [art, x] = artCanvas(384), S = 384, cx = S / 2, m = 5; x.save(); x.beginPath(); x.rect(m, m, S - 2 * m, S - 2 * m); x.clip();
    if (o.pattern === 'stripes') { x.lineWidth = 7; for (let k = 0; k < S; k += 22) { x.beginPath(); x.moveTo(m, S - k); x.lineTo(S - m, -k); x.stroke(); } } else if (o.pattern === 'rings') { x.lineWidth = 6; for (let r = 24; r < 290; r += 26) { x.beginPath(); x.arc(cx, cx, r, 0, 7); x.stroke(); } } else if (o.pattern === 'dots') { for (let yy = 22; yy < S; yy += 36) for (let xx = 22; xx < S; xx += 36) { x.beginPath(); x.arc(xx + ((yy / 36 | 0) % 2 ? 18 : 0), yy, 6, 0, 7); x.fill(); } }
    x.restore(); x.lineWidth = 3; x.strokeRect(m, m, S - 2 * m, S - 2 * m); const f = 0.62;
    for (const [px, py] of [[m, m], [S - m, m], [S - m, S - m], [m, S - m]]) ln(x, 'cut', px, py, px + (cx - px) * f, py + (cx - py) * f);
    x.fillStyle = '#fff'; for (const [px, py] of [[84, 30], [S - 30, 84], [S - 84, S - 30], [30, S - 84]]) { x.beginPath(); x.arc(px, py, 17, 0, 7); x.fill(); x.lineWidth = 3; x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill(); x.fillStyle = '#fff'; }
    x.beginPath(); x.arc(cx, cx, 11, 0, 7); x.fill(); x.lineWidth = 3; x.stroke();
    return stack([title('PINWHEEL', 'pinwheel', 'Size: ' + (K === 1 ? 'small' : K === 2 ? 'big' : 'huge')), ...tilesNote(), ...tiles(art, 'pinwheel'), gap(), key(), steps('How to fold', ['Cut along the four solid lines from the corners. Stop at the circles near the middle!', 'Take each corner that has a ● on it and bend it to the middle (do not crease it).', 'Hold all four corners together over the centre circle.', 'Push a pin through all of them and into the end of a pencil. Blow!'].map(text => ({ text })))]);
  }
  function snowflake(o) {
    const [art, x] = artCanvas(384), S = 384, cx = S / 2, R = 186, rand = rng(o.seed || 1);
    x.lineWidth = 3; x.beginPath(); x.arc(cx, cx, R, 0, 7); x.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 - Math.PI / 2; ln(x, k % 2 ? 'mountain' : 'valley', cx, cx, cx + R * Math.cos(a), cx + R * Math.sin(a)); }
    const a0 = -Math.PI / 2, a1 = a0 + Math.PI / 3, pt = (r, t) => [cx + r * Math.cos(a0 + t * (a1 - a0)), cx + r * Math.sin(a0 + t * (a1 - a0))];
    x.save(); x.lineWidth = 2.6; const poly = pts => { x.beginPath(); pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0], p[1])); x.closePath(); x.stroke(); };
    // notches along both folded edges: a triangle whose base lies ON the edge, spaced so none overlap
    let r = 34 + rand() * 10; for (let i = 0; i < 6; i++) { const edge = i % 2, base = 22 + rand() * 12, depth = 0.1 + rand() * 0.14, t0 = edge ? 1 : 0, t1 = edge ? 1 - depth : depth; if (r + base > R - 40) break; poly([pt(r, t0), pt(r + base / 2, t1), pt(r + base, t0)]); r += base + 10 + rand() * 8; }
    // diamonds well inside the slice, and a scalloped bite out of the rim
    for (let i = 0; i < 3; i++) { const rr = 62 + i * 38 + rand() * 10, t = 0.38 + rand() * 0.24, s = 6 + rand() * 6; poly([pt(rr + s, t), pt(rr, t + s / 130), pt(rr - s, t), pt(rr, t - s / 130)]); }
    poly([pt(R - 8, 0.2), pt(R - 30, 0.5), pt(R - 8, 0.8)]);
    x.restore(); label(x, '✂ cut these', pt(112, 0.5)[0] + 40, pt(112, 0.5)[1], 14, false);
    // step pictures: the wedge
    const sheet = [rect(0, 0, 10, 10)], d3 = (() => { const [c2, y] = cv(96, 112); y.lineWidth = 2.4; y.beginPath(); y.moveTo(48, 100); y.lineTo(48 - 30, 12); y.lineTo(48 + 30, 12); y.closePath(); y.stroke(); y.setLineDash([5, 4]); for (let i = 1; i < 3; i++) { y.beginPath(); y.moveTo(48, 100); y.lineTo(48 - 30 + i * 20, 12); y.stroke(); } return c2; })(); void sheet;
    return stack([title('SNOWFLAKE', 'snowflake', 'Fold, cut, unfold. No two are alike!'), ...tilesNote(), ...tiles(art, 'snowflake'), gap(), key(), steps('How to fold', [{ text: 'Cut out the circle and turn it so the dashed pie slices face up.' }, { text: 'Fold along every line, valley then mountain, so it folds up like a fan.' }, { text: 'You should end up with one thin pie slice. The marked slice is on top.', pic: d3 }, { text: 'Cut along the shapes drawn on top (change them if you like), then unfold!' }])]);
  }
  function snake(o) {
    const segs = 11, sh = 84, L = segs * sh + 8, [c, x] = cv(W, L), x0 = 100, w = 184;
    x.save(); x.beginPath(); x.rect(x0, 4, w, L - 8); x.clip();
    for (let k = 0; k < segs; k++) { const y0 = 4 + k * sh; if (o.pattern === 'diamonds') { x.lineWidth = 3; x.beginPath(); x.moveTo(x0 + w / 2, y0 + 8); x.lineTo(x0 + w - 12, y0 + sh / 2); x.lineTo(x0 + w / 2, y0 + sh - 8); x.lineTo(x0 + 12, y0 + sh / 2); x.closePath(); if (k % 2) x.fill(); else x.stroke(); } else if (o.pattern === 'bands') { x.fillRect(x0, y0 + sh * 0.3, w, sh * 0.4); } else { for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(x0 + 28 + i * 42, y0 + sh / 2, 10, 0, 7); x.fill(); } } }
    x.restore(); x.lineWidth = 3; x.strokeRect(x0, 4, w, L - 8);
    for (let k = 1; k < segs; k++) ln(x, k % 2 ? 'valley' : 'mountain', x0 - 14, 4 + k * sh, x0 + w + 14, 4 + k * sh);
    x.fillStyle = '#fff'; x.fillRect(x0 + 10, 8, w - 20, 70); for (const sd of [-1, 1]) { x.beginPath(); x.arc(x0 + w / 2 + sd * 46, 4 + 34, 17, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 3; x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(x0 + w / 2 + sd * 46, 4 + 34, 8, 0, 7); x.fill(); }
    x.fillStyle = '#000'; label(x, 'HEAD', x0 + w / 2, 4 + 66, 14);
    ln(x, 'cut', x0, L - 4 - sh, x0 + w / 2, L - 4); ln(x, 'cut', x0 + w, L - 4 - sh, x0 + w / 2, L - 4); label(x, 'cut the tail', x0 + w / 2, L - 4 - sh * 0.55, 15, false);
    return stack([title('PAPER SNAKE', 'snake', 'A wiggly concertina snake'), c, gap(), key(), steps('How to fold', ['Cut out the strip and trim the tail to a point.', 'Fold along every line, valley then mountain, like a concertina.', 'Squash it flat then stretch it out so it wiggles.', 'Add a tiny red paper tongue to the head!'].map(text => ({ text })))]);
  }

  function hat() { // paper hat that opens up into a boat: 48 x 84 mm
    const [art, x] = artCanvas(672), w = 384, h = 672, hc = h / 2, brim = hc - w / 2; x.lineWidth = 3; x.strokeRect(5, 5, w - 10, h - 10);
    ln(x, 'valley', 8, hc, w - 8, hc);
    for (const [x1, y1, x2, y2] of [[192, hc, 8, brim], [192, hc, w - 8, brim], [192, hc, 8, h - brim], [192, hc, w - 8, h - brim]]) ln(x, 'valley', x1, y1, x2, y2);
    ln(x, 'valley', 8, brim, w - 8, brim); ln(x, 'valley', 8, h - brim, w - 8, h - brim);
    bubble(x, 1, 192, hc - 24); bubble(x, 2, 60, hc - 12); bubble(x, 2, w - 60, hc - 12); bubble(x, 2, 60, hc + 40); bubble(x, 2, w - 60, hc + 40); bubble(x, 3, 192, brim - 40); bubble(x, 3, 192, h - brim + 40);
    const box = [0, 0, w, h], sheet = [rect(0, 0, w, h)];
    const d1 = pic(sheet, box, 96, 112, [[0, hc, w, hc, 'valley']]);
    let L = fold(sheet, { x: 0, y: hc }, { x: w, y: hc }, { x: 192, y: h - 10 });
    const d1b = pic(L, [0, 0, w, hc], 96, 70);
    L = fold(L, { x: 192, y: hc }, { x: 0, y: brim }, { x: 4, y: hc - 6 }); L = fold(L, { x: 192, y: hc }, { x: w, y: brim }, { x: w - 4, y: hc - 6 });
    const d2 = pic(L, [0, 0, w, hc], 96, 70, [[0, brim, w, brim, 'valley']]);
    const diamond = (steps) => { const [c, y] = cv(96, 70); y.lineWidth = 2.4; const pts = [[48, 6], [88, 36], [48, 64], [8, 36]]; y.beginPath(); pts.forEach((p, i) => y[i ? 'lineTo' : 'moveTo'](p[0], p[1])); y.closePath(); y.stroke(); if (steps === 'fold') { y.setLineDash([5, 4]); y.beginPath(); y.moveTo(8, 36); y.lineTo(88, 36); y.stroke(); } if (steps === 'tips') { y.beginPath(); y.moveTo(8, 36); y.lineTo(88, 36); y.stroke(); y.beginPath(); y.moveTo(48, 6); y.lineTo(48, 36); y.stroke(); } return c; };
    return stack([title('PAPER BOAT', 'hat', 'Starts as a paper hat. Size: ' + (K === 1 ? 'small' : K === 2 ? 'big' : 'huge')), ...tilesNote(), ...tiles(art, 'boat'), gap(), key(), steps('How to fold', [
      { text: 'Fold in half along the middle line (the open edges are at the top).', pic: d1b }, { text: 'Fold the two corners on the fold line up to the middle: a triangle roof.', pic: d2 }, { text: 'Fold the loose strips up in front and behind, like a hat brim. It is a hat now!', pic: d2 },
      { text: 'Put your fingers inside, pull the bottom corners apart and flatten it into a diamond.', pic: diamond() }, { text: 'Fold the bottom corner of the front layer up to the top point. Turn it over and do the same on the back.', pic: diamond('fold') }, { text: 'Open it up again, flatten into a diamond, then pull the two top points outwards and shape the boat.', pic: diamond('tips') }])]);
  }
  function fan(o) { // accordion fan: 48 x 72 mm
    const w = 384, h = 576, [c, x] = cv(w, h), n = 12, sh = (h - 96) / n;
    x.save(); x.beginPath(); x.rect(5, 5, w - 10, h - 10); x.clip();
    for (let k = 0; k < n; k++) { const y0 = 5 + k * sh; if (o.pattern === 'diamonds') { x.lineWidth = 3; x.beginPath(); x.moveTo(w / 2, y0 + 5); x.lineTo(w - 30, y0 + sh / 2); x.lineTo(w / 2, y0 + sh - 5); x.lineTo(30, y0 + sh / 2); x.closePath(); if (k % 2) x.fill(); else x.stroke(); } else if (o.pattern === 'bands') { if (k % 2) x.fillRect(5, y0, w - 10, sh); } else { for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(30 + i * 54, y0 + sh / 2, 7, 0, 7); x.fill(); } } }
    x.restore(); x.lineWidth = 3; x.strokeRect(5, 5, w - 10, h - 10);
    x.fillStyle = '#fff'; x.fillRect(5, h - 98, w - 10, 93); x.fillStyle = '#000'; x.lineWidth = 3; x.strokeRect(5, h - 98, w - 10, 93); label(x, 'PINCH AND TAPE HERE', w / 2, h - 52, 18);
    for (let k = 1; k < n; k++) ln(x, k % 2 ? 'valley' : 'mountain', 8, 5 + k * sh, w - 8, 5 + k * sh); bubble(x, 1, 30, 5 + sh); bubble(x, 1, 30, 5 + 2 * sh);
    return stack([title('PAPER FAN', 'fan', 'A pleated hand fan'), c, gap(), key(), steps('How to fold', ['Cut out the sheet. Fold along every line, valley then mountain, to make a concertina.', 'Press all the folds flat, the pinch area at the bottom.', 'Pinch the bottom together and tape it (or tie a ribbon round it).', 'Spread the top into a half circle and wave it!'].map(text => ({ text })))]);
  }
  const MODELS = { dart: ['✈️ Paper dart (aeroplane)', dart], stars: ['⭐ Lucky star strips', stars], pinwheel: ['🌀 Pinwheel', pinwheel], snowflake: ['❄️ Snowflake (fold and cut)', snowflake], snake: ['🐍 Concertina snake', snake], hat: ['⛵ Paper boat (hat)', hat], fan: ['🪭 Pleated fan', fan] };
  const build = (model, opts) => { opts = opts || {}; K = ['dart', 'pinwheel', 'snowflake', 'hat'].includes(model) ? Math.max(1, Math.min(3, +opts.parts || 1)) : 1; try { return MODELS[model][1](opts); } finally { K = 1; } };
  return { MODELS, build, fold, rect };
})();
if (typeof window !== 'undefined') window.Origami = Origami;
