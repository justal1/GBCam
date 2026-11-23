'use strict';
// ANSI / BBS art: parse .ANS files (CP437 + ANSI escapes + SAUCE), draw them with a real VGA 8x16 font, and turn them into printer bits.
// An 80x24 screen is 640x384 pixels, so sideways it prints 1:1 on the 384-dot paper.
// Font: Web437 IBM VGA 8x16 from The Ultimate Oldschool PC Font Pack by VileR (CC BY-SA 4.0), see vendor/FONT-CREDIT.txt.
const Ansi = (() => {
  const CP437 = "\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
  const VGA = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
  const VGARGB = VGA.map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const ANSI2VGA = [0, 4, 2, 6, 1, 5, 3, 7];
  const B = { full: 219, lower: 220, left: 221, right: 222, upper: 223, light: 176, med: 177, dark: 178, dh: 205, dv: 186, dtl: 201, dtr: 187, dbl: 200, dbr: 188, h: 196, v: 179, tl: 218, tr: 191, bl: 192, br: 217, sq: 254 };

  // ---------- documents ----------
  function blank(cols, rows) { return { cols, rows, ch: new Uint8Array(cols * rows).fill(32), at: new Uint8Array(cols * rows).fill(7), sauce: null }; }
  function grow(d, rows) { if (rows <= d.rows) return; const ch = new Uint8Array(d.cols * rows).fill(32), at = new Uint8Array(d.cols * rows).fill(7); ch.set(d.ch); at.set(d.at); d.ch = ch; d.at = at; d.rows = rows; }
  const put = (d, x, y, c, fg, bg) => { if (x < 0 || y < 0 || x >= d.cols || y >= d.rows) return; const i = y * d.cols + x; d.ch[i] = typeof c === 'string' ? c.charCodeAt(0) : c; d.at[i] = (fg & 15) | ((bg & 15) << 4); };
  const text = (d, x, y, s, fg, bg) => { for (let i = 0; i < s.length; i++) { const k = CP437.indexOf(s[i]); put(d, x + i, y, k < 0 ? 63 : k, fg, bg); } };

  function parseSauce(bytes) {
    const n = bytes.length; if (n < 128) return { end: n, sauce: null };
    const o = n - 128, tag = String.fromCharCode(...bytes.slice(o, o + 5)); if (tag !== 'SAUCE') return { end: n, sauce: null };
    const str = (a, l) => String.fromCharCode(...bytes.slice(o + a, o + a + l)).replace(/[\u0000]+$/g, '').trim();
    const comments = bytes[o + 104], dt = bytes[o + 94], ft = bytes[o + 95], width = bytes[o + 96] | (bytes[o + 97] << 8);
    let end = o; if (comments) end = Math.max(0, o - comments * 64 - 5);
    while (end > 0 && bytes[end - 1] === 0x1A) end--;
    return { end, sauce: { title: str(7, 35), author: str(42, 20), group: str(62, 20), date: str(82, 8), width: (dt === 1 && (ft === 0 || ft === 1) && width >= 10 && width <= 255) ? width : 0 } };
  }
  function parse(bytes) {
    const { end, sauce } = parseSauce(bytes), cols = sauce && sauce.width ? sauce.width : 80, d = blank(cols, 25); d.sauce = sauce;
    let x = 0, y = 0, fg = 7, bg = 0, bold = false, ice = true, sx = 0, sy = 0, maxY = 0;
    const attr = () => (fg | (bold ? 8 : 0)) | (bg << 4);
    const out = c => { if (x >= cols) { x = 0; y++; } grow(d, y + 2); d.ch[y * cols + x] = c; d.at[y * cols + x] = attr(); x++; if (y > maxY) maxY = y; };
    for (let i = 0; i < end; i++) {
      const c = bytes[i];
      if (c === 0x1A) break;
      if (c === 0x1B && bytes[i + 1] === 0x5B) { // CSI
        let j = i + 2, p = ''; while (j < end && ((bytes[j] >= 0x30 && bytes[j] <= 0x3F))) p += String.fromCharCode(bytes[j++]);
        const cmd = String.fromCharCode(bytes[j]), a = p.split(';').map(v => v === '' ? NaN : +v), n1 = isNaN(a[0]) ? 1 : a[0]; i = j;
        switch (cmd) {
          case 'm': { const list = p === '' ? [0] : a.map(v => isNaN(v) ? 0 : v); for (const v of list) { if (v === 0) { fg = 7; bg = 0; bold = false; } else if (v === 1) bold = true; else if (v === 22) bold = false; else if (v === 5 || v === 6) { /* blink: iCE colours */ } else if (v === 7) { const t = fg; fg = bg & 7; bg = t; } else if (v >= 30 && v <= 37) fg = ANSI2VGA[v - 30]; else if (v >= 40 && v <= 47) bg = ANSI2VGA[v - 40]; else if (v >= 90 && v <= 97) { fg = ANSI2VGA[v - 90]; bold = true; } } break; }
          case 'A': y = Math.max(0, y - n1); break; case 'B': y += n1; grow(d, y + 2); break; case 'C': x = Math.min(cols - 1, x + n1); break; case 'D': x = Math.max(0, x - n1); break;
          case 'H': case 'f': y = Math.max(0, (isNaN(a[0]) ? 1 : a[0]) - 1); x = Math.max(0, Math.min(cols - 1, (isNaN(a[1]) ? 1 : a[1]) - 1)); grow(d, y + 2); break;
          case 'J': if (a[0] === 2) { d.ch.fill(32); d.at.fill(7); x = 0; y = 0; maxY = 0; } break;
          case 'K': { for (let k = x; k < cols; k++) { d.ch[y * cols + k] = 32; d.at[y * cols + k] = attr(); } break; }
          case 's': sx = x; sy = y; break; case 'u': x = sx; y = sy; break;
          default: break;
        }
        continue;
      }
      if (c === 0x0D) { x = 0; continue; } if (c === 0x0A) { y++; x = 0; grow(d, y + 2); if (y > maxY) maxY = y; continue; }
      if (c === 0x09) { x = Math.min(cols - 1, (x + 8) & ~7); continue; } if (c === 0x08) { x = Math.max(0, x - 1); continue; } if (c === 0x1B) continue;
      out(c === 0 ? 32 : c);
    }
    d.rows = Math.max(1, maxY + 1); d.ch = d.ch.slice(0, d.cols * d.rows); d.at = d.at.slice(0, d.cols * d.rows); return d;
  }

  // ---------- font + rendering ----------
  let fontP = null, baseline = 12;
  function ready() {
    if (fontP) return fontP;
    fontP = (async () => {
      try { const f = new FontFace('Web437', 'url(vendor/Web437_IBM_VGA_8x16.woff)'); await f.load(); document.fonts.add(f); } catch (e) { if (typeof log === 'function') log('ANSI font failed', e.message); }
      // find the baseline that makes a full block fill the whole 8x16 cell
      const c = document.createElement('canvas'); c.width = 8; c.height = 16; const x = c.getContext('2d', { willReadFrequently: true }); let best = 12, bn = -1;
      for (let b = 8; b <= 20; b++) { x.clearRect(0, 0, 8, 16); x.fillStyle = '#000'; x.font = '16px Web437'; x.textBaseline = 'alphabetic'; x.fillText(CP437[219], 0, b); const d = x.getImageData(0, 0, 8, 16).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; if (n > bn) { bn = n; best = b; } }
      baseline = best; return true;
    })();
    return fontP;
  }
  function render(doc) { // colour canvas, cols*8 x rows*16
    const c = document.createElement('canvas'); c.width = doc.cols * 8; c.height = doc.rows * 16; const x = c.getContext('2d', { willReadFrequently: true });
    x.font = '16px Web437'; x.textBaseline = 'alphabetic';
    for (let r = 0; r < doc.rows; r++) for (let k = 0; k < doc.cols; k++) {
      const i = r * doc.cols + k, a = doc.at[i], fg = a & 15, bg = a >> 4, ch = doc.ch[i];
      x.fillStyle = VGA[bg]; x.fillRect(k * 8, r * 16, 8, 16); if (ch !== 32 && ch !== 0) { x.fillStyle = VGA[fg]; x.fillText(CP437[ch], k * 8, r * 16 + baseline); }
    }
    return c;
  }
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function ditherCanvas(c, invert) { // colour canvas -> W x h bits (c.width must be 384)
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, bits = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; l = Math.pow(l, 0.8); if (invert) l = 1 - l;
      bits[y * w + x] = l < (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0;
    }
    return bits;
  }
  // doc -> printer bits. dir 'side' = 24-row strips turned a quarter (1:1 pixels); 'up' = whole width scaled to the paper.
  function toBits(doc, o) {
    o = o || {}; const W = 384, dir = o.dir || 'side', paper = o.look !== 'screen', parts = [], full = render(doc);
    if (dir === 'up') {
      const k = W / full.width, c = document.createElement('canvas'); c.width = W; c.height = Math.max(1, Math.round(full.height * k)); const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(full, 0, 0, c.width, c.height);
      parts.push({ bits: ditherCanvas(c, paper), h: c.height });
    } else {
      const per = 24, strips = Math.min(8, Math.ceil(doc.rows / per));
      for (let s = 0; s < strips; s++) {
        const rows = Math.min(per, doc.rows - s * per), sw = full.width, sh = rows * 16;
        // rotate counter-clockwise: the top of the art ends up on the left of the strip, so turn the paper clockwise to read it
        const rot = document.createElement('canvas'); rot.width = W; rot.height = sw; const x = rot.getContext('2d', { willReadFrequently: true }); x.fillStyle = VGA[0]; x.fillRect(0, 0, W, sw);
        x.translate(0, sw); x.rotate(-Math.PI / 2); x.drawImage(full, 0, s * per * 16, sw, sh, 0, 0, sw, sh);
        if (s) parts.push(gap(W));
        parts.push({ bits: ditherCanvas(rot, paper), h: sw });
      }
    }
    const sa = doc.sauce; if (o.caption !== false && sa && (sa.title || sa.author)) parts.push(Prt.textBits([sa.title, sa.author ? 'by ' + sa.author + (sa.group ? ' / ' + sa.group : '') : ''].filter(Boolean).join('\n'), { size: 18, bold: false, pad: 6 }));
    return Prt.stack(parts);
  }
  const gap = W => { const h = 22, b = new Uint8Array(W * h); for (let x = 8; x < W - 8; x += 12) for (let k = 0; k < 6; k++) b[11 * W + x + k] = 1; return { bits: b, h }; };

  // ---------- original art (made for GB CatCam) ----------
  const FONT5 = { // 5x5 block letters
    A: ['01110', '10001', '11111', '10001', '10001'], B: ['11110', '10001', '11110', '10001', '11110'], C: ['01111', '10000', '10000', '10000', '01111'], D: ['11110', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '11110', '10000', '11111'],
    G: ['01111', '10000', '10011', '10001', '01111'], M: ['10001', '11011', '10101', '10001', '10001'], T: ['11111', '00100', '00100', '00100', '00100'], ' ': ['000', '000', '000', '000', '000'],
  };
  function bigText(d, x0, y0, str, colours) { // 5x5 letters drawn with half blocks (2 pixel rows per cell row => 3 cell rows)
    let x = x0; for (let li = 0; li < str.length; li++) { const g = FONT5[str[li]] || FONT5[' ']; const w = g[0].length;
      for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < w; cx++) { const top = g[cy * 2] ? g[cy * 2][cx] === '1' : false, bot = g[cy * 2 + 1] ? g[cy * 2 + 1][cx] === '1' : false; const fgc = colours[(li + cy) % colours.length]; if (top && bot) put(d, x + cx, y0 + cy, B.full, fgc, 0); else if (top) put(d, x + cx, y0 + cy, B.upper, fgc, 0); else if (bot) put(d, x + cx, y0 + cy, B.lower, fgc, 0); }
      x += w + 1; }
    return x - x0;
  }
  function frame(d, x0, y0, w, h, fg, bg) { put(d, x0, y0, B.dtl, fg, bg); put(d, x0 + w - 1, y0, B.dtr, fg, bg); put(d, x0, y0 + h - 1, B.dbl, fg, bg); put(d, x0 + w - 1, y0 + h - 1, B.dbr, fg, bg); for (let i = 1; i < w - 1; i++) { put(d, x0 + i, y0, B.dh, fg, bg); put(d, x0 + i, y0 + h - 1, B.dh, fg, bg); } for (let j = 1; j < h - 1; j++) { put(d, x0, y0 + j, B.dv, fg, bg); put(d, x0 + w - 1, y0 + j, B.dv, fg, bg); } }
  const ART = {
    bbs() {
      const d = blank(80, 24); d.sauce = { title: 'GB CatCam BBS', author: 'GB CatCam', group: '', date: '', width: 80 };
      for (let y = 0; y < 24; y++) for (let x = 0; x < 80; x++) put(d, x, y, (x + y) % 7 === 0 ? B.light : 32, 1, 0);
      frame(d, 2, 1, 76, 22, 11, 0); for (let y = 2; y < 22; y++) for (let x = 3; x < 77; x++) put(d, x, y, 32, 7, 0);
      const w = 'CATCAM'.split('').reduce((a, ch) => a + FONT5[ch][0].length + 1, -1), ox = Math.floor((80 - w) / 2); bigText(d, ox, 3, 'CATCAM', [12, 14, 10, 11, 9, 13]);
      text(d, 28, 7, '- G B   C A T C A M   B B S -', 15, 0); for (let x = 4; x < 76; x++) put(d, x, 8, B.h, 8, 0);
      text(d, 6, 10, 'Connect 14400/ARQ/V.42bis  -  Node 1  -  Callers today: 1337', 3, 0);
      const menu = [['M', 'Message bases', 'Read the latest posts'], ['F', 'File areas', 'Fonts, art packs, utilities'], ['G', 'Door games', 'Play Legend of the Red Cat'], ['P', 'Print a page', 'Send something to the cat printer'], ['Q', 'Quit', 'Goodbye, and thanks for calling']];
      menu.forEach(([k, a, b], i) => { const y = 12 + i * 2; put(d, 8, y, '[', 8, 0); put(d, 9, y, k, 14, 0); put(d, 10, y, ']', 8, 0); text(d, 13, y, a.padEnd(15), 15, 0); text(d, 30, y, b, 7, 0); });
      for (let x = 4; x < 76; x++) put(d, x, 21, B.h, 8, 0); text(d, 6, 22, 'Your choice, caller? ', 10, 0); put(d, 27, 22, B.full, 10, 0); text(d, 50, 22, '[GB CatCam v1]', 8, 0);
      return d;
    },
    plasma() {
      const d = blank(80, 24); d.sauce = { title: 'Plasma', author: 'GB CatCam', group: '', date: '', width: 80 };
      const ramp = [[B.light, 1, 0], [B.med, 1, 0], [B.dark, 1, 0], [B.full, 1, 0], [B.light, 9, 1], [B.med, 9, 1], [B.dark, 9, 1], [B.full, 9, 1], [B.light, 11, 9], [B.med, 11, 9], [B.dark, 11, 9], [B.full, 11, 9], [B.light, 15, 11], [B.med, 15, 11], [B.dark, 15, 11], [B.full, 15, 11]];
      for (let y = 0; y < 24; y++) for (let x = 0; x < 80; x++) { const v = (Math.sin(x * 0.17) + Math.sin(y * 0.4) + Math.sin((x + y) * 0.13) + Math.sin(Math.hypot(x - 40, (y - 12) * 2) * 0.28) + 4) / 8, k = ramp[Math.min(15, Math.floor(v * 16))]; put(d, x, y, k[0], k[1], k[2]); }
      return d;
    },
    copper() {
      const d = blank(80, 24); d.sauce = { title: 'Copper bars', author: 'GB CatCam', group: '', date: '', width: 80 };
      const cols = [[0, 1], [1, 9], [9, 11], [11, 15], [15, 11], [11, 9], [9, 1], [1, 0]];
      for (const [cy, hue] of [[5, 0], [12, 1], [19, 2]]) for (let k = 0; k < 8; k++) { const y = cy - 4 + k; const [bg, fg] = hue === 0 ? [[4, 12, 14, 15, 15, 14, 12, 4][k], 0] : hue === 1 ? [[2, 10, 11, 15, 15, 11, 10, 2][k], 0] : [[5, 13, 12, 15, 15, 12, 13, 5][k], 0]; for (let x = 0; x < 80; x++) put(d, x, y, 32, fg, bg); }
      text(d, 22, 11, '  G B   C A T C A M  ', 0, 15); text(d, 20, 12, '  print your pixels in style  ', 0, 14);
      for (let x = 0; x < 80; x += 2) { put(d, x, 0, B.sq, 8, 0); put(d, x, 23, B.sq, 8, 0); }
      return d;
    },
    cat() {
      const d = blank(80, 24); d.sauce = { title: 'Cat', author: 'GB CatCam', group: '', date: '', width: 80 };
      let s = 1337; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      for (let i = 0; i < 90; i++) put(d, Math.floor(r() * 80), Math.floor(r() * 24), r() < 0.5 ? '.' : '+', r() < 0.5 ? 8 : 7, 0);
      // pixel buffer: 2 pixel rows per cell row, so 80 x 48 pixels; draw a cat head with maths
      const PW = 80, PH = 48, px = new Uint8Array(PW * PH); // 0 none, colour index + 1
      const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < PW && y < PH) px[y * PW + x] = c + 1; };
      const ell = (cx, cy, rx, ry, c) => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, c); };
      const tri = (a, b, c3, col) => { const minx = Math.min(a[0], b[0], c3[0]), maxx = Math.max(a[0], b[0], c3[0]), miny = Math.min(a[1], b[1], c3[1]), maxy = Math.max(a[1], b[1], c3[1]); const sign = (p, q, w) => (p[0] - w[0]) * (q[1] - w[1]) - (q[0] - w[0]) * (p[1] - w[1]); for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) { const p = [x, y], d1 = sign(p, a, b), d2 = sign(p, b, c3), d3 = sign(p, c3, a); if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) set(x, y, col); } };
      tri([22, 20], [28, 4], [40, 16], 6); tri([58, 20], [52, 4], [40, 16], 6); tri([26, 17], [29, 9], [36, 16], 12); tri([54, 17], [51, 9], [44, 16], 12);
      ell(40, 30, 24, 15, 6); ell(40, 36, 12, 8, 14);
      ell(31, 27, 5, 4, 15); ell(49, 27, 5, 4, 15); ell(31, 27, 2, 4, 0); ell(49, 27, 2, 4, 0); set(30, 25, 15); set(48, 25, 15);
      tri([37, 33], [43, 33], [40, 37], 12); for (let i = 0; i < 13; i++) { set(40, 37 + (i > 6 ? 0 : 0), 0); } set(40, 38, 0); set(40, 39, 0); for (let i = 1; i <= 5; i++) { set(40 - i, 39 + (i > 2 ? 1 : 0), 0); set(40 + i, 39 + (i > 2 ? 1 : 0), 0); }
      for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) for (let i = 4; i < 20; i++) set(40 + sd * (6 + i), 36 + k * 3 - Math.round(i * 0.15 * (k - 1)), 15);
      for (let cy = 0; cy < 24; cy++) for (let x = 0; x < 80; x++) { const t = px[(cy * 2) * PW + x] - 1, b = px[(cy * 2 + 1) * PW + x] - 1; if (t < 0 && b < 0) continue; if (t >= 0 && b >= 0 && t === b) put(d, x, cy, B.full, t, 0); else if (t >= 0 && b >= 0) put(d, x, cy, B.upper, t, b); else if (t >= 0) put(d, x, cy, B.upper, t, 0); else put(d, x, cy, B.lower, b, 0); }
      text(d, 33, 22, 'M E O W', 14, 0); return d;
    },
  };
  const NAMES = { bbs: 'GB CatCam BBS screen', cat: 'Cat', plasma: 'Plasma', copper: 'Copper bars' };
  return { parse, render, toBits, ready, ART, NAMES, blank, CP437, VGA, put, text };
})();
