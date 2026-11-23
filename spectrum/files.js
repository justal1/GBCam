'use strict';
// File formats for the ZX tab: ZIP (stored + deflate, via the browser's own decompressor), TZX tapes, and .SNA / .Z80 snapshots.
const ZXFiles = (() => {
  const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  // ---------- ZIP ----------
  function zipList(bytes) {
    let e = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054B50) { e = i; break; }
    if (e < 0) throw new Error('not a ZIP file'); const n = u16(bytes, e + 10); let p = u32(bytes, e + 16); const out = [];
    for (let i = 0; i < n; i++) { if (u32(bytes, p) !== 0x02014B50) break; const nl = u16(bytes, p + 28), xl = u16(bytes, p + 30), cl = u16(bytes, p + 32); out.push({ name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl)), method: u16(bytes, p + 10), csize: u32(bytes, p + 20), size: u32(bytes, p + 24), off: u32(bytes, p + 42) }); p += 46 + nl + xl + cl; }
    return out.filter(x => !x.name.endsWith('/'));
  }
  async function zipRead(bytes, ent) {
    const o = ent.off; if (u32(bytes, o) !== 0x04034B50) throw new Error('bad ZIP entry'); const s = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28), raw = bytes.subarray(s, s + ent.csize);
    if (ent.method === 0) return raw.slice();
    if (ent.method !== 8) throw new Error('unsupported ZIP compression (method ' + ent.method + ')');
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unzip (needs a recent Chrome)');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(raw); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  // ---------- TZX -> blocks (standard and turbo speed data blocks; the fast loader only needs their bytes) ----------
  function tzxBlocks(b) {
    if (String.fromCharCode(...b.subarray(0, 7)) !== 'ZXTape!') throw new Error('not a TZX file'); const out = []; let p = 10;
    const skip = { 0x12: () => 4, 0x13: () => 1 + 2 * b[p + 1], 0x14: () => 10 + (b[p + 8] | (b[p + 9] << 8) | (b[p + 10] << 16)), 0x15: () => 8 + (b[p + 6] | (b[p + 7] << 8) | (b[p + 8] << 16)), 0x18: () => 4 + u32(b, p + 1), 0x19: () => 4 + u32(b, p + 1), 0x20: () => 2, 0x21: () => 1 + b[p + 1], 0x22: () => 0, 0x23: () => 2, 0x24: () => 2, 0x25: () => 0, 0x26: () => 2 + 2 * u16(b, p + 1), 0x27: () => 0, 0x28: () => 2 + u16(b, p + 1), 0x2A: () => 4, 0x2B: () => 5, 0x30: () => 1 + b[p + 1], 0x31: () => 2 + b[p + 2], 0x32: () => 2 + u16(b, p + 1), 0x33: () => 1 + 3 * b[p + 1], 0x35: () => 20 + u32(b, p + 17), 0x5A: () => 9 };
    while (p < b.length) {
      const id = b[p];
      if (id === 0x10) { const len = u16(b, p + 3); out.push(b.slice(p + 5, p + 5 + len)); p += 5 + len; }
      else if (id === 0x11) { const len = b[p + 16] | (b[p + 17] << 8) | (b[p + 18] << 16); out.push(b.slice(p + 19, p + 19 + len)); p += 19 + len; }
      else if (skip[id]) { const n = skip[id](); p += 1 + n; } else throw new Error('this TZX uses a block type (0x' + id.toString(16) + ') that cannot be loaded quickly');
    }
    return out;
  }
  // ---------- snapshots ----------
  function loadSna(spec, b) {
    if (b.length !== 49179) throw new Error('only 48K .SNA snapshots are supported');
    const c = spec.cpu, R = c.R; c.i = b[0]; c.sh[4] = b[1]; c.sh[5] = b[2]; c.sh[2] = b[3]; c.sh[3] = b[4]; c.sh[0] = b[5]; c.sh[1] = b[6]; c.fs = b[7]; c.sh[7] = b[8];
    R[5] = b[9]; R[4] = b[10]; R[3] = b[11]; R[2] = b[12]; R[1] = b[13]; R[0] = b[14]; c.iy = u16(b, 15); c.ix = u16(b, 17); c.iff1 = c.iff2 = !!(b[19] & 4); c.r = b[20]; c.f = b[21]; R[7] = b[22]; c.sp = u16(b, 23); c.im = b[25]; spec.border = b[26] & 7;
    spec.mem.set(b.subarray(27), 0x4000); c.pc = spec.mem[c.sp] | (spec.mem[(c.sp + 1) & 0xFFFF] << 8); c.sp = (c.sp + 2) & 0xFFFF; c.halted = false; c.eiDelay = false;
  }
  function saveSna(spec) {
    const c = spec.cpu, R = c.R, b = new Uint8Array(49179); b[0] = c.i; b[1] = c.sh[4]; b[2] = c.sh[5]; b[3] = c.sh[2]; b[4] = c.sh[3]; b[5] = c.sh[0]; b[6] = c.sh[1]; b[7] = c.fs; b[8] = c.sh[7]; b[9] = R[5]; b[10] = R[4]; b[11] = R[3]; b[12] = R[2]; b[13] = R[1]; b[14] = R[0];
    b[15] = c.iy & 255; b[16] = c.iy >> 8; b[17] = c.ix & 255; b[18] = c.ix >> 8; b[19] = c.iff2 ? 4 : 0; b[20] = c.r; b[21] = c.f; b[22] = R[7]; let sp = (c.sp - 2) & 0xFFFF; b[25] = c.im; b[26] = spec.border;
    const m = spec.mem.slice(); m[sp] = c.pc & 255; m[(sp + 1) & 0xFFFF] = c.pc >> 8; b[23] = sp & 255; b[24] = sp >> 8; b.set(m.subarray(0x4000), 27); return b;
  }
  function unpack(src, out, len) { // .Z80 run-length coding: ED ED count byte
    let i = 0, o = 0; while (i < src.length && o < len) { if (src[i] === 0xED && src[i + 1] === 0xED && i + 3 < src.length + 1) { const n = src[i + 2], v = src[i + 3]; for (let k = 0; k < n && o < len; k++) out[o++] = v; i += 4; } else out[o++] = src[i++]; } return o;
  }
  function loadZ80(spec, b) {
    const c = spec.cpu, R = c.R; let pc = u16(b, 6), hdr = 30, ram = new Uint8Array(49152), ver = 1, flags = b[12] === 255 ? 1 : b[12];
    if (pc === 0) { ver = 2; const xl = u16(b, 30); hdr = 32 + xl; pc = u16(b, 32); if (xl >= 54) ver = 3; const hw = b[34]; if (!(ver === 2 ? hw < 3 : hw < 4)) throw new Error('only 48K .Z80 snapshots are supported'); }
    if (ver === 1) { const body = b.subarray(30); if (flags & 32) unpack(body, ram, 49152); else ram.set(body.subarray(0, 49152)); }
    else { let p = hdr; while (p + 3 <= b.length) { const len = u16(b, p), page = b[p + 2], base = page === 8 ? 0 : page === 4 ? 0x4000 : page === 5 ? 0x8000 : -1; p += 3; if (base < 0) { p += len === 0xFFFF ? 16384 : len; continue; } const seg = len === 0xFFFF ? b.subarray(p, p + 16384) : b.subarray(p, p + len); if (len === 0xFFFF) ram.set(seg, base); else { const tmp = new Uint8Array(16384); unpack(seg, tmp, 16384); ram.set(tmp, base); } p += len === 0xFFFF ? 16384 : len; } }
    R[7] = b[0]; c.f = b[1]; R[1] = b[2]; R[0] = b[3]; R[5] = b[4]; R[4] = b[5]; c.sp = u16(b, 8); c.i = b[10]; c.r = (b[11] & 0x7F) | ((flags & 1) << 7); spec.border = (flags >> 1) & 7; R[3] = b[13]; R[2] = b[14]; c.sh[1] = b[15]; c.sh[0] = b[16]; c.sh[3] = b[17]; c.sh[2] = b[18]; c.sh[5] = b[19]; c.sh[4] = b[20]; c.sh[7] = b[21]; c.fs = b[22]; c.iy = u16(b, 23); c.ix = u16(b, 25); c.iff1 = !!b[27]; c.iff2 = !!b[28]; c.im = b[29] & 3; c.pc = pc; c.halted = false; c.eiDelay = false;
    spec.mem.set(ram, 0x4000);
  }
  const ext = n => (/\.([^.\/]+)$/.exec(n.toLowerCase()) || [])[1] || '';
  return { zipList, zipRead, tzxBlocks, loadSna, saveSna, loadZ80, ext };
})();
if (typeof window !== 'undefined') window.ZXFiles = ZXFiles;
