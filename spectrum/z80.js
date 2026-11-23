'use strict';
// Zilog Z80 CPU core (documented + the common undocumented behaviour: IXH/IXL, X/Y flags, DDCB register copies).
// bus: { rd(a), wr(a,v), in(port), out(port,v) }. step() runs one instruction and returns T-states used.
class Z80 {
  constructor(bus) {
    this.bus = bus; this.R = new Uint8Array(8); // B C D E H L (unused) A
    this.f = 0; this.sp = 0xFFFF; this.pc = 0; this.ix = 0; this.iy = 0; this.i = 0; this.r = 0;
    this.sh = new Uint8Array(8); this.fs = 0; // shadow set
    this.iff1 = false; this.iff2 = false; this.im = 0; this.halted = false; this.eiDelay = false; this.t = 0; this.wz = 0;
    this.idx = 0; this.dd = 0; // current prefix: 0 none, 1 IX, 2 IY; dd = fetched displacement
    // parity table
    this.par = new Uint8Array(256); for (let i = 0; i < 256; i++) { let p = 1, v = i; while (v) { p ^= v & 1; v >>= 1; } this.par[i] = p ? 4 : 0; }
  }
  // ---- register helpers ----
  get a() { return this.R[7]; } set a(v) { this.R[7] = v; }
  get bc() { return (this.R[0] << 8) | this.R[1]; } set bc(v) { this.R[0] = v >> 8; this.R[1] = v; }
  get de() { return (this.R[2] << 8) | this.R[3]; } set de(v) { this.R[2] = v >> 8; this.R[3] = v; }
  get hl() { return (this.R[4] << 8) | this.R[5]; } set hl(v) { this.R[4] = v >> 8; this.R[5] = v; }
  get af() { return (this.R[7] << 8) | this.f; } set af(v) { this.R[7] = v >> 8; this.f = v & 255; }
  // HL, IX or IY depending on prefix
  get hx() { return this.idx === 0 ? this.hl : this.idx === 1 ? this.ix : this.iy; }
  set hx(v) { v &= 0xFFFF; if (this.idx === 0) this.hl = v; else if (this.idx === 1) this.ix = v; else this.iy = v; }
  rd(a) { return this.bus.rd(a & 0xFFFF); } wr(a, v) { this.bus.wr(a & 0xFFFF, v & 255); }
  rd16(a) { return this.rd(a) | (this.rd(a + 1) << 8); } wr16(a, v) { this.wr(a, v & 255); this.wr(a + 1, v >> 8); }
  fetch() { const v = this.bus.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  fetch16() { const l = this.fetch(); return l | (this.fetch() << 8); }
  push(v) { this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v >> 8); this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v & 255); }
  pop() { const l = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; const h = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; return l | (h << 8); }
  // 8-bit register by index with prefix handling: 0 B,1 C,2 D,3 E,4 H,5 L,6 (HL)/(IX+d),7 A
  gr(i) {
    if (i === 6) return this.rd(this.idx ? this.hx + this.dd : this.hl);
    if (this.idx && (i === 4 || i === 5)) { const v = this.idx === 1 ? this.ix : this.iy; return i === 4 ? v >> 8 : v & 255; }
    return this.R[i];
  }
  sr(i, v) {
    v &= 255;
    if (i === 6) { this.wr(this.idx ? this.hx + this.dd : this.hl, v); return; }
    if (this.idx && (i === 4 || i === 5)) { const o = this.idx === 1 ? this.ix : this.iy, n = i === 4 ? (v << 8) | (o & 255) : (o & 0xFF00) | v; if (this.idx === 1) this.ix = n; else this.iy = n; return; }
    this.R[i] = v;
  }
  // grp without prefix substitution (used by DDCB register copies and some ED ops)
  rp(p) { return p === 0 ? this.bc : p === 1 ? this.de : p === 2 ? this.hx : this.sp; }
  setRp(p, v) { v &= 0xFFFF; if (p === 0) this.bc = v; else if (p === 1) this.de = v; else if (p === 2) this.hx = v; else this.sp = v; }
  rp2(p) { return p === 0 ? this.bc : p === 1 ? this.de : p === 2 ? this.hx : this.af; }
  setRp2(p, v) { v &= 0xFFFF; if (p === 0) this.bc = v; else if (p === 1) this.de = v; else if (p === 2) this.hx = v; else this.af = v; }
  cc(n) { const f = this.f; switch (n) { case 0: return !(f & 0x40); case 1: return !!(f & 0x40); case 2: return !(f & 1); case 3: return !!(f & 1); case 4: return !(f & 4); case 5: return !!(f & 4); case 6: return !(f & 0x80); default: return !!(f & 0x80); } }

  // ---- ALU ----
  alu(op, v) {
    const a = this.R[7]; let r, f;
    switch (op) {
      case 0: r = a + v; f = ((r ^ a ^ v) & 0x10) | (((a ^ r) & (v ^ r) & 0x80) ? 4 : 0) | (r > 255 ? 1 : 0); break;
      case 1: { const c = this.f & 1; r = a + v + c; f = ((r ^ a ^ v) & 0x10) | (((a ^ r) & (v ^ r) & 0x80) ? 4 : 0) | (r > 255 ? 1 : 0); break; }
      case 2: case 7: r = a - v; f = 2 | ((r ^ a ^ v) & 0x10) | (((a ^ v) & (a ^ r) & 0x80) ? 4 : 0) | (r < 0 ? 1 : 0); break;
      case 3: { const c = this.f & 1; r = a - v - c; f = 2 | ((r ^ a ^ v) & 0x10) | (((a ^ v) & (a ^ r) & 0x80) ? 4 : 0) | (r < 0 ? 1 : 0); break; }
      case 4: r = a & v; f = 0x10 | this.par[r & 255]; break;
      case 5: r = a ^ v; f = this.par[r & 255]; break;
      default: r = a | v; f = this.par[r & 255]; break;
    }
    r &= 255; f |= (r & 0x80) | (r ? 0 : 0x40);
    if (op === 7) { f = (f & ~0x28) | (v & 0x28); this.f = f; return; } // CP: X/Y from the operand
    f |= r & 0x28; this.f = f; this.R[7] = r;
  }
  inc8(v) { const r = (v + 1) & 255; this.f = (this.f & 1) | (r & 0xA8) | (r ? 0 : 0x40) | ((v & 15) === 15 ? 0x10 : 0) | (v === 0x7F ? 4 : 0); return r; }
  dec8(v) { const r = (v - 1) & 255; this.f = (this.f & 1) | 2 | (r & 0xA8) | (r ? 0 : 0x40) | ((v & 15) === 0 ? 0x10 : 0) | (v === 0x80 ? 4 : 0); return r; }
  add16(a, b) { const r = a + b; this.f = (this.f & 0xC4) | (((a ^ b ^ r) >> 8) & 0x10) | ((r >> 16) & 1) | ((r >> 8) & 0x28); return r & 0xFFFF; }
  adc16(b) { const a = this.hl, c = this.f & 1, r = a + b + c; this.f = (((a ^ b ^ r) >> 8) & 0x10) | (((a ^ r) & (b ^ r) & 0x8000) ? 4 : 0) | ((r >> 16) & 1) | ((r >> 8) & 0xA8) | ((r & 0xFFFF) ? 0 : 0x40); this.hl = r; }
  sbc16(b) { const a = this.hl, c = this.f & 1, r = a - b - c; this.f = 2 | (((a ^ b ^ r) >> 8) & 0x10) | (((a ^ b) & (a ^ r) & 0x8000) ? 4 : 0) | ((r >> 16) & 1) | ((r >> 8) & 0xA8) | ((r & 0xFFFF) ? 0 : 0x40); this.hl = r; }
  // rotates/shifts: kind 0 RLC,1 RRC,2 RL,3 RR,4 SLA,5 SRA,6 SLL,7 SRL
  rot(k, v) {
    let c, r;
    switch (k) {
      case 0: c = v >> 7; r = ((v << 1) | c) & 255; break; case 1: c = v & 1; r = (v >> 1) | (c << 7); break;
      case 2: c = v >> 7; r = ((v << 1) | (this.f & 1)) & 255; break; case 3: c = v & 1; r = (v >> 1) | ((this.f & 1) << 7); break;
      case 4: c = v >> 7; r = (v << 1) & 255; break; case 5: c = v & 1; r = (v >> 1) | (v & 0x80); break;
      case 6: c = v >> 7; r = ((v << 1) | 1) & 255; break; default: c = v & 1; r = v >> 1; break;
    }
    this.f = c | (r & 0xA8) | (r ? 0 : 0x40) | this.par[r]; return r;
  }
  daa() {
    const a = this.R[7], f = this.f; let adj = 0, c = f & 1;
    if ((f & 0x10) || (a & 15) > 9) adj |= 6; if (c || a > 0x99) { adj |= 0x60; c = 1; }
    const r = (f & 2) ? (a - adj) & 255 : (a + adj) & 255;
    this.f = c | (f & 2) | (r & 0xA8) | (r ? 0 : 0x40) | this.par[r] | ((a ^ r) & 0x10); this.R[7] = r;
  }

  // ---- interrupts ----
  interrupt() { // maskable, called by the machine when INT is active
    if (!this.iff1 || this.eiDelay) return 0;
    this.halted = false; this.iff1 = this.iff2 = false; this.r = (this.r + 1) & 0x7F; this.push(this.pc);
    if (this.im === 2) { this.pc = this.rd16((this.i << 8) | 0xFF); return 19; }
    this.pc = 0x38; return 13;
  }

  step() {
    if (this.halted) { this.r = (this.r + 1) & 0x7F; return 4; }
    this.eiDelay = false; this.idx = 0;
    let t = this.exec();
    this.t += t; return t;
  }
  nextOp() { this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F); return this.fetch(); }
  exec() {
    let op = this.nextOp(), T = 0;
    // prefixes DD / FD (may repeat)
    while (op === 0xDD || op === 0xFD) { this.idx = op === 0xDD ? 1 : 2; T += 4; op = this.nextOp(); if (op === 0xED) break; }
    if (op === 0xED) { this.idx = 0; return T + 4 + this.execED(); }
    if (op === 0xCB) {
      if (this.idx) { this.dd = (this.fetch() << 24) >> 24; const o2 = this.fetch(); return T + this.execDDCB(o2); }
      return T + 4 + this.execCB();
    }
    if (this.idx && this.opUsesHLmem(op)) this.dd = (this.fetch() << 24) >> 24; // displacement for (IX+d) forms
    return T + this.execMain(op);
  }
  opUsesHLmem(op) { // does this opcode reference (HL) as an operand (so IX/IY form takes d)?
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    if (x === 1) return (y === 6) !== (z === 6); // LD r,(HL) / LD (HL),r (not HALT)
    if (x === 2) return z === 6;
    if (x === 0 && (z === 4 || z === 5 || z === 6)) return y === 6;
    return false;
  }
  execMain(op) {
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1, ix = this.idx;
    let n, v, T;
    switch (x) {
      case 0:
        switch (z) {
          case 0:
            switch (y) {
              case 0: return 4;
              case 1: { const a = this.af, b = (this.sh[7] << 8) | this.fs; this.R[7] = this.sh[7]; this.f = this.fs; this.sh[7] = a >> 8; this.fs = a & 255; void b; return 4; }
              case 2: { const d = (this.fetch() << 24) >> 24; this.R[0] = (this.R[0] - 1) & 255; if (this.R[0]) { this.pc = (this.pc + d) & 0xFFFF; return 13; } return 8; }
              case 3: { const d = (this.fetch() << 24) >> 24; this.pc = (this.pc + d) & 0xFFFF; return 12; }
              default: { const d = (this.fetch() << 24) >> 24; if (this.cc(y - 4)) { this.pc = (this.pc + d) & 0xFFFF; return 12; } return 7; }
            }
          case 1:
            if (!q) { this.setRp(p, this.fetch16()); return 10; }
            this.hx = this.add16(this.hx, this.rp(p)); return 11;
          case 2:
            switch (p) {
              case 0: if (!q) this.wr(this.bc, this.R[7]); else this.R[7] = this.rd(this.bc); return 7;
              case 1: if (!q) this.wr(this.de, this.R[7]); else this.R[7] = this.rd(this.de); return 7;
              case 2: n = this.fetch16(); if (!q) this.wr16(n, this.hx); else this.hx = this.rd16(n); return 16;
              default: n = this.fetch16(); if (!q) this.wr(n, this.R[7]); else this.R[7] = this.rd(n); return 13;
            }
          case 3: if (!q) this.setRp(p, this.rp(p) + 1); else this.setRp(p, this.rp(p) - 1); return 6;
          case 4: v = this.inc8(this.gr(y)); this.sr(y, v); return y === 6 ? (ix ? 19 - 4 + 4 : 11) : 4;
          case 5: v = this.dec8(this.gr(y)); this.sr(y, v); return y === 6 ? (ix ? 19 - 4 + 4 : 11) : 4;
          case 6: if (y === 6) { v = this.fetch(); this.sr(6, v); return ix ? 15 : 10; } this.sr(y, this.fetch()); return 7;
          default:
            switch (y) {
              case 0: { const a = this.R[7], c = a >> 7; this.R[7] = ((a << 1) | c) & 255; this.f = (this.f & 0xC4) | c | (this.R[7] & 0x28); return 4; }
              case 1: { const a = this.R[7], c = a & 1; this.R[7] = (a >> 1) | (c << 7); this.f = (this.f & 0xC4) | c | (this.R[7] & 0x28); return 4; }
              case 2: { const a = this.R[7], c = a >> 7; this.R[7] = ((a << 1) | (this.f & 1)) & 255; this.f = (this.f & 0xC4) | c | (this.R[7] & 0x28); return 4; }
              case 3: { const a = this.R[7], c = a & 1; this.R[7] = (a >> 1) | ((this.f & 1) << 7); this.f = (this.f & 0xC4) | c | (this.R[7] & 0x28); return 4; }
              case 4: this.daa(); return 4;
              case 5: this.R[7] ^= 0xFF; this.f = (this.f & 0xC5) | 0x12 | (this.R[7] & 0x28); return 4;
              case 6: this.f = (this.f & 0xC4) | 1 | (this.R[7] & 0x28); return 4;
              default: { const c = this.f & 1; this.f = (this.f & 0xC4) | (c ? 0x10 : 1) | (this.R[7] & 0x28); return 4; }
            }
        }
      case 1:
        if (op === 0x76) { this.halted = true; return 4; }
        if (y === 6) { this.wr(ix ? this.hx + this.dd : this.hl, this.R[z]); return ix ? 15 : 7; } // LD (HL),r uses the plain H/L even with a prefix
        if (z === 6) { v = this.rd(ix ? this.hx + this.dd : this.hl); this.R[y] = v; return ix ? 15 : 7; }
        this.sr(y, this.gr(z)); return 4;
      case 2:
        this.alu(y, this.gr(z)); return z === 6 ? (ix ? 15 : 7) : 4;
      default:
        switch (z) {
          case 0: if (this.cc(y)) { this.pc = this.pop(); return 11; } return 5;
          case 1:
            if (!q) { this.setRp2(p, this.pop()); return 10; }
            switch (p) {
              case 0: this.pc = this.pop(); return 10;
              case 1: { for (let i = 0; i < 6; i++) { const t0 = this.R[i]; this.R[i] = this.sh[i]; this.sh[i] = t0; } return 4; }
              case 2: this.pc = this.hx; return 4;
              default: this.sp = this.hx; return 6;
            }
          case 2: n = this.fetch16(); if (this.cc(y)) this.pc = n; return 10;
          case 3:
            switch (y) {
              case 0: this.pc = this.fetch16(); return 10;
              case 2: n = this.fetch(); this.bus.out((this.R[7] << 8) | n, this.R[7]); return 11;
              case 3: n = this.fetch(); this.R[7] = this.bus.in((this.R[7] << 8) | n); return 11;
              case 4: { const s = this.rd16(this.sp); this.wr16(this.sp, this.hx); this.hx = s; return 19; }
              case 5: { const d = this.de; this.de = this.hl; this.hl = d; return 4; }
              case 6: this.iff1 = this.iff2 = false; return 4;
              default: this.iff1 = this.iff2 = true; this.eiDelay = true; return 4;
            }
          case 4: n = this.fetch16(); if (this.cc(y)) { this.push(this.pc); this.pc = n; return 17; } return 10;
          case 5:
            if (!q) { this.push(this.rp2(p)); return 11; }
            n = this.fetch16(); this.push(this.pc); this.pc = n; return 17;
          case 6: this.alu(y, this.fetch()); return 7;
          default: this.push(this.pc); this.pc = y * 8; return 11;
        }
    }
  }
  execCB() {
    const op = this.nextOp(), x = op >> 6, y = (op >> 3) & 7, z = op & 7, mem = z === 6;
    const v = mem ? this.rd(this.hl) : this.R[z];
    if (x === 0) { const r = this.rot(y, v); if (mem) this.wr(this.hl, r); else this.R[z] = r; return mem ? 11 : 4; }
    if (x === 1) { const b = v & (1 << y); this.f = (this.f & 1) | 0x10 | (b ? 0 : 0x44) | (b & 0x80) | ((mem ? (this.hl >> 8) : v) & 0x28); return mem ? 8 : 4; }
    const r = x === 2 ? v & ~(1 << y) : v | (1 << y); if (mem) this.wr(this.hl, r); else this.R[z] = r; return mem ? 11 : 4;
  }
  execDDCB(op) {
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, a = (this.idx === 1 ? this.ix : this.iy) + this.dd, v = this.rd(a); let r;
    if (x === 1) { const b = v & (1 << y); this.f = (this.f & 1) | 0x10 | (b ? 0 : 0x44) | (b & 0x80) | ((a >> 8) & 0x28); return 16; }
    if (x === 0) r = this.rot(y, v); else if (x === 2) r = v & ~(1 << y); else r = v | (1 << y);
    this.wr(a, r); if (z !== 6) this.R[z] = r; return 19;
  }
  execED() {
    const op = this.nextOp(), x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1; let n, v;
    if (x === 1) {
      switch (z) {
        case 0: v = this.bus.in(this.bc); if (y !== 6) this.R[y] = v; this.f = (this.f & 1) | (v & 0xA8) | (v ? 0 : 0x40) | this.par[v]; return 8;
        case 1: this.bus.out(this.bc, y === 6 ? 0 : this.R[y]); return 8;
        case 2: if (!q) this.sbc16(this.rp(p)); else this.adc16(this.rp(p)); return 11;
        case 3: n = this.fetch16(); if (!q) this.wr16(n, this.rp(p)); else this.setRp(p, this.rd16(n)); return 16;
        case 4: { const a = this.R[7], r = (0 - a) & 255; this.f = 2 | (r & 0xA8) | (r ? 0 : 0x40) | ((a ^ r) & 0x10 ? 0x10 : 0) | (a === 0x80 ? 4 : 0) | (a ? 1 : 0); this.R[7] = r; return 4; }
        case 5: this.pc = this.pop(); this.iff1 = this.iff2; return 10;
        case 6: this.im = [0, 0, 1, 2, 0, 0, 1, 2][y]; return 4;
        default:
          switch (y) {
            case 0: this.i = this.R[7]; return 5; case 1: this.r = this.R[7]; return 5;
            case 2: v = this.i; this.R[7] = v; this.f = (this.f & 1) | (v & 0xA8) | (v ? 0 : 0x40) | (this.iff2 ? 4 : 0); return 5;
            case 3: v = this.r; this.R[7] = v; this.f = (this.f & 1) | (v & 0xA8) | (v ? 0 : 0x40) | (this.iff2 ? 4 : 0); return 5;
            case 4: { const m = this.rd(this.hl), a = this.R[7]; this.wr(this.hl, ((a & 15) << 4) | (m >> 4)); this.R[7] = (a & 0xF0) | (m & 15); this.f = (this.f & 1) | (this.R[7] & 0xA8) | (this.R[7] ? 0 : 0x40) | this.par[this.R[7]]; return 14; }
            case 5: { const m = this.rd(this.hl), a = this.R[7]; this.wr(this.hl, ((m << 4) & 0xF0) | (a & 15)); this.R[7] = (a & 0xF0) | (m >> 4); this.f = (this.f & 1) | (this.R[7] & 0xA8) | (this.R[7] ? 0 : 0x40) | this.par[this.R[7]]; return 14; }
            default: return 4;
          }
      }
    }
    if (x === 2 && y >= 4 && z <= 3) return this.block(y, z);
    return 4;
  }
  block(y, z) {
    const dec = y & 1, rep = y >= 6; let v, n;
    const step = dec ? -1 : 1;
    switch (z) {
      case 0: { // LDI / LDD / LDIR / LDDR
        v = this.rd(this.hl); this.wr(this.de, v); this.hl = this.hl + step; this.de = this.de + step; this.bc = (this.bc - 1) & 0xFFFF; n = (v + this.R[7]) & 255;
        this.f = (this.f & 0xC1) | (this.bc ? 4 : 0) | (n & 8) | ((n << 4) & 0x20);
        if (rep && this.bc) { this.pc = (this.pc - 2) & 0xFFFF; return 17; } return 12;
      }
      case 1: { // CPI / CPD / CPIR / CPDR
        v = this.rd(this.hl); const a = this.R[7], r = (a - v) & 255, h = ((a ^ v ^ r) & 0x10) ? 0x10 : 0; this.hl = this.hl + step; this.bc = (this.bc - 1) & 0xFFFF; n = r - (h ? 1 : 0);
        this.f = (this.f & 1) | 2 | h | (r & 0x80) | (r ? 0 : 0x40) | (this.bc ? 4 : 0) | (n & 8) | ((n << 4) & 0x20);
        if (rep && this.bc && r) { this.pc = (this.pc - 2) & 0xFFFF; return 17; } return 12;
      }
      case 2: { // INI / IND / INIR / INDR
        v = this.bus.in(this.bc); this.wr(this.hl, v); this.R[0] = (this.R[0] - 1) & 255; this.hl = this.hl + step; const k = v + ((this.R[1] + step) & 255);
        this.f = (this.R[0] & 0xA8) | (this.R[0] ? 0 : 0x40) | ((v & 0x80) ? 2 : 0) | (k > 255 ? 0x11 : 0) | this.par[((k & 7) ^ this.R[0]) & 255];
        if (rep && this.R[0]) { this.pc = (this.pc - 2) & 0xFFFF; return 17; } return 12;
      }
      default: { // OUTI / OUTD / OTIR / OTDR
        v = this.rd(this.hl); this.R[0] = (this.R[0] - 1) & 255; this.bus.out(this.bc, v); this.hl = this.hl + step; const k = v + this.R[5];
        this.f = (this.R[0] & 0xA8) | (this.R[0] ? 0 : 0x40) | ((v & 0x80) ? 2 : 0) | (k > 255 ? 0x11 : 0) | this.par[((k & 7) ^ this.R[0]) & 255];
        if (rep && this.R[0]) { this.pc = (this.pc - 2) & 0xFFFF; return 17; } return 12;
      }
    }
  }
}
if (typeof window !== 'undefined') window.Z80 = Z80;
