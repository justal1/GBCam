'use strict';
// Logo: a small turtle-graphics interpreter. FD 100 RT 90, REPEAT, TO ... END procedures (recursion works), MAKE and :variables,
// IF / IFELSE / FOR, arithmetic, SIN/COS (in degrees), RANDOM, CIRCLE, LABEL. Draws to a canvas that prints on the cat printer.
const Logo = (() => {
  const MAXSTEPS = 3000000, MAXDEPTH = 400;
  class Stop extends Error { } class Out extends Error { constructor(v) { super('out'); this.v = v; } }
  function tokenize(src) {
    const t = [], re = /\s*(?:(?<=^|[\s(\[])(-)(?=\S)|(;[^\n]*|\[|\]|\(|\)|<=|>=|<>|[-+*\/=<>]|:[^\s\[\]()+\-*\/=<>]+|"[^\s\[\]()]*|[^\s\[\]()+\-*\/=<>;:"]+))/y; let m; re.lastIndex = 0;
    const flat = []; while (re.lastIndex < src.length && (m = re.exec(src))) { if (m[1]) flat.push('neg'); else if (m[2][0] !== ';') flat.push(m[2]); }
    const rest = src.slice(re.lastIndex).trim(); if (rest && !rest.startsWith(';')) throw new Error('I did not understand “' + rest.slice(0, 12) + '”');
    let i = 0; const parse = depth => { const out = []; while (i < flat.length) { const w = flat[i++]; if (w === '[') out.push({ list: parse(depth + 1) }); else if (w === ']') { if (!depth) throw new Error('Extra ]'); return out; } else out.push(num(w)); } if (depth) throw new Error('Missing ]'); return out; };
    return parse(0);
  }
  const num = w => (/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(w) ? parseFloat(w) : w.toLowerCase().startsWith(':') ? w.toLowerCase() : w[0] === '"' ? w : w.toLowerCase());

  function run(src, opt) {
    opt = opt || {}; const prog = tokenize(src), procs = {}, segs = [], labels = [];
    const T = { x: 0, y: 0, h: 0, down: true, w: opt.penSize || 2 }; let steps = 0, depth = 0;
    const rad = d => d * Math.PI / 180;
    // pull procedure definitions out first (TO name :a :b ... END)
    const body = []; for (let i = 0; i < prog.length; i++) { if (prog[i] === 'to') { const name = prog[++i], params = []; i++; while (typeof prog[i] === 'string' && prog[i][0] === ':') params.push(prog[i++]); const b = []; while (i < prog.length && prog[i] !== 'end') b.push(prog[i++]); if (i >= prog.length) throw new Error('TO ' + name + ' needs END'); procs[name] = { params, body: b }; } else body.push(prog[i]); }
    const move = d => { const nx = T.x + d * Math.sin(rad(T.h)), ny = T.y + d * Math.cos(rad(T.h)); if (T.down) segs.push([T.x, T.y, nx, ny, T.w]); T.x = nx; T.y = ny; };
    const FN = { // reporters: [arity, fn]
      sin: [1, a => Math.sin(rad(a))], cos: [1, a => Math.cos(rad(a))], tan: [1, a => Math.tan(rad(a))], arctan: [1, a => Math.atan(a) * 180 / Math.PI], sqrt: [1, Math.sqrt], abs: [1, Math.abs], int: [1, Math.trunc], round: [1, Math.round],
      random: [1, a => Math.floor(Math.random() * a)], remainder: [2, (a, b) => a % b], power: [2, Math.pow], minus: [1, a => -a], heading: [0, () => T.h], xcor: [0, () => T.x], ycor: [0, () => T.y], pi: [0, () => Math.PI], sum: [2, (a, b) => a + b], product: [2, (a, b) => a * b], quotient: [2, (a, b) => a / b], difference: [2, (a, b) => a - b], max: [2, Math.max], min: [2, Math.min],
    };
    const ALIAS = { forward: 'fd', back: 'bk', backward: 'bk', left: 'lt', right: 'rt', penup: 'pu', pendown: 'pd', clearscreen: 'cs', clean: 'cs', setheading: 'seth', hideturtle: 'ht', showturtle: 'st', setpensize: 'pensize', setpc: 'setpc', setcolor: 'setpc', output: 'op', cleargraphics: 'cs' };
    const CMD = { // commands: [arity, fn(args, env)]
      fd: [1, a => move(a[0])], bk: [1, a => move(-a[0])], lt: [1, a => { T.h = (T.h - a[0]) % 360; }], rt: [1, a => { T.h = (T.h + a[0]) % 360; }], pu: [0, () => { T.down = false; }], pd: [0, () => { T.down = true; }],
      home: [0, () => { T.x = 0; T.y = 0; T.h = 0; }], cs: [0, () => { segs.length = 0; labels.length = 0; T.x = 0; T.y = 0; T.h = 0; }], setxy: [2, a => { if (T.down) segs.push([T.x, T.y, a[0], a[1], T.w]); T.x = a[0]; T.y = a[1]; }],
      setx: [1, a => { if (T.down) segs.push([T.x, T.y, a[0], T.y, T.w]); T.x = a[0]; }], sety: [1, a => { if (T.down) segs.push([T.x, T.y, T.x, a[0], T.w]); T.y = a[0]; }], seth: [1, a => { T.h = a[0] % 360; }], pensize: [1, a => { T.w = Math.max(1, a[0]); }],
      setpc: [1, () => { }], ht: [0, () => { }], st: [0, () => { }], wait: [1, () => { }], stop: [0, () => { throw new Stop(); }], op: [1, a => { throw new Out(a[0]); }],
      circle: [1, a => { const r = Math.abs(a[0]), n = Math.max(24, Math.round(r * 1.2)); let px = T.x + r * Math.sin(0), py = T.y + r; for (let k = 1; k <= n; k++) { const t = k / n * 2 * Math.PI, nx = T.x + r * Math.sin(t), ny = T.y + r * Math.cos(t); if (T.down) segs.push([px, py, nx, ny, T.w]); px = nx; py = ny; } }],
      arc: [2, a => { const r = Math.abs(a[1]), n = Math.max(8, Math.round(Math.abs(a[0]) / 5)); let px = T.x + r * Math.sin(rad(T.h)), py = T.y + r * Math.cos(rad(T.h)); for (let k = 1; k <= n; k++) { const t = rad(T.h + a[0] * k / n), nx = T.x + r * Math.sin(t), ny = T.y + r * Math.cos(t); if (T.down) segs.push([px, py, nx, ny, T.w]); px = nx; py = ny; } }],
      label: [1, a => { labels.push([T.x, T.y, String(a[0]).replace(/^"/, ''), T.h]); }], print: [1, () => { }],
    };
    const tick = () => { if (++steps > MAXSTEPS) throw new Error('That is taking too long (stopped after ' + MAXSTEPS + ' steps). Is there a loop that never ends?'); };
    function expr(t, i, env, minPrec = 0) { // precedence climbing: comparison < + - < * /
      let [a, j] = primary(t, i, env);
      for (;;) { const o = t[j], p = o === '=' || o === '<' || o === '>' || o === '<=' || o === '>=' || o === '<>' ? 1 : (o === '+' || o === '-') ? 2 : (o === '*' || o === '/') ? 3 : 0; if (!p || p < minPrec || typeof o !== 'string') break; const [b, k] = expr(t, j + 1, env, p + 1); a = o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : o === '/' ? a / b : o === '=' ? +(a == b) : o === '<' ? +(a < b) : o === '>' ? +(a > b) : o === '<=' ? +(a <= b) : o === '>=' ? +(a >= b) : +(a != b); j = k; }
      return [a, j];
    }
    function primary(t, i, env) {
      const w = t[i]; if (w === undefined) throw new Error('Something is missing at the end');
      if (typeof w === 'number') return [w, i + 1];
      if (w === 'neg' || w === '-') { const [v, j] = primary(t, i + 1, env); return [-v, j]; }
      if (w === '(') { const [v, j] = expr(t, i + 1, env); if (t[j] !== ')') throw new Error('Missing )'); return [v, j + 1]; }
      if (typeof w === 'object') throw new Error('Unexpected [ ]');
      if (w[0] === ':') { if (!(w in env)) throw new Error('I do not know ' + w + ' (use MAKE "' + w.slice(1) + ' …)'); return [env[w], i + 1]; }
      if (w[0] === '"') return [w.slice(1), i + 1];
      const name = ALIAS[w] || w;
      if (FN[name]) { const [ar, fn] = FN[name]; const args = []; let j = i + 1; for (let k = 0; k < ar; k++) { const [v, nj] = expr(t, j, env, 2); args.push(v); j = nj; } return [fn(...args), j]; }
      if (procs[name] && procs[name].params.length >= 0) { const [v, j] = callProc(name, t, i + 1, env); return [v === undefined ? 0 : v, j]; }
      throw new Error('I do not know how to ' + w);
    }
    function callProc(name, t, j, env) {
      const P = procs[name], local = {}; for (const p of P.params) { const [v, nj] = expr(t, j, env); local[p] = v; j = nj; }
      if (++depth > MAXDEPTH) throw new Error('Too many nested calls in ' + name.toUpperCase() + ' (it never stops?)');
      let ret; try { exec(P.body, local); } catch (e) { if (e instanceof Out) ret = e.v; else if (!(e instanceof Stop)) throw e; } depth--; return [ret, j];
    }
    function exec(t, env) {
      let i = 0; while (i < t.length) {
        tick(); const w = t[i]; if (typeof w !== 'string') throw new Error('I was not expecting ' + (typeof w === 'number' ? w : '[ ]') + ' there'); const name = ALIAS[w] || w; i++;
        if (name === 'repeat') { const [n, j] = expr(t, i, env), L = t[j]; if (!L || !L.list) throw new Error('REPEAT needs a [list] of commands'); i = j + 1; for (let k = 0; k < n; k++) exec(L.list, env); continue; }
        if (name === 'if' || name === 'ifelse') { const [c, j] = expr(t, i, env), A = t[j]; if (!A || !A.list) throw new Error(name.toUpperCase() + ' needs a [list]'); i = j + 1; if (name === 'ifelse') { const B = t[i]; if (!B || !B.list) throw new Error('IFELSE needs two [lists]'); i++; exec(c ? A.list : B.list, env); } else if (c) exec(A.list, env); continue; }
        if (name === 'make') { const [v, j] = expr(t, i, env); const [val, k] = expr(t, j, env); env[':' + String(v).toLowerCase()] = val; i = k; continue; }
        if (name === 'for') { const spec = t[i], L = t[i + 1]; if (!spec || !spec.list || !L || !L.list) throw new Error('FOR [i 1 10 1] [commands]'); i += 2; const [vn, a, b, st] = [spec.list[0], ...[1, 2, 3].map(q => { const r = spec.list[q] === undefined ? [q === 3 ? 1 : 0] : expr(spec.list, q, env); return r[0]; })]; if (!st) throw new Error('FOR step cannot be 0'); for (let v = a; st > 0 ? v <= b : v >= b; v += st) { env[':' + vn] = v; exec(L.list, env); } continue; }
        if (w === 'neg') throw new Error('A minus sign needs a space after it when it is a subtraction: write 10 - 5, or put the number in brackets like (3 - 1)');
        const c = CMD[name]; if (c) { const args = []; for (let k = 0; k < c[0]; k++) { const [v, j] = expr(t, i, env); args.push(v); i = j; } c[1](args, env); continue; }
        if (procs[name]) { const [, j] = callProc(name, t, i, env); i = j; continue; }
        if (FN[name]) throw new Error(w.toUpperCase() + ' gives a value; use it like FD ' + w.toUpperCase() + ' …');
        throw new Error('I do not know how to ' + w.toUpperCase());
      }
    }
    try { exec(body, {}); } catch (e) { if (!(e instanceof Stop) && !(e instanceof Out)) throw e; }
    return { segs, labels, turtle: T };
  }
  // draw segments onto a canvas; fit = scale the drawing to fill the page
  function draw(res, W, H, fit) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.strokeStyle = '#000'; x.fillStyle = '#000'; x.lineCap = x.lineJoin = 'round';
    const pts = []; for (const s of res.segs) pts.push([s[0], s[1]], [s[2], s[3]]); for (const l of res.labels) pts.push([l[0], l[1]]);
    let minx = -1, maxx = 1, miny = -1, maxy = 1; if (pts.length) { minx = Math.min(...pts.map(p => p[0])); maxx = Math.max(...pts.map(p => p[0])); miny = Math.min(...pts.map(p => p[1])); maxy = Math.max(...pts.map(p => p[1])); }
    const pad = 16, bw = Math.max(1e-6, maxx - minx), bh = Math.max(1e-6, maxy - miny); let k = fit ? Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh) : 1; if (fit && k > 6) k = 6;
    const ox = fit ? W / 2 - (minx + maxx) / 2 * k : W / 2, oy = fit ? H / 2 + (miny + maxy) / 2 * k : H / 2;
    for (const [x1, y1, x2, y2, w] of res.segs) { x.lineWidth = Math.max(1.5, w * (fit ? Math.min(1, Math.sqrt(k)) : 1)); x.beginPath(); x.moveTo(ox + x1 * k, oy - y1 * k); x.lineTo(ox + x2 * k, oy - y2 * k); x.stroke(); }
    x.font = '700 22px system-ui, sans-serif'; x.textBaseline = 'middle'; for (const [lx, ly, t] of res.labels) x.fillText(t, ox + lx * k, oy - ly * k);
    return c;
  }
  const EXAMPLES = {
    square: ['Square', 'REPEAT 4 [FD 100 RT 90]'],
    star: ['Star', 'REPEAT 5 [FD 150 RT 144]'],
    spiral: ['Square spiral', 'MAKE "len 5\nREPEAT 60 [FD :len RT 90 MAKE "len :len + 5]'],
    circles: ['Ring of circles', 'REPEAT 12 [PU FD 70 PD CIRCLE 30 PU BK 70 RT 30]'],
    flower: ['Flower', 'REPEAT 12 [REPEAT 6 [FD 40 RT 60] RT 30]'],
    rosette: ['Rosette', 'REPEAT 36 [REPEAT 4 [FD 80 RT 90] RT 10]'],
    tree: ['Tree (recursion)', 'TO TREE :size\n  IF :size < 6 [STOP]\n  FD :size\n  LT 30 TREE :size * 0.7\n  RT 60 TREE :size * 0.7\n  LT 30 BK :size\nEND\nTREE 70'],
    snowflake: ['Snowflake', 'TO KOCH :n :len\n  IFELSE :n = 0 [FD :len] [\n    KOCH :n - 1 :len / 3 LT 60\n    KOCH :n - 1 :len / 3 RT 120\n    KOCH :n - 1 :len / 3 LT 60\n    KOCH :n - 1 :len / 3 ]\nEND\nREPEAT 3 [KOCH 3 150 RT 120]'],
    house: ['House', 'TO SQUARE :s\n  REPEAT 4 [FD :s RT 90]\nEND\nSQUARE 100\nFD 100 RT 30\nREPEAT 3 [FD 100 RT 120]'],
    hello: ['Hello label', 'REPEAT 6 [FD 80 RT 60]\nPU SETXY -40 -8 PD\nLABEL "HELLO'],
  };
  return { run, draw, EXAMPLES, tokenize };
})();
if (typeof window !== 'undefined') window.Logo = Logo;
