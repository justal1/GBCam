'use strict';
// Shutter modes: self-timer, burst, photo-booth strips, and short clip recording with a frame scrubber.
const Shots = (() => {
  let busy = false, cancel = false, clip = null;
  const cd = $('count');

  async function countdown(sec, label) {
    for (let i = sec; i > 0 && !cancel; i--) { cd.textContent = (label ? label + ' ' : '') + i; cd.hidden = false; if (navigator.vibrate) navigator.vibrate(15); await sleep(1000); }
    cd.hidden = true;
  }
  function setBusy(b) { busy = b; $('shutter').textContent = b ? '✕' : '●'; $('shutter').style.fontSize = b ? '30px' : '0'; }

  async function strip(n) {
    const frames = [], rgbs = [], c = cfg();
    for (let i = 0; i < n && !cancel; i++) {
      if (i > 0) await countdown(2, 'Next:');
      if (cancel) return;
      const g = grabVideo(); if (!g) { alert('No camera image'); return; }
      frames.push(g); rgbs.push(new Uint8ClampedArray(rgbFor(192, 168)));
      flash(); if (navigator.vibrate) navigator.vibrate(40); await sleep(120);
    }
    if (cancel || !frames.length) return;
    const parts = [Prt.textBits('PHOTO BOOTH', { size: 30 })];
    for (const g of frames) { parts.push(Prt.solid(5)); parts.push({ bits: process(g, c).bits, h: H }); }
    parts.push(Prt.solid(5));
    parts.push(Prt.textBits(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), { size: 20, bold: false }));
    const s = Prt.stack(parts);
    Prt.previewBits(s.bits, 'strip', { text: '💾 Save frames to album', fn: async () => { for (let i = 0; i < frames.length; i++) await Album.save(frames[i], rgbs[i], true); $('modal').hidden = true; } });
    window.lastStrip = s;
  }

  async function shutter() {
    if (busy) { cancel = true; return; }
    setBusy(true); cancel = false;
    try {
      const mode = $('shotmode').value, t = +$('timer').value;
      if (t) await countdown(t);
      if (cancel) return;
      if (mode === 'single') await capture();
      else if (mode === 'burst') { for (let i = 0; i < 4 && !cancel; i++) { await capture(); await sleep(450); } }
      else await strip(mode === 'strip3' ? 3 : 4);
    } finally { setBusy(false); cd.hidden = true; }
  }

  // ---- clip recorder ----
  async function record() {
    if (clip && clip.recording) return;
    const frames = []; clip = { recording: true, frames }; $('clipbtn').textContent = '● REC'; $('clipbtn').classList.add('rec');
    const t0 = performance.now();
    while (performance.now() - t0 < 3000 && frames.length < 24) {
      const g = grabVideo(); if (g) frames.push(wx.getImageData(0, 0, W, H));
      await sleep(125);
    }
    clip.recording = false; $('clipbtn').textContent = '🎞 Clip'; $('clipbtn').classList.remove('rec');
    if (!frames.length) { alert('No camera image'); return; }
    $('clipscrub').max = frames.length - 1; $('clipscrub').value = frames.length >> 1; $('clipbar').hidden = false; show(+$('clipscrub').value);
  }
  function show(i) {
    if (!clip || !clip.frames[i]) return; live = false; $('reviewbar').style.display = 'flex';
    stillCv.width = W; stillCv.height = H; stillCx.putImageData(clip.frames[i], 0, 0); srcCv = stillCv; stillId = null; still = null;
    render(toGray(clip.frames[i].data));
  }
  function done() { $('clipbar').hidden = true; clip = null; backToCam(); }
  $('clipbtn').onclick = record;
  $('clipscrub').oninput = () => show(+$('clipscrub').value);
  $('clipkeep').onclick = async () => { await capture(); };
  $('clipdone').onclick = done;
  return { shutter, strip, record, show, done, get busy() { return busy; } };
})();
