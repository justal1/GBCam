'use strict';
// Printer health: connection, a status check, and a paper-roll gauge that counts how much paper the prints have used.
const Health = (() => {
  const KEY = 'catcam-health', $$ = id => document.getElementById(id);
  let h = { mm: 0, prints: 0, fails: 0, lastErr: '', lastAt: 0, roll: 4, since: Date.now(), warned: 0 };
  try { Object.assign(h, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch (e) { } };
  const pct = () => Math.min(100, Math.round(h.mm / (h.roll * 1000) * 100));
  function record(rows, ok, err) {
    if (ok) { h.mm += rows / 8; h.prints++; h.lastAt = Date.now(); const p = pct(); if (p >= 100 && h.warned < 100) { h.warned = 100; toast('The paper roll should be empty about now. Check it!', 'bad'); } else if (p >= 90 && h.warned < 90) { h.warned = 90; toast('The paper roll is about ' + p + '% used. Have a spare ready!'); } else if (p >= 75 && h.warned < 75) { h.warned = 75; toast('About a quarter of the paper roll is left'); } }
    else { h.fails++; h.lastErr = String(err || 'unknown'); }
    save(); render();
  }
  const ago = t => { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
  function render() {
    const root = $$('hpbox'); if (!root) return;
    const connected = typeof ble !== 'undefined' && ble.wc && ble.dev && ble.dev.gatt && ble.dev.gatt.connected;
    $$('hpconn').textContent = connected ? '🟢 Connected to ' + (ble.dev.name || 'the printer') : '⚪ Not connected';
    const p = pct(), left = Math.max(0, h.roll * 1000 - h.mm);
    $$('hpbar').style.width = p + '%'; $$('hpbar').className = p >= 90 ? 'bad' : p >= 75 ? 'warn' : '';
    $$('hppaper').textContent = `Paper: about ${(h.mm / 1000).toFixed(2)} m used of ${h.roll} m (${100 - p}% left, roughly ${(left / 1000).toFixed(1)} m)`;
    $$('hpstats').textContent = `${h.prints} prints since the roll was changed (${new Date(h.since).toLocaleDateString()}) · last print ${ago(h.lastAt)}` + (h.fails ? ` · ${h.fails} failed` : '') + (h.lastErr ? ` · last problem: ${h.lastErr.slice(0, 70)}` : '');
    $$('hproll').value = String(h.roll);
  }
  // ask the printer how it is: command 0xA3, answered by a notification
  function decode(b) {
    if (!b || !b.length) return 'No answer.';
    const hex = b.map(v => v.toString(16).padStart(2, '0')).join(' '), s = b[0];
    const meaning = s === 0 ? 'ready' : s === 0x80 ? 'busy printing' : 'unusual state (0x' + s.toString(16) + '): check the paper and the cover';
    return `${meaning}   [raw: ${hex}]`;
  }
  async function check() {
    const out = $$('hpstate');
    if (typeof ble === 'undefined' || !ble.wc) { out.textContent = 'Connect the printer first.'; return; }
    out.textContent = 'Asking the printer…'; const t0 = Date.now(); ble.lastState = null;
    try { await ble.wc.writeValueWithoutResponse(pkt(0xA3, [0])); } catch (e) { out.textContent = 'Could not ask: ' + e.message; return; }
    for (let i = 0; i < 40 && !(ble.lastState && ble.stateAt >= t0); i++) await new Promise(r => setTimeout(r, 50));
    out.textContent = ble.lastState && ble.stateAt >= t0 ? decode(ble.lastState) : 'The printer did not answer (it may be asleep: tap Connect printer).';
    if (typeof log === 'function') log('printer state:', out.textContent);
  }
  function bind() {
    $$('hpcheck').onclick = check; $$('hpconnect').onclick = () => $$('connect').click();
    $$('hpnew').onclick = () => { if (!confirm('Reset the paper gauge because you put in a new roll?')) return; h.mm = 0; h.prints = 0; h.fails = 0; h.lastErr = ''; h.since = Date.now(); h.warned = 0; save(); render(); toast('New roll: gauge reset'); };
    $$('hproll').onchange = e => { h.roll = +e.target.value; h.warned = 0; save(); render(); };
    window.addEventListener('printerstate', render); setInterval(render, 15000); render();
  }
  if (document.getElementById('hpbox')) bind();
  return { record, render, check, get data() { return h; } };
})();
window.Health = Health;
