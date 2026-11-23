'use strict';
// Frames, caption/date band and stickers drawn onto the 384x336 work canvas (after Fx), so every look/print/save includes them.
const Overlay = (() => {
  const st = { frame: 'none', caption: '', capPos: 'bottom', date: false, stickers: [], sel: -1, drag: 'effect' };
  const $$ = id => document.getElementById(id);

  // ---- frames ----
  const FRAMES = {
    none: 'No frame',
    simple: 'Simple border',
    rounded: 'Rounded',
    film: 'Film strip',
    polaroid: 'Polaroid',
    gb: 'Game Boy',
    dots: 'Dotted',
    hearts: 'Hearts',
    stars: 'Stars',
    scroll: 'Scroll',
    wanted: 'Wanted poster',
  };
  const frameFns = {
    simple(x, W, H) { x.fillStyle = '#000'; x.fillRect(0, 0, W, 10); x.fillRect(0, H - 10, W, 10); x.fillRect(0, 0, 10, H); x.fillRect(W - 10, 0, 10, H); x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(14, 14, W - 28, H - 28); },
    rounded(x, W, H) { x.fillStyle = '#000'; x.beginPath(); x.rect(0, 0, W, H); const r = 46, m = 8; x.moveTo(m + r, m); x.arcTo(W - m, m, W - m, H - m, r); x.arcTo(W - m, H - m, m, H - m, r); x.arcTo(m, H - m, m, m, r); x.arcTo(m, m, W - m, m, r); x.closePath(); x.fill('evenodd'); },
    film(x, W, H) { x.fillStyle = '#000'; x.fillRect(0, 0, 34, H); x.fillRect(W - 34, 0, 34, H); x.fillStyle = '#fff'; for (let y = 8; y < H; y += 26) { x.fillRect(9, y, 16, 12); x.fillRect(W - 25, y, 16, 12); } },
    polaroid(x, W, H) { x.fillStyle = '#fff'; x.fillRect(0, 0, W, 18); x.fillRect(0, 0, 18, H); x.fillRect(W - 18, 0, 18, H); x.fillRect(0, H - 62, W, 62); x.strokeStyle = '#000'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, W - 3, H - 3); x.strokeRect(18, 18, W - 36, H - 80); },
    gb(x, W, H) { x.fillStyle = '#000'; x.fillRect(0, 0, W, 16); x.fillRect(0, H - 16, W, 16); x.fillRect(0, 0, 16, H); x.fillRect(W - 16, 0, 16, H); x.fillStyle = '#fff'; for (const [a, b] of [[0, 0], [W - 16, 0], [0, H - 16], [W - 16, H - 16]]) x.fillRect(a + 4, b + 4, 8, 8); },
    dots(x, W, H) { x.fillStyle = '#000'; x.fillRect(0, 0, W, 22); x.fillRect(0, H - 22, W, 22); x.fillRect(0, 0, 22, H); x.fillRect(W - 22, 0, 22, H); x.fillStyle = '#fff'; for (let i = 8; i < W; i += 18) { x.beginPath(); x.arc(i, 11, 4, 0, 7); x.arc(i, H - 11, 4, 0, 7); x.fill(); } for (let j = 8; j < H; j += 18) { x.beginPath(); x.arc(11, j, 4, 0, 7); x.arc(W - 11, j, 4, 0, 7); x.fill(); } },
    scroll(x, W, H) { // parchment scroll: shaded cylinder rolls with spiral ends, curling wavy paper edges, roll shadows (pre-dithered so it prints crisply)
      const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const dither = (rx, ry, rw, rh, dens) => { x.fillStyle = '#000'; for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) { const d = dens(i / rw, j / rh); if (d > (B[((ry + j) & 3) * 4 + ((rx + i) & 3)] + 0.5) / 16) x.fillRect(rx + i, ry + j, 1, 1); } };
      const TB = 46, SB = 30, ROLL = 26, TOP = 8; // top/bottom band, side band, roll height, roll top
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, TB); x.fillRect(0, H - TB, W, TB); x.fillRect(0, 0, SB, H); x.fillRect(W - SB, 0, SB, H);
      // shadows the rolls cast onto the paper, and soft side shading
      dither(SB, TB, W - 2 * SB, 14, (u, v) => 0.75 * (1 - v) * (1 - v));
      dither(SB, H - TB - 14, W - 2 * SB, 14, (u, v) => 0.75 * v * v);
      dither(SB, TB, 10, H - 2 * TB, (u, v) => 0.5 * (1 - u) * (1 - u));
      dither(W - SB - 10, TB, 10, H - 2 * TB, (u, v) => 0.5 * u * u);
      // curling paper edges
      x.strokeStyle = '#000'; x.lineJoin = x.lineCap = 'round'; x.lineWidth = 3;
      for (const bx of [SB, W - SB]) { x.beginPath(); for (let y = TOP + ROLL; y <= H - TOP - ROLL; y += 2) { const px = bx + Math.sin((y - TB) / 14) * 2.2 * Math.sin(Math.PI * (y - TB) / (H - 2 * TB)); x[y === TOP + ROLL ? 'moveTo' : 'lineTo'](px, y); } x.stroke(); }
      const roll = y0 => {
        // cylinder body, shaded top-light to bottom-dark
        x.fillStyle = '#fff'; x.fillRect(20, y0, W - 40, ROLL);
        dither(20, y0, W - 40, ROLL, (u, v) => v < 0.18 ? 0 : 0.1 + 0.8 * Math.pow((v - 0.18) / 0.82, 1.3));
        x.fillStyle = '#fff'; x.fillRect(26, y0 + 4, W - 52, 2); // specular streak
        x.lineWidth = 3; x.strokeStyle = '#000'; x.strokeRect(20, y0, W - 40, ROLL);
        // rolled-paper ends: spiral discs
        for (const cx of [20, W - 20]) {
          const cy = y0 + ROLL / 2; x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 17, 0, 7); x.fill(); x.lineWidth = 3; x.stroke();
          x.lineWidth = 2; x.beginPath(); for (let t = 0; t < 4.2 * Math.PI; t += 0.2) { const r = 2 + t * 1.15, dir = cx < W / 2 ? 1 : -1; x[t ? 'lineTo' : 'moveTo'](cx + Math.cos(t * dir) * r, cy + Math.sin(t * dir) * r); } x.stroke();
        }
      };
      roll(TOP); roll(H - TOP - ROLL);
      // corner studs
      x.fillStyle = '#000'; for (const [px, py] of [[SB + 12, TB + 18], [W - SB - 12, TB + 18], [SB + 12, H - TB - 18], [W - SB - 12, H - TB - 18]]) { x.beginPath(); x.moveTo(px, py - 5); x.lineTo(px + 5, py); x.lineTo(px, py + 5); x.lineTo(px - 5, py); x.closePath(); x.fill(); }
    },
    wanted(x, W, H) { // old-west poster: WANTED on top, the caption becomes the name underneath
      const SERIF = 'Georgia, "Times New Roman", serif', topH = 70, botH = 78, name = (st.caption.trim() || 'OUTLAW').toUpperCase();
      x.fillStyle = '#fff'; x.fillRect(0, 0, W, topH); x.fillRect(0, H - botH, W, botH); x.fillRect(0, 0, 12, H); x.fillRect(W - 12, 0, 12, H);
      x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineWidth = 8; x.strokeRect(4, 4, W - 8, H - 8); x.lineWidth = 2; x.strokeRect(13, 13, W - 26, H - 26); x.lineWidth = 4; x.strokeRect(20, topH, W - 40, H - topH - botH);
      x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.font = `900 46px ${SERIF}`; x.letterSpacing = '3px'; x.fillText('WANTED', W / 2 + 1, 52); x.letterSpacing = '0px';
      x.font = `800 14px ${SERIF}`; x.letterSpacing = '2px'; x.fillText('DEAD OR ALIVE', W / 2 + 1, 66); x.letterSpacing = '0px';
      let sz = 34; for (; sz > 14; sz -= 2) { x.font = `900 ${sz}px ${SERIF}`; if (x.measureText(name).width <= W - 60) break; }
      x.fillText(name, W / 2, H - botH + 34); x.font = `800 17px ${SERIF}`; x.letterSpacing = '2px'; x.fillText('REWARD $5,000', W / 2 + 1, H - 22); x.letterSpacing = '0px';
    },
    hearts(x, W, H) { glyphFrame(x, W, H, '♥', '#e0245e'); },
    stars(x, W, H) { glyphFrame(x, W, H, '★', '#f5b800'); },
  };
  function glyphFrame(x, W, H, g, col) {
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, 26); x.fillRect(0, H - 26, W, 26); x.fillRect(0, 0, 26, H); x.fillRect(W - 26, 0, 26, H);
    x.fillStyle = col; x.font = '700 22px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 14; i < W; i += 26) { x.fillText(g, i, 13); x.fillText(g, i, H - 13); } for (let j = 14; j < H; j += 26) { x.fillText(g, 13, j); x.fillText(g, W - 13, j); }
  }

  // ---- caption ----
  function drawCaption(x, W, H) {
    if (st.frame === 'wanted') return; // the poster frame prints the caption as the name
    const parts = []; if (st.caption.trim()) parts.push(st.caption.trim());
    if (st.date) parts.push(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
    if (!parts.length) return;
    const text = parts.join('  ·  '), pol = st.frame === 'polaroid';
    let size = 34; x.font = `800 ${size}px system-ui, Arial, sans-serif`; while (x.measureText(text).width > W - 40 && size > 12) { size -= 2; x.font = `800 ${size}px system-ui, Arial, sans-serif`; }
    const bh = size + 18, y0 = pol ? H - 62 : st.capPos === 'top' ? 0 : H - bh;
    if (!pol) { x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(0, y0, W, bh); }
    x.fillStyle = '#000'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, pol ? H - 31 : y0 + bh / 2 + 1);
  }

  // ---- stickers ----
  const EMOJI = ['😎', '🥸', '🎩', '👑', '🧢', '🎅', '🐱', '❤️', '⭐', '🔥', '💋', '🌈'];
  const HATS = new Set(['🎩', '👑', '🧢', '🎅']);
  let g = { x: 0, y: 0 }, pup = [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }], motion = null;
  addEventListener('devicemotion', e => { const a = e.accelerationIncludingGravity; if (a && a.x != null) motion = a; });
  function gravity() { if (motion && (motion.x || motion.y)) { const mir = typeof facing !== 'undefined' && facing === 'user'; g.x = (mir ? 1 : -1) * motion.x / 9.8; g.y = motion.y / 9.8; } else { const t = performance.now() / 1000; g.x = Math.sin(t * 6) * 0.9; g.y = Math.cos(t * 4.3) * 0.6; } }
  function faceFor(s, W, H) { // resolve sticker centre/size, following the face if tracked
    const f = typeof Fx !== 'undefined' && Fx.st.auto ? Fx.st.face : null;
    let cx = s.x * W, cy = s.y * H, size = s.s;
    if (f && s.anchor !== 'free') {
      if (s.anchor === 'top') { cx = f.cx; cy = f.cy - f.h * 0.62; size = f.w * 0.95 * (s.s / 70); }
      else if (s.anchor === 'mouth') { cx = f.cx; cy = f.cy + f.h * 0.27; size = f.w * 0.55 * (s.s / 70); }
      else if (s.anchor === 'eyes') { cx = f.cx; cy = f.cy - f.h * 0.08; size = f.w * 0.3 * (s.s / 70); s.eyes = f.eyes; }
    }
    return { cx, cy, size };
  }
  function eye(x, cx, cy, r, p) {
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.lineWidth = Math.max(2, r * 0.12); x.strokeStyle = '#000'; x.stroke();
    const pr = r * 0.46, lim = r - pr - x.lineWidth; p.vx += g.x * 0.9; p.vy += g.y * 0.9; p.vx *= 0.78; p.vy *= 0.78; p.x += p.vx; p.y += p.vy;
    const d = Math.hypot(p.x, p.y); if (d > lim) { p.x *= lim / d; p.y *= lim / d; p.vx *= -0.4; p.vy *= -0.4; }
    x.fillStyle = '#000'; x.beginPath(); x.arc(cx + p.x, cy + p.y, pr, 0, 7); x.fill();
  }
  function drawSticker(x, s, W, H) {
    const { cx, cy, size } = faceFor(s, W, H); x.save(); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (s.t === 'googly') {
      const r = size * 0.5; gravity(); let pts = [{ x: cx - r * 1.15, y: cy }, { x: cx + r * 1.15, y: cy }];
      if (s.anchor === 'eyes' && s.eyes && s.eyes.length === 2 && typeof Fx !== 'undefined' && Fx.st.auto && Fx.st.face) pts = s.eyes;
      pts.forEach((p, i) => eye(x, p.x, p.y, pts === s.eyes ? Math.max(8, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) * 0.32) : r, pup[i]));
    } else if (s.t === 'moustache') {
      const w = size * 1.7; x.fillStyle = '#1b1109'; x.beginPath();
      x.moveTo(cx, cy - w * 0.06); x.bezierCurveTo(cx + w * 0.12, cy - w * 0.2, cx + w * 0.38, cy - w * 0.16, cx + w * 0.5, cy + w * 0.06);
      x.bezierCurveTo(cx + w * 0.56, cy + w * 0.16, cx + w * 0.4, cy + w * 0.2, cx + w * 0.34, cy + w * 0.08);
      x.bezierCurveTo(cx + w * 0.22, cy + w * 0.12, cx + w * 0.1, cy + w * 0.1, cx, cy + w * 0.06);
      x.bezierCurveTo(cx - w * 0.1, cy + w * 0.1, cx - w * 0.22, cy + w * 0.12, cx - w * 0.34, cy + w * 0.08);
      x.bezierCurveTo(cx - w * 0.4, cy + w * 0.2, cx - w * 0.56, cy + w * 0.16, cx - w * 0.5, cy + w * 0.06);
      x.bezierCurveTo(cx - w * 0.38, cy - w * 0.16, cx - w * 0.12, cy - w * 0.2, cx, cy - w * 0.06); x.fill();
    } else if (s.t === 'bubble') {
      x.font = `800 ${Math.round(size * 0.42)}px system-ui, Arial, sans-serif`; const tw = x.measureText(s.text || '...').width + 26, bh = size * 0.7, bx = cx - tw / 2, by = cy - bh / 2;
      x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 4; x.beginPath(); x.roundRect ? x.roundRect(bx, by, tw, bh, bh / 2) : x.rect(bx, by, tw, bh); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(cx - 10, by + bh - 1); x.lineTo(cx - 24, by + bh + 22); x.lineTo(cx + 12, by + bh - 1); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#fff'; x.fillRect(cx - 9, by + bh - 4, 20, 6); x.fillStyle = '#000'; x.fillText(s.text || '...', cx, cy + 1);
    } else { x.font = `${Math.round(size)}px "Apple Color Emoji","Noto Color Emoji",serif`; x.fillText(s.ch, cx, cy); }
    x.restore();
  }

  function active() { return st.frame !== 'none' || st.caption.trim() || st.date || st.stickers.length; }
  function apply(ctx) {
    if (!active()) return; const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save(); for (const s of st.stickers) drawSticker(ctx, s, W, H);
    if (frameFns[st.frame]) frameFns[st.frame](ctx, W, H); drawCaption(ctx, W, H); ctx.restore();
  }

  // ---- UI ----
  function add(t, ch) {
    const anchor = t === 'googly' ? 'eyes' : t === 'moustache' ? 'mouth' : HATS.has(ch) ? 'top' : 'free';
    const s = { t, ch, anchor, x: 0.5, y: t === 'googly' ? 0.4 : t === 'moustache' ? 0.62 : HATS.has(ch) ? 0.2 : 0.5, s: t === 'googly' ? 60 : t === 'bubble' ? 150 : 70, text: '' };
    if (t === 'bubble') { const tx = prompt('Speech bubble text:', 'Hello!'); if (tx === null) return; s.text = tx; s.y = 0.2; }
    st.stickers.push(s); st.sel = st.stickers.length - 1; $$('ovsize').value = s.s; syncOutputs(); st.drag = 'sticker'; document.querySelector('input[name=ovdrag][value=sticker]').checked = true;
  }
  const pal = $$('stk');
  [['googly', '', '👀 Googly'], ['moustache', '', '🥸 Tache'], ['bubble', '', '💬 Bubble']].forEach(([t, ch, label]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => add(t, ch); pal.appendChild(b); });
  EMOJI.forEach(ch => { const b = document.createElement('button'); b.textContent = ch; b.style.fontSize = '22px'; b.onclick = () => add('emoji', ch); pal.appendChild(b); });
  for (const [k, v] of Object.entries(FRAMES)) { const o = document.createElement('option'); o.value = k; o.textContent = v; $$('ovframe').appendChild(o); }
  $$('ovframe').onchange = () => { st.frame = $$('ovframe').value; };
  $$('ovcap').oninput = () => { st.caption = $$('ovcap').value; };
  $$('ovcappos').onchange = () => { st.capPos = $$('ovcappos').value; };
  $$('ovdate').onchange = () => { st.date = $$('ovdate').checked; };
  document.querySelectorAll('input[name=ovdrag]').forEach(r => r.onchange = () => { st.drag = document.querySelector('input[name=ovdrag]:checked').value; });
  $$('ovsize').oninput = () => { const s = st.stickers[st.sel]; if (s) s.s = +$$('ovsize').value; };
  $$('ovdel').onclick = () => { if (st.sel >= 0) { st.stickers.splice(st.sel, 1); st.sel = st.stickers.length - 1; } };
  $$('ovclear').onclick = () => { st.stickers.length = 0; st.sel = -1; };
  const view = $$('view');
  const move = ev => { if (typeof tab === 'undefined' || tab !== 'fx' || st.drag !== 'sticker') return; const s = st.stickers[st.sel]; if (!s) return; const r = view.getBoundingClientRect(); s.x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); s.y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)); s.anchor = 'free'; };
  view.addEventListener('pointerdown', move); view.addEventListener('pointermove', ev => { if (ev.buttons) move(ev); });
  return { st, apply, add, active, frameFns };
})();
