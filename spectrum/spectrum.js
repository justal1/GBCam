'use strict';
// ZX Spectrum 48K: Z80 + ULA (screen, keyboard, beeper), fast tape loading/saving and a ZX Printer (COPY, LPRINT, LLIST).
class Spectrum {
  constructor(rom) {
    this.mem = new Uint8Array(65536); this.mem.set(rom.subarray(0, 16384), 0);
    this.keys = new Uint8Array(8).fill(0xFF); this.border = 7; this.flash = false; this.frames = 0;
    this.tape = { blocks: [], pos: 0 }; this.recorded = []; this.onPrint = null; this.onSave = null; this.onLoad = null;
    this.beeper = 0; this.beepLog = []; this.tFrame = 0; this.pending = [];
    const self = this;
    this.cpu = new Z80({
      rd: a => self.mem[a], wr: (a, v) => { if (a >= 0x4000) self.mem[a] = v; },
      in: port => self.portIn(port), out: (port, v) => self.portOut(port, v),
    });
    this.reset();
  }
  reset() { const c = this.cpu; this.mem.fill(0, 0x4000); c.R.fill(0); c.sh.fill(0); c.f = c.fs = 0; c.pc = 0; c.sp = 0xFFFF; c.ix = c.iy = 0; c.i = c.r = 0; c.iff1 = c.iff2 = false; c.im = 0; c.halted = false; c.eiDelay = false; this.border = 7; this.tFrame = 0; this.beepLog = []; }
  // ---- ports ----
  portIn(port) {
    if (!(port & 1)) { let v = 0xFF; for (let r = 0; r < 8; r++) if (!(port & (0x100 << r))) v &= this.keys[r]; return (v & 0x1F) | 0xA0; }
    if ((port & 0xFF) === 0x1F) return 0; // Kempston joystick: nothing pressed
    return 0xFF;
  }
  portOut(port, v) { if (!(port & 1)) { this.border = v & 7; const b = (v >> 4) & 1; if (b !== this.beeper) { this.beeper = b; this.beepLog.push([this.tFrame, b]); } } }
  // ---- keyboard ----
  setKey(row, bit, down) { if (down) this.keys[row] &= ~(1 << bit); else this.keys[row] |= (1 << bit); }
  // ---- running ----
  static get FRAME() { return 69888; }
  runFrame() {
    const c = this.cpu, FR = 69888; this.beepStart = this.beeper; this.beepLog = [];
    this.tFrame = c.interrupt() || 0; // the ULA raises INT at the start of every frame
    while (this.tFrame < FR) {
      const pc = c.pc;
      if (pc === 0x0556 && this.tape.blocks.length && this.trapLoad()) continue;
      else if (pc === 0x04C2 && this.trapSave()) continue;
      else if (pc === 0x0EAC) { this.printScreen(); c.pc = 0x0EDA; continue; }
      else if (pc === 0x0ECD) { this.printBuffer(); c.pc = 0x0EDA; continue; }
      this.tFrame += c.step();
    }
    this.frames++; if ((this.frames & 15) === 0) this.flash = !this.flash;
  }
  // ---- traps ----
  restoreBorder() { this.border = (this.mem[0x5C48] >> 3) & 7; }
  trapLoad() {
    const c = this.cpu, flag = c.R[7], isLoad = (c.f & 1) !== 0; let dest = c.ix, len = c.de, blk = null;
    while (this.tape.pos < this.tape.blocks.length) { const b = this.tape.blocks[this.tape.pos++]; if (b[0] === flag) { blk = b; break; } }
    if (!blk) { c.f &= ~1; this.finishTrap(); return true; } // nothing on the tape: "R Tape loading error"
    const have = blk.length - 2; let ok = have >= len;
    const n = Math.min(len, have);
    if (isLoad) for (let i = 0; i < n; i++) { const a = (dest + i) & 0xFFFF; if (a >= 0x4000) this.mem[a] = blk[1 + i]; }
    if (have !== len) ok = false;
    if (ok) c.f |= 1; else c.f &= ~1;
    c.ix = (dest + n) & 0xFFFF; c.de = len - n; if (this.onLoad) this.onLoad(blk, ok);
    this.finishTrap(); return true;
  }
  trapSave() {
    const c = this.cpu, flag = c.R[7], len = c.de, st = c.ix, data = new Uint8Array(len);
    for (let i = 0; i < len; i++) data[i] = this.mem[(st + i) & 0xFFFF];
    const b = ZXBasic.block(flag, data); this.recorded.push(b); if (this.onSave) this.onSave(b, this.recorded.slice()); c.f |= 1; this.finishTrap(); return true;
  }
  finishTrap() { this.restoreBorder(); this.cpu.pc = this.cpu.pop(); this.cpu.iff1 = this.cpu.iff2 = true; }
  // ---- printer ----
  screenBits(rows) { // 256 x rows pixels from the display file; 1 = ink (what a ZX Printer burns)
    const w = 256, bits = new Uint8Array(w * rows);
    for (let y = 0; y < rows; y++) { const a = 0x4000 | ((y & 0xC0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2); for (let x = 0; x < 32; x++) { const b = this.mem[a + x]; for (let k = 0; k < 8; k++) bits[y * w + x * 8 + k] = (b >> (7 - k)) & 1; } }
    return { bits, w, h: rows };
  }
  printScreen() { if (this.onPrint) this.onPrint(this.screenBits(176), 'copy'); }
  printBuffer() { const w = 256, bits = new Uint8Array(w * 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) { const b = this.mem[0x5B00 + y * 32 + x]; for (let k = 0; k < 8; k++) bits[y * w + x * 8 + k] = (b >> (7 - k)) & 1; } if (this.onPrint) this.onPrint({ bits, w, h: 8 }, 'line'); }
  // ---- picture ----
  static get PAL() { return [[0, 0, 0], [0, 0, 0xD7], [0xD7, 0, 0], [0xD7, 0, 0xD7], [0, 0xD7, 0], [0, 0xD7, 0xD7], [0xD7, 0xD7, 0], [0xD7, 0xD7, 0xD7], [0, 0, 0], [0, 0, 0xFF], [0xFF, 0, 0], [0xFF, 0, 0xFF], [0, 0xFF, 0], [0, 0xFF, 0xFF], [0xFF, 0xFF, 0], [0xFF, 0xFF, 0xFF]]; }
  draw(img, bw) { // img: ImageData of (256 + 2*bw) x (192 + 2*bw)
    const W = 256 + 2 * bw, d = new Uint32Array(img.data.buffer), P = Spectrum.PAL.map(c => 0xFF000000 | (c[2] << 16) | (c[1] << 8) | c[0]), mem = this.mem, bc = P[this.border];
    d.fill(bc);
    for (let y = 0; y < 192; y++) {
      const da = 0x4000 | ((y & 0xC0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2), aa = 0x5800 + ((y >> 3) << 5), o = (y + bw) * W + bw;
      for (let x = 0; x < 32; x++) {
        const at = mem[aa + x], bright = (at & 0x40) ? 8 : 0; let ink = (at & 7) + bright, paper = ((at >> 3) & 7) + bright; if ((at & 0x80) && this.flash) { const t = ink; ink = paper; paper = t; }
        const b = mem[da + x], p = o + x * 8; for (let k = 0; k < 8; k++) d[p + k] = (b & (0x80 >> k)) ? P[ink] : P[paper];
      }
    }
  }
  // ---- sound: turn the beeper toggles of the last frame into samples ----
  audio(n) {
    const out = new Float32Array(n), log = this.beepLog, FR = 69888; if (!log.length) return out; // silent unless the beeper moved this frame
    let li = 0, level = this.beepStart;
    for (let i = 0; i < n; i++) { const t = i * FR / n; while (li < log.length && log[li][0] <= t) { level = log[li][1]; li++; } out[i] = level ? 0.18 : -0.18; }
    return out;
  }
  // ---- tape helpers ----
  insert(blocks) { this.tape = { blocks, pos: 0 }; }
}
// Keys: name -> [row, bit] on the keyboard matrix (rows are the 8 half-rows, bits 0..4 from the outside in)
Spectrum.MATRIX = (() => { const rows = [['CAPS', 'Z', 'X', 'C', 'V'], ['A', 'S', 'D', 'F', 'G'], ['Q', 'W', 'E', 'R', 'T'], ['1', '2', '3', '4', '5'], ['0', '9', '8', '7', '6'], ['P', 'O', 'I', 'U', 'Y'], ['ENTER', 'L', 'K', 'J', 'H'], ['SPACE', 'SYM', 'M', 'N', 'B']], m = {}; rows.forEach((r, i) => r.forEach((k, j) => { m[k] = [i, j]; })); return m; })();
if (typeof window !== 'undefined') window.Spectrum = Spectrum;
