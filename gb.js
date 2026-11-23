'use strict';
// Minimal DMG Game Boy emulator with Pocket Camera (cart type 0xFC) support and a Game Boy Printer on the link port.
// No audio. Written for CatCam.

class GBPrinter {
  constructor() { this.onPage = null; this.pending = []; this.buf = []; this.st = 0; this.err = 0; this.flags = 0; this.busyUntil = 0; }
  transfer(b, now) {
    let reply = 0;
    switch (this.st) {
      case 0: if (b === 0x88) this.st = 1; break;
      case 1: this.st = b === 0x33 ? 2 : b === 0x88 ? 1 : 0; break;
      case 2: this.cmd = b; this.st = 3; break;
      case 3: this.comp = b; this.st = 4; break;
      case 4: this.len = b; this.st = 5; break;
      case 5: this.len |= b << 8; this.data = []; this.sum = this.cmd + this.comp + (this.len & 255) + (this.len >> 8); this.st = this.len ? 6 : 7; break;
      case 6: this.data.push(b); this.sum += b; if (this.data.length >= this.len) this.st = 7; break;
      case 7: this.chk = b; this.st = 8; break;
      case 8: this.chk |= b << 8; this.st = 9; break;
      case 9: reply = 0x81; this.st = 10; break;
      case 10: reply = this.statusByte(now); this.exec(now); this.st = 0; break; // a real printer answers with its status from before it acts on the command
    }
    return reply;
  }
  statusByte(now) { let s = this.err & 1; if (now < this.busyUntil) s |= 0x06; else if (this.flags & 8) s |= 0x08; return s; }
  exec(now) {
    if ((this.sum & 0xFFFF) !== this.chk) { this.err |= 1; return; } this.err &= ~1;
    switch (this.cmd) {
      case 1: if (this.pending.length) this.emit(); this.buf = []; this.flags = 0; break;
      case 4:
        if (this.comp) { const d = this.data; for (let i = 0; i < d.length;) { const c = d[i++]; if (c & 0x80) { const n = (c & 0x7F) + 2, v = d[i++]; for (let k = 0; k < n; k++) this.buf.push(v); } else { const n = c + 1; for (let k = 0; k < n; k++) this.buf.push(d[i++]); } } }
        else for (const v of this.data) this.buf.push(v);
        this.flags |= 8; break;
      case 2: {
        const m = this.data[1] | 0, pal = this.data[2] === undefined ? 0xE4 : this.data[2];
        const rows = Math.floor(this.buf.length / 320);
        if (rows) { const out = new Uint8Array(160 * rows * 8);
          for (let tr = 0; tr < rows; tr++) for (let tc = 0; tc < 20; tc++) for (let py = 0; py < 8; py++) {
            const a = (tr * 20 + tc) * 16 + py * 2, b1 = this.buf[a], b2 = this.buf[a + 1];
            for (let px = 0; px < 8; px++) { const bit = 7 - px, col = ((b1 >> bit) & 1) | (((b2 >> bit) & 1) << 1); out[(tr * 8 + py) * 160 + tc * 8 + px] = (pal >> (col * 2)) & 3; } }
          this.pending.push(out); }
        this.buf = []; this.flags &= ~8; this.busyUntil = now + 400000;
        if ((m & 0x0F) !== 0 || !rows) { if (this.pending.length) this.emit(); }
        break; }
    }
  }
  emit() {
    let n = 0; for (const p of this.pending) n += p.length;
    const px = new Uint8Array(n); let o = 0; for (const p of this.pending) { px.set(p, o); o += p.length; }
    this.pending = []; if (this.onPage) this.onPage({ w: 160, h: n / 160, shades: px });
  }
}


class APU {
  constructor() { this.reset(); this.sampleCycles = 4194304 / 44100; this.on = false; this.buf = new Float32Array(1 << 15); this.w = 0; this.r = 0; }
  reset() {
    this.regs = new Uint8Array(0x30); this.power = false; this.cyc = 0; this.seqCyc = 0; this.seq = 0;
    const ch = () => ({ on: false, dac: false, len: 0, lenEn: false, vol: 0, initVol: 0, envDir: 0, envPer: 0, envTimer: 0, freq: 0, phase: 0, duty: 0, step: 0 });
    this.c1 = ch(); this.c2 = ch(); this.c3 = ch(); this.c4 = ch();
    this.c1.sweepPer = 0; this.c1.sweepShift = 0; this.c1.sweepDir = 0; this.c1.sweepTimer = 0; this.c1.shadow = 0; this.c1.sweepOn = false;
    this.c3.shift = 4; this.c3.pos = 0; this.c4.lfsr = 0x7FFF; this.c4.clk = 8; this.c4.width7 = false; this.c4.acc = 0;
    this.nr50 = 0; this.nr51 = 0;
  }
  static MASK = [0x80, 0x3F, 0x00, 0xFF, 0xBF, 0xFF, 0x3F, 0x00, 0xFF, 0xBF, 0x7F, 0xFF, 0x9F, 0xFF, 0xBF, 0xFF, 0xFF, 0x00, 0x00, 0xBF, 0x00, 0x00, 0x70];
  read(r) { // r = 0x10..0x3F
    if (r >= 0x30) return this.regs[r - 0x10];
    if (r === 0x26) return 0x70 | (this.power ? 0x80 : 0) | (this.c1.on ? 1 : 0) | (this.c2.on ? 2 : 0) | (this.c3.on ? 4 : 0) | (this.c4.on ? 8 : 0);
    const m = APU.MASK[r - 0x10]; return m === undefined ? 0xFF : (this.regs[r - 0x10] | m);
  }
  write(r, v) {
    if (r >= 0x30) { this.regs[r - 0x10] = v; return; }
    if (r === 0x26) { const p = (v & 0x80) !== 0; if (!p && this.power) { const w = this.regs.slice(0x20); this.reset(); this.regs.set(w, 0x20); } this.power = p; return; }
    if (!this.power) return;
    this.regs[r - 0x10] = v;
    const c1 = this.c1, c2 = this.c2, c3 = this.c3, c4 = this.c4;
    switch (r) {
      case 0x10: c1.sweepPer = (v >> 4) & 7; c1.sweepDir = (v >> 3) & 1; c1.sweepShift = v & 7; break;
      case 0x11: c1.duty = v >> 6; c1.len = 64 - (v & 63); break;
      case 0x12: this.env(c1, v); break;
      case 0x13: c1.freq = (c1.freq & 0x700) | v; break;
      case 0x14: c1.freq = (c1.freq & 0xFF) | ((v & 7) << 8); c1.lenEn = (v & 0x40) !== 0; if (v & 0x80) this.trig1(); break;
      case 0x16: c2.duty = v >> 6; c2.len = 64 - (v & 63); break;
      case 0x17: this.env(c2, v); break;
      case 0x18: c2.freq = (c2.freq & 0x700) | v; break;
      case 0x19: c2.freq = (c2.freq & 0xFF) | ((v & 7) << 8); c2.lenEn = (v & 0x40) !== 0; if (v & 0x80) this.trig(c2); break;
      case 0x1A: c3.dac = (v & 0x80) !== 0; if (!c3.dac) c3.on = false; break;
      case 0x1B: c3.len = 256 - v; break;
      case 0x1C: c3.shift = [4, 0, 1, 2][(v >> 5) & 3]; break;
      case 0x1D: c3.freq = (c3.freq & 0x700) | v; break;
      case 0x1E: c3.freq = (c3.freq & 0xFF) | ((v & 7) << 8); c3.lenEn = (v & 0x40) !== 0; if (v & 0x80) { if (c3.len === 0) c3.len = 256; c3.on = c3.dac; c3.phase = 0; c3.pos = 0; } break;
      case 0x20: c4.len = 64 - (v & 63); break;
      case 0x21: this.env(c4, v); break;
      case 0x22: { const d = v & 7; c4.clk = (d === 0 ? 8 : d * 16) << (v >> 4); c4.width7 = (v & 8) !== 0; break; }
      case 0x23: c4.lenEn = (v & 0x40) !== 0; if (v & 0x80) { this.trig(c4); c4.lfsr = 0x7FFF; c4.acc = 0; } break;
      case 0x24: this.nr50 = v; break;
      case 0x25: this.nr51 = v; break;
    }
  }
  env(c, v) { c.initVol = v >> 4; c.envDir = (v >> 3) & 1; c.envPer = v & 7; c.dac = (v & 0xF8) !== 0; if (!c.dac) c.on = false; }
  trig(c) { if (c.len === 0) c.len = 64; c.on = c.dac; c.vol = c.initVol; c.envTimer = c.envPer || 8; c.phase = 0; c.step = 0; }
  trig1() {
    const c = this.c1; this.trig(c); c.shadow = c.freq; c.sweepTimer = c.sweepPer || 8; c.sweepOn = c.sweepPer > 0 || c.sweepShift > 0;
    if (c.sweepShift > 0 && this.sweepCalc(c) > 2047) c.on = false;
  }
  sweepCalc(c) { const d = c.shadow >> c.sweepShift; return c.sweepDir ? c.shadow - d : c.shadow + d; }
  seqStep() {
    const s = this.seq; this.seq = (s + 1) & 7;
    if ((s & 1) === 0) for (const c of [this.c1, this.c2, this.c3, this.c4]) if (c.lenEn && c.len > 0 && --c.len === 0) c.on = false;
    if (s === 2 || s === 6) { const c = this.c1; if (--c.sweepTimer <= 0) { c.sweepTimer = c.sweepPer || 8; if (c.sweepOn && c.sweepPer > 0) { const n = this.sweepCalc(c); if (n > 2047) c.on = false; else if (c.sweepShift > 0) { c.freq = c.shadow = n; if (this.sweepCalc(c) > 2047) c.on = false; } } } }
    if (s === 7) for (const c of [this.c1, this.c2, this.c4]) if (c.envPer && --c.envTimer <= 0) { c.envTimer = c.envPer; if (c.envDir) { if (c.vol < 15) c.vol++; } else if (c.vol > 0) c.vol--; }
  }
  static DUTY = [0x01, 0x81, 0x87, 0x7E];
  sample() {
    const sc = this.sampleCycles; this.seqCyc += sc; while (this.seqCyc >= 8192) { this.seqCyc -= 8192; this.seqStep(); }
    const o = [0, 0, 0, 0];
    for (let i = 0; i < 2; i++) { const c = i ? this.c2 : this.c1; if (!c.on) continue; const per = (2048 - c.freq) * 4; c.phase += sc; if (c.phase >= per) { c.step = (c.step + ((c.phase / per) | 0)) & 7; c.phase %= per; } o[i] = ((APU.DUTY[c.duty] >> (7 - c.step)) & 1) ? c.vol : 0; o[i] = o[i] / 7.5 - 1; }
    const c3 = this.c3; if (c3.on) { const per = (2048 - c3.freq) * 2; c3.phase += sc; if (c3.phase >= per) { c3.pos = (c3.pos + ((c3.phase / per) | 0)) & 31; c3.phase %= per; } const b = this.regs[0x20 + (c3.pos >> 1)], n = (c3.pos & 1) ? b & 15 : b >> 4; o[2] = (n >> c3.shift) / 7.5 - 1; if (c3.shift === 4) o[2] = 0; }
    const c4 = this.c4; if (c4.on) { c4.acc += sc; while (c4.acc >= c4.clk) { c4.acc -= c4.clk; const x = (c4.lfsr ^ (c4.lfsr >> 1)) & 1; c4.lfsr = (c4.lfsr >> 1) | (x << 14); if (c4.width7) c4.lfsr = (c4.lfsr & ~0x40) | (x << 6); } o[3] = ((~c4.lfsr & 1) ? c4.vol : 0) / 7.5 - 1; }
    let l = 0, r = 0;
    for (let i = 0; i < 4; i++) { if (this.nr51 & (1 << i)) r += o[i]; if (this.nr51 & (0x10 << i)) l += o[i]; }
    l *= ((this.nr50 >> 4) & 7) + 1; r *= (this.nr50 & 7) + 1;
    const B = this.buf, m = B.length - 1; B[this.w & m] = Math.max(-1, Math.min(1, l * 0.016)); B[(this.w + 1) & m] = Math.max(-1, Math.min(1, r * 0.016)); this.w += 2;
    if (this.w - this.r > 16384) this.r = this.w - 4096; // keep latency bounded
  }
  step(cy) { if (!this.on || !this.power) { if (this.on) { this.cyc += cy; while (this.cyc >= this.sampleCycles) { this.cyc -= this.sampleCycles; const B = this.buf, m = B.length - 1; B[this.w & m] = 0; B[(this.w + 1) & m] = 0; this.w += 2; } } return; }
    this.cyc += cy; while (this.cyc >= this.sampleCycles) { this.cyc -= this.sampleCycles; this.sample(); } }
  pull(L, R) { const n = L.length, B = this.buf, m = B.length - 1; for (let i = 0; i < n; i++) { if (this.r + 2 <= this.w) { L[i] = B[this.r & m]; R[i] = B[(this.r + 1) & m]; this.r += 2; } else { L[i] = 0; R[i] = 0; } } }
}

class GameBoy {
  constructor(rom) {
    this.rom = rom; this.romBanks = Math.max(2, rom.length >> 14);
    this.cart = rom[0x147];
    const t = this.cart; this.mbc = t === 0xFC ? 'cam' : (t >= 1 && t <= 3) ? 'mbc1' : (t >= 0x0F && t <= 0x13) ? 'mbc3' : (t >= 0x19 && t <= 0x1E) ? 'mbc5' : 'none';
    this.ramBytes = [0, 0x800, 0x2000, 0x8000, 0x20000, 0x10000][rom[0x149]] || 0; if (this.mbc === 'cam') this.ramBytes = 0x20000; this.ramMask = this.ramBytes ? this.ramBytes - 1 : 0;
    this.apu = new APU();
    this.vram = new Uint8Array(0x2000); this.wram = new Uint8Array(0x2000); this.oam = new Uint8Array(0xA0);
    this.hram = new Uint8Array(0x80); this.io = new Uint8Array(0x80);
    this.sram = new Uint8Array(0x20000); this.cam = new Uint8Array(0x80);
    this.fb = new Uint8Array(160 * 144); this.bgLine = new Uint8Array(160);
    this.printer = new GBPrinter(); this.cameraSource = null; this.sramDirty = false;
    this.keys = { dir: 0, btn: 0 }; this.reset();
  }
  reset() {
    this.a = 0x01; this.zf = 1; this.nf = 0; this.hf = 1; this.cf = 1; this.b = 0; this.c = 0x13; this.d = 0; this.e = 0xD8; this.h = 1; this.l = 0x4D;
    this.sp = 0xFFFE; this.pc = 0x100; this.ime = false; this.eiPending = false; this.halted = false;
    this.romBank = 1; this.ramBank = 0; this.ramEnable = false; this.rom0 = 0; this.m1lo = 1; this.m1hi = 0; this.m1mode = 0; this.setBanks(); if (this.apu) this.apu.reset();
    this.IF = 0xE1; this.IE = 0; this.divT = 0; this.tima = 0; this.tma = 0; this.tac = 0; this.sb = 0; this.sc = 0; this.serialCnt = 0;
    this.io.fill(0); this.io[0x40] = 0x91; this.io[0x47] = 0xFC; this.io[0x48] = 0xFF; this.io[0x49] = 0xFF; this.io[0x41] = 0;
    this.ly = 0; this.lineCyc = 0; this.mode = 2; this.winLine = 0; this.statSig = false; this.frameReady = false; this.frames = 0; this.total = 0;
    this.camBusy = false; this.camCnt = 0; this.cam.fill(0); this.captures = 0;
  }
  // ---------- memory ----------
  rd(a) {
    switch (a >> 12) {
      case 0: case 1: case 2: case 3: return this.rom[this.rom0Base + a];
      case 4: case 5: case 6: case 7: return this.rom[this.romBase + (a & 0x3FFF)];
      case 8: case 9: return this.vram[a & 0x1FFF];
      case 0xA: case 0xB:
        if (this.mbc === 'cam' && (this.ramBank & 0x10)) { const r = a & 0x7F; return r === 0 ? (this.cam[0] & 6) | (this.camBusy ? 1 : 0) : 0; }
        if (this.mbc === 'cam') return this.sram[((this.ramBank & 0xF) << 13) | (a & 0x1FFF)]; // Pocket Camera: RAM reads work regardless of the enable latch
        if (!this.ramEnable || !this.ramBytes || (this.mbc === 'mbc3' && this.ramBank > 3)) return 0xFF;
        return this.sram[(((this.ramBank & 0xF) << 13) | (a & 0x1FFF)) & this.ramMask];
      case 0xC: case 0xD: return this.wram[a & 0x1FFF];
      case 0xE: return this.wram[a & 0x1FFF];
      default:
        if (a < 0xFE00) return this.wram[a & 0x1FFF];
        if (a < 0xFEA0) return this.oam[a - 0xFE00];
        if (a < 0xFF00) return 0xFF;
        if (a < 0xFF80) return this.ior(a & 0x7F);
        if (a === 0xFFFF) return this.IE;
        return this.hram[a & 0x7F];
    }
  }
  ior(r) {
    if (r >= 0x10 && r <= 0x3F) return this.apu.read(r);
    switch (r) {
      case 0x00: { this.joyReads = (this.joyReads | 0) + 1; const s = this.io[0]; let v = 0xCF | (s & 0x30); if (!(s & 0x10)) v &= ~this.keys.dir; if (!(s & 0x20)) v &= ~this.keys.btn; return v & 0xFF; }
      case 0x01: return this.sb; case 0x02: return this.sc | 0x7E;
      case 0x04: return (this.divT >> 8) & 255; case 0x05: return this.tima; case 0x06: return this.tma; case 0x07: return this.tac | 0xF8;
      case 0x0F: return this.IF | 0xE0;
      case 0x41: return (this.io[0x41] & 0x78) | 0x80 | (this.lcdOn() ? ((this.ly === this.io[0x45] ? 4 : 0) | this.mode) : 0);
      case 0x44: return this.ly;
      default: return this.io[r];
    }
  }
  lcdOn() { return (this.io[0x40] & 0x80) !== 0; }
  wr(a, v) {
    switch (a >> 12) {
      case 0: case 1: this.ramEnable = (v & 0x0F) === 0x0A; return;
      case 2: case 3: this.mbcRom(a, v); return;
      case 4: case 5: this.mbcBank(v); return;
      case 6: case 7: if (this.mbc === 'mbc1') { this.m1mode = v & 1; this.setBanks(); } return;
      case 8: case 9: this.vram[a & 0x1FFF] = v; return;
      case 0xA: case 0xB:
        if (this.mbc === 'cam' && (this.ramBank & 0x10)) { const r = a & 0x7F; if (r < 0x36) { if (r === 0) { this.cam[0] = v & 7; if ((v & 1) && !this.camBusy) this.camStart(); } else this.cam[r] = v; } return; }
        if (this.ramEnable && (this.ramBytes && !(this.mbc === 'mbc3' && this.ramBank > 3))) { this.sram[(((this.ramBank & 0xF) << 13) | (a & 0x1FFF)) & (this.mbc === 'cam' ? 0x1FFFF : this.ramMask)] = v; this.sramDirty = true; } return;
      case 0xC: case 0xD: case 0xE: this.wram[a & 0x1FFF] = v; return;
      default:
        if (a < 0xFE00) { this.wram[a & 0x1FFF] = v; return; }
        if (a < 0xFEA0) { this.oam[a - 0xFE00] = v; return; }
        if (a < 0xFF00) return;
        if (a < 0xFF80) { this.iow(a & 0x7F, v); return; }
        if (a === 0xFFFF) { this.IE = v; return; }
        this.hram[a & 0x7F] = v;
    }
  }
  setBanks() {
    if (this.mbc === 'mbc1') { this.romBank = (this.m1hi << 5) | this.m1lo; this.rom0 = this.m1mode ? (this.m1hi << 5) : 0; this.ramBank = this.m1mode ? this.m1hi : 0; }
    this.romBase = (this.romBank % this.romBanks) << 14; this.rom0Base = (this.rom0 % this.romBanks) << 14;
  }
  mbcRom(a, v) {
    switch (this.mbc) {
      case 'mbc1': this.m1lo = (v & 0x1F) || 1; break;
      case 'mbc3': this.romBank = (v & 0x7F) || 1; break;
      case 'mbc5': this.romBank = a < 0x3000 ? (this.romBank & 0x100) | v : (this.romBank & 0xFF) | ((v & 1) << 8); break;
      case 'cam': this.romBank = v & 0x3F; break;
      default: return;
    }
    this.setBanks();
  }
  mbcBank(v) {
    switch (this.mbc) {
      case 'mbc1': this.m1hi = v & 3; this.setBanks(); break;
      case 'mbc5': this.ramBank = v & 0xF; break;
      case 'mbc3': case 'cam': this.ramBank = v; break;
    }
  }
  iow(r, v) {
    if (r >= 0x10 && r <= 0x3F) { this.apu.write(r, v); return; }
    switch (r) {
      case 0x00: this.io[0] = v & 0x30; return;
      case 0x01: this.sb = v; return;
      case 0x02: this.sc = v; if ((v & 0x81) === 0x81) this.serialCnt = 4096; return;
      case 0x04: this.divT = 0; return; case 0x05: this.tima = v; return; case 0x06: this.tma = v; return; case 0x07: this.tac = v & 7; return;
      case 0x0F: this.IF = v & 0x1F; return;
      case 0x40: { const was = this.lcdOn(); this.io[0x40] = v; if (was && !(v & 0x80)) { this.ly = 0; this.lineCyc = 0; this.mode = 0; this.winLine = 0; this.statSig = false; } else if (!was && (v & 0x80)) { this.ly = 0; this.lineCyc = 0; this.mode = 2; this.winLine = 0; this.statUpdate(); } return; }
      case 0x41: this.io[0x41] = v & 0x78; this.statUpdate(); return;
      case 0x44: return;
      case 0x45: this.io[0x45] = v; this.statUpdate(); return;
      case 0x46: { const s = v << 8; for (let i = 0; i < 0xA0; i++) this.oam[i] = this.rd(s + i); this.io[0x46] = v; return; }
      default: this.io[r] = v;
    }
  }
  // ---------- joypad ----------
  setKey(name, down) {
    const m = { right: ['dir', 1], left: ['dir', 2], up: ['dir', 4], down: ['dir', 8], a: ['btn', 1], b: ['btn', 2], select: ['btn', 4], start: ['btn', 8] }[name];
    if (!m) return; const [g, bit] = m; const was = this.keys[g];
    if (down) { this.keys[g] |= bit; const sel = this.io[0]; if (!(was & bit) && ((g === 'dir' && !(sel & 0x10)) || (g === 'btn' && !(sel & 0x20)))) this.IF |= 0x10; } else this.keys[g] &= ~bit;
  }
  // ---------- camera sensor ----------
  camStart() {
    this.camBusy = true; const exp = (this.cam[2] << 8) | this.cam[3];
    this.camCnt = 4 * (32446 + ((this.cam[1] & 0x80) ? 0 : 512) + 16 * exp);
  }
  camCapture() {
    const W = 128, H = 112, src = this.cameraSource ? this.cameraSource() : null;
    const exp = (this.cam[2] << 8) | this.cam[3];
    const scale = exp / (this.expRef || 0x0800), gain = this.sensorGain || 1;
    let v = new Float32Array(W * H);
    for (let i = 0; i < v.length; i++) v[i] = (src ? src[i] : ((i % W) * 2)) * scale * gain;
    // edge enhancement
    const E = [0.5, 0.75, 1, 1.25, 2, 3, 4, 5][(this.cam[4] >> 4) & 7];
    if (!(this.cam[1] & 0x80) || (this.cam[4] & 0x80)) {
      const o = new Float32Array(v.length);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = v[y * W + x], l = v[y * W + (x > 0 ? x - 1 : x)], r = v[y * W + (x < W - 1 ? x + 1 : x)], u = v[(y > 0 ? y - 1 : y) * W + x], d = v[(y < H - 1 ? y + 1 : y) * W + x];
        o[y * W + x] = c + (E * 0.35) * (4 * c - l - r - u - d) * 0.5;
      }
      v = o;
    }
    const inv = (this.cam[4] & 8) !== 0, m = this.cam;
    const ram = this.sram;
    if (this.cameraColour) { const c = this.cameraColour(); if (c) { if (!this.camRGB) this.camRGB = new Uint8ClampedArray(W * H * 4); this.camRGB.set(c); } }
    if (!this.camIds) this.camIds = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let p = v[y * W + x]; p = p < 0 ? 0 : p > 255 ? 255 : p; if (inv) p = 255 - p;
      const t = 6 + ((y & 3) * 4 + (x & 3)) * 3;
      let col = p < m[t] ? 3 : p < m[t + 1] ? 2 : p < m[t + 2] ? 1 : 0; if (this.camFlip) col = 3 - col;
      this.camIds[y * W + x] = col;
      const a = 0x100 + ((y >> 3) * 16 + (x >> 3)) * 16 + (y & 7) * 2, bit = 7 - (x & 7);
      if (bit === 7) { ram[a] = 0; ram[a + 1] = 0; }
      ram[a] |= (col & 1) << bit; ram[a + 1] |= (col >> 1) << bit;
    }
    if(this.dbg&&this.captures%5===0){const h=[0,0,0,0];for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=0x100+((y>>3)*16+(x>>3))*16+(y&7)*2,b=7-(x&7);h[((ram[a]>>b)&1)|(((ram[a+1]>>b)&1)<<1)]++}console.log('T: cap hist',h.join(','),'exp',exp.toString(16),'regs',[...m.slice(0,6)].map(q=>q.toString(16)).join(' '))}
    this.sramDirty = true; this.captures++;
  }
  // ---------- PPU ----------
  statUpdate() {
    const s = this.io[0x41]; let sig = false;
    if (this.lcdOn()) { if ((s & 0x40) && this.ly === this.io[0x45]) sig = true; if ((s & 0x08) && this.mode === 0) sig = true; if ((s & 0x10) && this.mode === 1) sig = true; if ((s & 0x20) && this.mode === 2) sig = true; }
    if (sig && !this.statSig) this.IF |= 2; this.statSig = sig;
  }
  ppu(cy) {
    if (!this.lcdOn()) return;
    this.lineCyc += cy;
    for (;;) {
      if (this.ly < 144) {
        if (this.mode === 2 && this.lineCyc >= 80) { this.mode = 3; }
        if (this.mode === 3 && this.lineCyc >= 252) { this.mode = 0; this.renderLine(); this.statUpdate(); }
      }
      if (this.lineCyc >= 456) {
        this.lineCyc -= 456; this.ly++;
        if (this.ly === 144) { this.mode = 1; this.IF |= 1; this.frameReady = true; this.frames++; }
        else if (this.ly > 153) { this.ly = 0; this.mode = 2; this.winLine = 0; }
        else if (this.ly < 144) this.mode = 2;
        this.statUpdate(); continue;
      }
      break;
    }
  }
  renderLine() {
    const io = this.io, ly = this.ly, lcdc = io[0x40], fb = this.fb, o = ly * 160, vram = this.vram, line = this.bgLine;
    const bgp = io[0x47];
    if (lcdc & 1) {
      const scx = io[0x43], scy = io[0x42], mb = (lcdc & 8) ? 0x1C00 : 0x1800, uns = lcdc & 0x10;
      const y = (ly + scy) & 255, row = y >> 3, ty = y & 7;
      for (let x = 0; x < 160; x++) {
        const px = (x + scx) & 255, idx = vram[mb + row * 32 + (px >> 3)];
        const t = uns ? idx * 16 : 0x1000 + ((idx << 24 >> 24) * 16), bit = 7 - (px & 7);
        line[x] = ((vram[t + ty * 2] >> bit) & 1) | (((vram[t + ty * 2 + 1] >> bit) & 1) << 1);
      }
      const wy = io[0x4A], wx = io[0x4B] - 7;
      if ((lcdc & 0x20) && ly >= wy && io[0x4B] < 167) {
        const wb = (lcdc & 0x40) ? 0x1C00 : 0x1800, wrow = this.winLine >> 3, wty = this.winLine & 7;
        for (let x = Math.max(0, wx); x < 160; x++) {
          const px = x - wx, idx = vram[wb + wrow * 32 + (px >> 3)];
          const t = uns ? idx * 16 : 0x1000 + ((idx << 24 >> 24) * 16), bit = 7 - (px & 7);
          line[x] = ((vram[t + wty * 2] >> bit) & 1) | (((vram[t + wty * 2 + 1] >> bit) & 1) << 1);
        }
        this.winLine++;
      }
    } else line.fill(0);
    for (let x = 0; x < 160; x++) fb[o + x] = (bgp >> (line[x] * 2)) & 3;
    if (lcdc & 2) {
      const h = (lcdc & 4) ? 16 : 8, oam = this.oam, list = [];
      for (let i = 0; i < 40 && list.length < 10; i++) { const y = oam[i * 4] - 16; if (ly >= y && ly < y + h) list.push(i); }
      list.sort((a, b) => (oam[b * 4 + 1] - oam[a * 4 + 1]) || (b - a));
      for (const i of list) {
        const y = oam[i * 4] - 16, x = oam[i * 4 + 1] - 8, fl = oam[i * 4 + 3];
        let tile = oam[i * 4 + 2]; if (h === 16) tile &= 0xFE;
        let ty = ly - y; if (fl & 0x40) ty = h - 1 - ty;
        const a = tile * 16 + ty * 2, b1 = vram[a], b2 = vram[a + 1], pal = (fl & 0x10) ? io[0x49] : io[0x48];
        for (let px = 0; px < 8; px++) {
          const sx = x + px; if (sx < 0 || sx >= 160) continue;
          const bit = (fl & 0x20) ? px : 7 - px, col = ((b1 >> bit) & 1) | (((b2 >> bit) & 1) << 1);
          if (!col) continue; if ((fl & 0x80) && line[sx]) continue;
          fb[o + sx] = (pal >> (col * 2)) & 3;
        }
      }
    }
  }
  // ---------- CPU ----------
  fetch() { const v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  fetch16() { const l = this.fetch(); return l | (this.fetch() << 8); }
  push(v) { this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v >> 8); this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v & 255); }
  pop() { const l = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; const h = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; return l | (h << 8); }
  get bc() { return (this.b << 8) | this.c; } get de() { return (this.d << 8) | this.e; } get hl() { return (this.h << 8) | this.l; }
  get af() { return (this.a << 8) | (this.zf << 7) | (this.nf << 6) | (this.hf << 5) | (this.cf << 4); }
  gr(i) { switch (i) { case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e; case 4: return this.h; case 5: return this.l; case 6: return this.rd(this.hl); default: return this.a; } }
  sr(i, v) { switch (i) { case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break; case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.wr(this.hl, v); break; default: this.a = v; } }
  rr16(i) { switch (i) { case 0: return this.bc; case 1: return this.de; case 2: return this.hl; default: return this.sp; } }
  sr16(i, v) { v &= 0xFFFF; switch (i) { case 0: this.b = v >> 8; this.c = v & 255; break; case 1: this.d = v >> 8; this.e = v & 255; break; case 2: this.h = v >> 8; this.l = v & 255; break; default: this.sp = v; } }
  cond(i) { switch (i) { case 0: return !this.zf; case 1: return !!this.zf; case 2: return !this.cf; default: return !!this.cf; } }
  alu(op, v) {
    const a = this.a; let r;
    switch (op) {
      case 0: r = a + v; this.hf = ((a & 15) + (v & 15)) > 15 ? 1 : 0; this.cf = r > 255 ? 1 : 0; this.nf = 0; break;
      case 1: { const c = this.cf; r = a + v + c; this.hf = ((a & 15) + (v & 15) + c) > 15 ? 1 : 0; this.cf = r > 255 ? 1 : 0; this.nf = 0; break; }
      case 2: r = a - v; this.hf = ((a & 15) - (v & 15)) < 0 ? 1 : 0; this.cf = r < 0 ? 1 : 0; this.nf = 1; break;
      case 3: { const c = this.cf; r = a - v - c; this.hf = ((a & 15) - (v & 15) - c) < 0 ? 1 : 0; this.cf = r < 0 ? 1 : 0; this.nf = 1; break; }
      case 4: r = a & v; this.hf = 1; this.cf = 0; this.nf = 0; break;
      case 5: r = a ^ v; this.hf = 0; this.cf = 0; this.nf = 0; break;
      case 6: r = a | v; this.hf = 0; this.cf = 0; this.nf = 0; break;
      default: r = a - v; this.hf = ((a & 15) - (v & 15)) < 0 ? 1 : 0; this.cf = r < 0 ? 1 : 0; this.nf = 1; this.zf = (r & 255) === 0 ? 1 : 0; return;
    }
    r &= 255; this.zf = r === 0 ? 1 : 0; this.a = r;
  }
  cb() {
    const op = this.fetch(), r = op & 7, g = op >> 3; let v = this.gr(r);
    if (op < 0x40) {
      let c;
      switch (g) {
        case 0: c = v >> 7; v = ((v << 1) | c) & 255; break; case 1: c = v & 1; v = (v >> 1) | (c << 7); break;
        case 2: c = v >> 7; v = ((v << 1) | this.cf) & 255; break; case 3: c = v & 1; v = (v >> 1) | (this.cf << 7); break;
        case 4: c = v >> 7; v = (v << 1) & 255; break; case 5: c = v & 1; v = (v >> 1) | (v & 0x80); break;
        case 6: c = 0; v = ((v << 4) | (v >> 4)) & 255; break; default: c = v & 1; v = v >> 1;
      }
      this.cf = c; this.zf = v === 0 ? 1 : 0; this.nf = 0; this.hf = 0; this.sr(r, v); return r === 6 ? 16 : 8;
    }
    const n = g & 7;
    if (op < 0x80) { this.zf = ((v >> n) & 1) ? 0 : 1; this.nf = 0; this.hf = 1; return r === 6 ? 12 : 8; }
    if (op < 0xC0) v &= ~(1 << n); else v |= 1 << n;
    this.sr(r, v & 255); return r === 6 ? 16 : 8;
  }
  exec() {
    const op = this.fetch();
    if (op >= 0x40 && op < 0x80) {
      if (op === 0x76) { this.halted = true; return 4; }
      this.sr((op >> 3) & 7, this.gr(op & 7)); return ((op & 7) === 6 || ((op >> 3) & 7) === 6) ? 8 : 4;
    }
    if (op >= 0x80 && op < 0xC0) { this.alu((op >> 3) & 7, this.gr(op & 7)); return (op & 7) === 6 ? 8 : 4; }
    if (op < 0x40) {
      const lo = op & 7, r = (op >> 3) & 7;
      if (lo === 4) { const v = this.gr(r), n = (v + 1) & 255; this.zf = n === 0 ? 1 : 0; this.nf = 0; this.hf = (v & 15) === 15 ? 1 : 0; this.sr(r, n); return r === 6 ? 12 : 4; }
      if (lo === 5) { const v = this.gr(r), n = (v - 1) & 255; this.zf = n === 0 ? 1 : 0; this.nf = 1; this.hf = (v & 15) === 0 ? 1 : 0; this.sr(r, n); return r === 6 ? 12 : 4; }
      if (lo === 6) { this.sr(r, this.fetch()); return r === 6 ? 12 : 8; }
      if (lo === 1) { const i = op >> 4; if (op & 8) { const hl = this.hl, v = this.rr16(i), s = hl + v; this.nf = 0; this.hf = ((hl & 0xFFF) + (v & 0xFFF)) > 0xFFF ? 1 : 0; this.cf = s > 0xFFFF ? 1 : 0; this.sr16(2, s); return 8; } this.sr16(i, this.fetch16()); return 12; }
      if (lo === 3) { const i = op >> 4; this.sr16(i, this.rr16(i) + ((op & 8) ? -1 : 1)); return 8; }
      if (lo === 2) {
        const i = op >> 4;
        if (!(op & 8)) { if (i === 0) this.wr(this.bc, this.a); else if (i === 1) this.wr(this.de, this.a); else { const hl = this.hl; this.wr(hl, this.a); this.sr16(2, hl + (i === 2 ? 1 : -1)); } }
        else { if (i === 0) this.a = this.rd(this.bc); else if (i === 1) this.a = this.rd(this.de); else { const hl = this.hl; this.a = this.rd(hl); this.sr16(2, hl + (i === 2 ? 1 : -1)); } }
        return 8;
      }
      if (lo === 0) {
        if (op === 0x00) return 4;
        if (op === 0x08) { const a = this.fetch16(); this.wr(a, this.sp & 255); this.wr((a + 1) & 0xFFFF, this.sp >> 8); return 20; }
        if (op === 0x10) { this.fetch(); return 4; }
        if (op === 0x18) { const e = this.fetch() << 24 >> 24; this.pc = (this.pc + e) & 0xFFFF; return 12; }
        const e = this.fetch() << 24 >> 24; if (this.cond((op >> 3) & 3)) { this.pc = (this.pc + e) & 0xFFFF; return 12; } return 8;
      }
      // lo === 7
      switch (op) {
        case 0x07: { const c = this.a >> 7; this.a = ((this.a << 1) | c) & 255; this.cf = c; break; }
        case 0x0F: { const c = this.a & 1; this.a = (this.a >> 1) | (c << 7); this.cf = c; break; }
        case 0x17: { const c = this.a >> 7; this.a = ((this.a << 1) | this.cf) & 255; this.cf = c; break; }
        case 0x1F: { const c = this.a & 1; this.a = (this.a >> 1) | (this.cf << 7); this.cf = c; break; }
        case 0x27: { let a = this.a, adj = 0; if (this.hf || (!this.nf && (a & 15) > 9)) adj |= 6; if (this.cf || (!this.nf && a > 0x99)) { adj |= 0x60; this.cf = 1; } a = this.nf ? a - adj : a + adj; a &= 255; this.zf = a === 0 ? 1 : 0; this.hf = 0; this.a = a; return 4; }
        case 0x2F: this.a ^= 255; this.nf = 1; this.hf = 1; return 4;
        case 0x37: this.cf = 1; this.nf = 0; this.hf = 0; return 4;
        default: this.cf ^= 1; this.nf = 0; this.hf = 0; return 4;
      }
      this.zf = 0; this.nf = 0; this.hf = 0; return 4;
    }
    switch (op) {
      case 0xC0: case 0xC8: case 0xD0: case 0xD8: if (this.cond((op >> 3) & 3)) { this.pc = this.pop(); return 20; } return 8;
      case 0xC9: this.pc = this.pop(); return 16;
      case 0xD9: this.pc = this.pop(); this.ime = true; return 16;
      case 0xC1: case 0xD1: case 0xE1: { const v = this.pop(); const i = (op >> 4) & 3; if (i === 0) { this.b = v >> 8; this.c = v & 255; } else if (i === 1) { this.d = v >> 8; this.e = v & 255; } else this.sr16(2, v); return 12; }
      case 0xF1: { const v = this.pop(); this.a = v >> 8; this.zf = (v >> 7) & 1; this.nf = (v >> 6) & 1; this.hf = (v >> 5) & 1; this.cf = (v >> 4) & 1; return 12; }
      case 0xC5: this.push(this.bc); return 16; case 0xD5: this.push(this.de); return 16; case 0xE5: this.push(this.hl); return 16; case 0xF5: this.push(this.af); return 16;
      case 0xC2: case 0xCA: case 0xD2: case 0xDA: { const a = this.fetch16(); if (this.cond((op >> 3) & 3)) { this.pc = a; return 16; } return 12; }
      case 0xC3: this.pc = this.fetch16(); return 16;
      case 0xE9: this.pc = this.hl; return 4;
      case 0xC4: case 0xCC: case 0xD4: case 0xDC: { const a = this.fetch16(); if (this.cond((op >> 3) & 3)) { this.push(this.pc); this.pc = a; return 24; } return 12; }
      case 0xCD: { const a = this.fetch16(); this.push(this.pc); this.pc = a; return 24; }
      case 0xC6: case 0xCE: case 0xD6: case 0xDE: case 0xE6: case 0xEE: case 0xF6: case 0xFE: this.alu((op >> 3) & 7, this.fetch()); return 8;
      case 0xC7: case 0xCF: case 0xD7: case 0xDF: case 0xE7: case 0xEF: case 0xF7: case 0xFF: this.push(this.pc); this.pc = op & 0x38; return 16;
      case 0xCB: return this.cb();
      case 0xE0: this.wr(0xFF00 | this.fetch(), this.a); return 12;
      case 0xF0: this.a = this.rd(0xFF00 | this.fetch()); return 12;
      case 0xE2: this.wr(0xFF00 | this.c, this.a); return 8;
      case 0xF2: this.a = this.rd(0xFF00 | this.c); return 8;
      case 0xEA: this.wr(this.fetch16(), this.a); return 16;
      case 0xFA: this.a = this.rd(this.fetch16()); return 16;
      case 0xE8: { const e = this.fetch() << 24 >> 24, sp = this.sp; this.zf = 0; this.nf = 0; this.hf = ((sp & 15) + (e & 15)) > 15 ? 1 : 0; this.cf = ((sp & 255) + (e & 255)) > 255 ? 1 : 0; this.sp = (sp + e) & 0xFFFF; return 16; }
      case 0xF8: { const e = this.fetch() << 24 >> 24, sp = this.sp; this.zf = 0; this.nf = 0; this.hf = ((sp & 15) + (e & 15)) > 15 ? 1 : 0; this.cf = ((sp & 255) + (e & 255)) > 255 ? 1 : 0; this.sr16(2, sp + e); return 12; }
      case 0xF9: this.sp = this.hl; return 8;
      case 0xF3: this.ime = false; this.eiPending = false; return 4;
      case 0xFB: this.eiPending = true; return 4;
      default: return 4; // illegal opcodes
    }
  }
  step() {
    const wasEi = this.eiPending; this.eiPending = false;
    let cy;
    const pend = this.IE & this.IF & 0x1F;
    if (this.halted) { if (pend) this.halted = false; }
    if (this.ime && pend) {
      this.halted = false; this.ime = false;
      const bit = pend & -pend, n = 31 - Math.clz32(bit); this.IF &= ~bit;
      this.push(this.pc); this.pc = 0x40 + n * 8; cy = 20;
    } else if (this.halted) cy = 4;
    else { cy = this.exec(); if (wasEi) this.ime = true; }
    // timer
    const old = this.divT; this.divT += cy;
    if (this.tac & 4) {
      const k = [9, 3, 5, 7][this.tac & 3] + 1, ticks = (this.divT >> k) - (old >> k);
      if (ticks > 0) { let t = this.tima + ticks; if (t > 255) { t = this.tma + ((t - 256) % (256 - this.tma || 256)); this.IF |= 4; } this.tima = t & 255; }
    }
    this.total += cy; this.ppu(cy); this.apu.step(cy);
    if (this.serialCnt > 0 && (this.serialCnt -= cy) <= 0) {
      this.serialCnt = 0; this.xfers = (this.xfers | 0) + 1; this.sb = this.printer.transfer(this.sb, this.total); this.sc &= 0x7F; this.IF |= 8;
    }
    if (this.camBusy && (this.camCnt -= cy) <= 0) { this.camBusy = false; this.camCapture(); }
    return cy;
  }
  runFrame() {
    this.frameReady = false; let c = 0;
    while (!this.frameReady && c < 140000) c += this.step();
  }
}
if (typeof window !== 'undefined') window.GameBoy = GameBoy;
