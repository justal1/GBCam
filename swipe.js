'use strict';
// Swipe left / right on the page to move between the top tabs (Cam, Fun, Print, Make, GB).
// Ignored on things that already use horizontal drags: the camera picture, sliders, the chip rows, canvases, the Game Boy pad.
const Swipe = (() => {
  const IDS = ['tabcam', 'tabfx', 'tabpr', 'tabmk', 'tabgb', 'tabzx'];
  const BLOCK = 'input, select, textarea, canvas, #camdock, #mkchips, .ctl, #gbpad, #gbstage, #modal, #kiddlg, #goo-tools, #stk, #zxkeys, #fxgrid .fxh, [data-noswipe]';
  let t0 = null;
  const visible = () => IDS.map(id => document.getElementById(id)).filter(b => b && getComputedStyle(b).display !== 'none');
  function go(dir) {
    const tabs = visible(), cur = tabs.findIndex(b => b.classList.contains('pri')), n = cur + dir;
    if (cur < 0 || n < 0 || n >= tabs.length) return false;
    tabs[n].click(); window.scrollTo(0, 0); if (navigator.vibrate) navigator.vibrate(8);
    document.body.animate([{ opacity: 0.55, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    tabs[n].scrollIntoView && tabs[n].scrollIntoView({ block: 'nearest', inline: 'center' });
    return true;
  }
  function decide(dx, dy, dt, target) {
    if (dt > 700 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.5) return false;
    if (target && target.closest && target.closest(BLOCK)) return false;
    return go(dx < 0 ? 1 : -1);
  }
  document.addEventListener('touchstart', e => { if (e.touches.length !== 1) { t0 = null; return; } const t = e.touches[0]; t0 = { x: t.clientX, y: t.clientY, t: Date.now(), target: e.target }; }, { passive: true });
  document.addEventListener('touchend', e => { if (!t0) return; const t = e.changedTouches[0], r = decide(t.clientX - t0.x, t.clientY - t0.y, Date.now() - t0.t, t0.target); t0 = null; if (r) e.stopPropagation(); }, { passive: true });
  document.addEventListener('touchcancel', () => { t0 = null; }, { passive: true });
  // one-time hint
  try { if (!localStorage.getItem('catcam-swipehint')) { localStorage.setItem('catcam-swipehint', '1'); setTimeout(() => { if (typeof toast === 'function') toast('Tip: swipe left or right to change tabs'); }, 2500); } } catch (e) { }
  return { go, decide };
})();
