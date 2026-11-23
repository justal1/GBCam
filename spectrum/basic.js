'use strict';
// ZX Spectrum BASIC: turn a text listing into the tokenised bytes the Spectrum stores, and wrap them as .TAP tape blocks.
const ZXBasic = (() => {
  const KW = ['RND', 'INKEY$', 'PI', 'FN', 'POINT', 'SCREEN$', 'ATTR', 'AT', 'TAB', 'VAL$', 'CODE', 'VAL', 'LEN', 'SIN', 'COS', 'TAN', 'ASN', 'ACS', 'ATN', 'LN', 'EXP', 'INT', 'SQR', 'SGN', 'ABS', 'PEEK', 'IN', 'USR', 'STR$', 'CHR$', 'NOT', 'BIN', 'OR', 'AND', '<=', '>=', '<>', 'LINE', 'THEN', 'TO', 'STEP', 'DEF FN', 'CAT', 'FORMAT', 'MOVE', 'ERASE', 'OPEN #', 'CLOSE #', 'MERGE', 'VERIFY', 'BEEP', 'CIRCLE', 'INK', 'PAPER', 'FLASH', 'BRIGHT', 'INVERSE', 'OVER', 'OUT', 'LPRINT', 'LLIST', 'STOP', 'READ', 'DATA', 'RESTORE', 'NEW', 'BORDER', 'CONTINUE', 'DIM', 'REM', 'FOR', 'GO TO', 'GO SUB', 'INPUT', 'LOAD', 'LIST', 'LET', 'PAUSE', 'NEXT', 'POKE', 'PRINT', 'PLOT', 'RUN', 'SAVE', 'RANDOMIZE', 'IF', 'CLS', 'DRAW', 'CLEAR', 'RETURN', 'COPY'];
  // token codes run 0xA5.. in this order
  const TOK = KW.map((k, i) => ({ text: k, key: k.replace(/ /g, ''), code: 0xA5 + i }));
  const ALIAS = [['GOTO', 0xEC], ['GOSUB', 0xED], ['RAND', 0xF9], ['CONT', 0xE8]];
  const MATCH = TOK.map(t => ({ key: t.key, code: t.code })).concat(ALIAS.map(([key, code]) => ({ key, code }))).sort((a, b) => b.key.length - a.key.length);
  const REM = 0xEA;

  function float5(v) {
    if (Number.isInteger(v) && v >= -65535 && v <= 65535) { const n = v < 0 ? v + 65536 : v; return [0, v < 0 ? 0xFF : 0, n & 255, n >> 8, 0]; }
    if (v === 0) return [0, 0, 0, 0, 0];
    const neg = v < 0; v = Math.abs(v); let e = Math.floor(Math.log2(v)) + 1; let m = v / Math.pow(2, e); // 0.5 <= m < 1
    if (m >= 1) { m /= 2; e++; } if (m < 0.5) { m *= 2; e--; }
    let mant = Math.round(m * 4294967296); if (mant >= 4294967296) { mant = 2147483648; e++; }
    return [e + 128, ((mant >>> 24) & 0x7F) | (neg ? 0x80 : 0), (mant >>> 16) & 255, (mant >>> 8) & 255, mant & 255];
  }
  const isAlpha = c => /[A-Za-z]/.test(c), isDigit = c => /[0-9]/.test(c);

  function tokeniseLine(text) { // statement text only (no line number)
    const out = []; let i = 0, prevIdent = false, rem = false;
    const raw = c => out.push(c.charCodeAt(0) & 255);
    while (i < text.length) {
      const c = text[i];
      if (rem) { raw(c); i++; continue; }
      if (c === '"') { raw(c); i++; while (i < text.length) { raw(text[i]); if (text[i] === '"') { if (text[i + 1] === '"') { i++; raw('"'); } else { i++; break; } } i++; } prevIdent = false; continue; }
      if (c === ' ') { i++; prevIdent = false; continue; }
      // keyword (uppercase, not in the middle of a name)
      if (c >= 'A' && c <= 'Z' && !prevIdent) {
        let hit = null; const rest = text.slice(i).replace(/ /g, ''); // allow "GO TO", "DEF FN" with spaces: compare despaced
        for (const m of MATCH) { if (rest.startsWith(m.key)) { hit = m; break; } }
        if (hit) { // consume the original characters that made up the keyword (skipping spaces)
          let need = hit.key.length, j = i; while (need > 0) { if (text[j] !== ' ') need--; j++; } i = j; out.push(hit.code); if (hit.code === REM) { rem = true; if (text[i] === ' ') i++; } prevIdent = false; continue;
        }
      }
      if (c === '<' && text[i + 1] === '=') { out.push(0xC7); i += 2; prevIdent = false; continue; }
      if (c === '>' && text[i + 1] === '=') { out.push(0xC8); i += 2; prevIdent = false; continue; }
      if (c === '<' && text[i + 1] === '>') { out.push(0xC9); i += 2; prevIdent = false; continue; }
      if ((isDigit(c) || (c === '.' && isDigit(text[i + 1] || ''))) && !prevIdent) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(i)); const s = m[0]; for (const ch of s) raw(ch); i += s.length; out.push(0x0E, ...float5(parseFloat(s))); prevIdent = false; continue;
      }
      if (isAlpha(c)) { raw(c); i++; prevIdent = true; continue; }
      if (isDigit(c)) { raw(c); i++; continue; } // digits that belong to a variable name
      raw(c); i++; prevIdent = false;
    }
    out.push(0x0D); return out;
  }
  function compile(listing) { // "10 PRINT ..." lines -> program bytes
    const lines = [];
    for (const l of String(listing).split(/\r?\n/)) { const m = /^\s*(\d{1,4})\s+(.*)$/.exec(l); if (!m) continue; lines.push([+m[1], m[2].replace(/\s+$/, '')]); }
    lines.sort((a, b) => a[0] - b[0]); const bytes = [];
    for (const [n, t] of lines) { const body = tokeniseLine(t); bytes.push(n >> 8, n & 255, body.length & 255, body.length >> 8, ...body); }
    return { bytes: Uint8Array.from(bytes), lines: lines.length };
  }
  const xor = a => { let c = 0; for (const b of a) c ^= b; return c; };
  function block(flag, data) { const a = new Uint8Array(data.length + 2); a[0] = flag; a.set(data, 1); a[a.length - 1] = xor(a.subarray(0, a.length - 1)); return a; }
  // BASIC program -> two tape blocks (header + data); autostart = line number or -1 for none
  function programTape(name, listing, autostart) {
    const { bytes } = compile(listing), hdr = new Uint8Array(17), nm = (name + '          ').slice(0, 10);
    hdr[0] = 0; for (let i = 0; i < 10; i++) hdr[1 + i] = nm.charCodeAt(i) & 255; hdr[11] = bytes.length & 255; hdr[12] = bytes.length >> 8;
    const a = autostart == null || autostart < 0 ? 0x8000 : autostart; hdr[13] = a & 255; hdr[14] = a >> 8; hdr[15] = bytes.length & 255; hdr[16] = bytes.length >> 8;
    return [block(0x00, hdr), block(0xFF, bytes)];
  }
  const toTap = blocks => { const parts = []; for (const b of blocks) { parts.push(Uint8Array.of(b.length & 255, b.length >> 8), b); } let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const fromTap = bytes => { const out = []; let i = 0; while (i + 2 <= bytes.length) { const n = bytes[i] | (bytes[i + 1] << 8); i += 2; if (i + n > bytes.length) break; out.push(bytes.slice(i, i + n)); i += n; } return out; };
  const describe = b => { // short description of a block for the tape list
    if (b[0] === 0 && b.length === 19) { const type = ['Program', 'Number array', 'Character array', 'Bytes'][b[1]] || 'Header', name = String.fromCharCode(...b.slice(2, 12)).trim(); return `${type}: ${name}`; }
    return `Data block (${b.length - 2} bytes)`;
  };
  // the other direction: program bytes -> readable listing (for a quick look at what was saved)
  const NAMES = [''].concat([]); const TEXT = {}; for (const t of TOK) TEXT[t.code] = t.text;
  function list(bytes) {
    const out = []; let i = 0;
    while (i + 4 <= bytes.length) { const n = (bytes[i] << 8) | bytes[i + 1], len = bytes[i + 2] | (bytes[i + 3] << 8); i += 4; let s = '', k = 0, rem = false; while (k < len - 1) { const c = bytes[i + k]; if (c === 0x0E) { k += 6; continue; } if (!rem && c >= 0xA5) { if (c === REM) rem = true; s += (s && !/[ (]$/.test(s) ? ' ' : '') + (TEXT[c] || '?') + ' '; } else s += c >= 32 && c < 127 ? String.fromCharCode(c) : '?'; k++; } out.push(n + ' ' + s.trim()); i += len; }
    return out.join('\n');
  }
  return { compile, programTape, toTap, fromTap, describe, list, block, float5, KW };
})();
if (typeof window !== 'undefined') window.ZXBasic = ZXBasic;
