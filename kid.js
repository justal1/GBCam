'use strict';
// Kid mode: simpler screens, a Surprise button, a print limit per hour, and a parent PIN to change anything.
const Kid = (() => {
  const KEY = 'catcam-kid', $$ = id => document.getElementById(id);
  let cfg = { on: false, pin: '', limit: 12, prints: [] };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { } };
  const SURPRISE = ['bighead', 'bugeyes', 'swirl', 'fisheye', 'kaleido', 'wobble', 'pixel', 'halftone', 'cartoon', 'mirror', 'football', 'melt', 'rainbow', 'sparkles', 'shades', 'crown', 'catface', 'partyhat', 'moustache', 'mazeportrait', 'emoji', 'stencil', 'engrave', 'lineart', 'zoomburst', 'quadmirror', 'mirrorspin', 'pinch', 'skinny', 'squash', 'tile', 'goo'];

  // ---- print limit ----
  const recent = () => { const cut = Date.now() - 3600e3; cfg.prints = cfg.prints.filter(t => t > cut); return cfg.prints; };
  function canPrint() { if (!cfg.on) return true; if (recent().length < cfg.limit) return true; const mins = Math.max(1, Math.ceil((recent()[0] + 3600e3 - Date.now()) / 60000)); toast(`Paper break! You have used ${cfg.limit} prints this hour. Try again in about ${mins} min, or ask a grown-up.`, 'bad'); return false; }
  function printed() { if (!cfg.on) return; recent().push(Date.now()); save(); refreshBar(); }

  // ---- applying the mode ----
  const parentBits = [...document.querySelectorAll('details')].filter(d => /Printer settings|Log/.test(d.querySelector('summary') ? d.querySelector('summary').textContent : ''));
  parentBits.forEach(d => d.classList.add('parentonly'));
  function apply() {
    document.body.classList.toggle('kid', cfg.on);
    if (cfg.on) { const t = typeof tab !== 'undefined' ? tab : 'cam'; if (t === 'pr') $$('tabcam').click(); }
    refreshBar();
  }
  function refreshBar() { const n = $$('kidcount'); if (n) n.textContent = cfg.on ? `${Math.max(0, cfg.limit - recent().length)} prints left this hour` : ''; }

  // ---- bar under the tabs ----
  const bar = document.createElement('div'); bar.id = 'kidbar';
  bar.innerHTML = '<button id="kidsurprise" class="pri" type="button">🎁 Surprise me!</button><button id="kidparent" type="button" aria-label="Parents">🔒</button><span id="kidcount" class="sub"></span>';
  $$('tabs').after(bar);
  $$('kidsurprise').onclick = () => {
    const btns = [...document.querySelectorAll('#fxgrid button')].filter(b => SURPRISE.includes(b.dataset.k)); if (!btns.length) return;
    const b = btns[Math.floor(Math.random() * btns.length)]; b.click(); $$('tabcam').click(); toast('✨ ' + b.querySelector('small').textContent + '!');
    if (navigator.vibrate) navigator.vibrate(30);
  };

  // ---- dialogs ----
  function dialog(html) {
    let d = $$('kiddlg'); if (d) d.remove();
    d = document.createElement('div'); d.id = 'kiddlg'; d.innerHTML = `<div class="kidcard" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d) d.remove(); }); return d;
  }
  const close = () => { const d = $$('kiddlg'); if (d) d.remove(); };
  function setup() { // parent turns kid mode on
    const d = dialog(`<h3>Turn on Kid mode</h3><p class="sub">Kid mode hides the settings and the techy screens, adds a Surprise button and limits paper use. A parent PIN is needed to turn it off.</p>
      <label class="sub">Choose a 4-digit parent PIN</label><input id="kpin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">
      <label class="sub" style="margin-top:8px">Most prints per hour</label><input id="klim" type="number" min="1" max="60" value="${cfg.limit}">
      <div class="row"><button id="kcancel" type="button">Cancel</button><button id="kgo" class="pri" type="button">Start Kid mode</button></div><div id="kerr" class="sub" style="color:var(--bad)"></div>`);
    d.querySelector('#kcancel').onclick = close;
    d.querySelector('#kgo').onclick = () => { const pin = d.querySelector('#kpin').value; if (!/^\d{4}$/.test(pin)) { d.querySelector('#kerr').textContent = 'The PIN must be 4 digits.'; return; } cfg.pin = pin; cfg.limit = Math.max(1, Math.min(60, +d.querySelector('#klim').value || 12)); cfg.on = true; cfg.prints = []; save(); close(); apply(); toast('Kid mode is on'); };
  }
  function parent() { // kid taps the lock; PIN needed
    const d = dialog(`<h3>Parents</h3><label class="sub">Enter the PIN</label><input id="kpin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"><div id="kerr" class="sub" style="color:var(--bad)"></div><div class="row"><button id="kcancel" type="button">Close</button><button id="kok" class="pri" type="button">Unlock</button></div>`);
    d.querySelector('#kcancel').onclick = close;
    const tryPin = () => { if (d.querySelector('#kpin').value !== cfg.pin) { d.querySelector('#kerr').textContent = 'Wrong PIN.'; d.querySelector('#kpin').value = ''; return; } panel(); };
    d.querySelector('#kok').onclick = tryPin; d.querySelector('#kpin').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); }); setTimeout(() => d.querySelector('#kpin').focus(), 50);
  }
  function panel() {
    const d = dialog(`<h3>Parent controls</h3><p class="sub">${recent().length} prints in the last hour (limit ${cfg.limit}).</p>
      <label class="sub">Most prints per hour</label><input id="klim" type="number" min="1" max="60" value="${cfg.limit}">
      <label class="sub" style="margin-top:8px">New PIN (leave empty to keep)</label><input id="kpin2" type="password" inputmode="numeric" maxlength="4" placeholder="••••">
      <div class="row"><button id="kreset" type="button">Reset print count</button><button id="ksave" type="button">Save</button></div>
      <div class="row"><button id="kexit" class="pri" type="button">Turn Kid mode off</button><button id="kcancel" type="button">Close</button></div><div id="kerr" class="sub"></div>`);
    d.querySelector('#kcancel').onclick = close;
    d.querySelector('#kreset').onclick = () => { cfg.prints = []; save(); refreshBar(); d.querySelector('#kerr').textContent = 'Print count reset.'; };
    d.querySelector('#ksave').onclick = () => { cfg.limit = Math.max(1, Math.min(60, +d.querySelector('#klim').value || 12)); const p = d.querySelector('#kpin2').value; if (p) { if (!/^\d{4}$/.test(p)) { d.querySelector('#kerr').textContent = 'The PIN must be 4 digits.'; return; } cfg.pin = p; } save(); refreshBar(); d.querySelector('#kerr').textContent = 'Saved.'; };
    d.querySelector('#kexit').onclick = () => { cfg.on = false; save(); close(); apply(); toast('Kid mode is off'); };
  }
  $$('kidparent').onclick = parent;

  // ---- the parent-side switch lives in Printer settings ----
  const ps = parentBits[0]; if (ps) { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = '<button id="kidon" type="button">🧒 Turn on Kid mode…</button>'; ps.appendChild(row); row.querySelector('button').onclick = setup; }
  apply();
  return { get on() { return cfg.on; }, canPrint, printed, apply, setup, parent, panel, get cfg() { return cfg; }, recent };
})();
window.Kid = Kid;
