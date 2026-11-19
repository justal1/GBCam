# CatCam
Game Boy Camera–style dithered photos, printed on a cheap BLE "cat" thermal printer (GB01/02/03, MX05/06, YT01…). Web app, no install.

Run: `./serve.sh`, open the https URL in **Chrome on Android**, accept the cert warning, tap Connect printer.
Modes: Game Boy Camera (128x112, 4 levels, Bayer 4x4, printed as 3x3 dot patterns), Bayer, Floyd–Steinberg, threshold.
Protocol: service 0xAE30, write 0xAE01, notify 0xAE02; frame 51 78 cmd 00 lenLE data crc8(poly 7) ff; 384 dots/row (48 bytes), cmds A4 quality, A6 lattice, AF energy, BE mode, A2 row, A1 feed.
If the print is wrong: Printer settings -> MSB-first bits, chunk size 20, row delay; the Log panel shows services + notifications. "Mock printer" logs packets without BLE.
Headless test: test.html (python3 -m http.server, Chrome headless with --use-fake-device-for-media-stream).

## Game Boy tab (emulator)
gb.js = DMG emulator (CPU, PPU, timers, no audio) + Pocket Camera cart (0xFC: camera regs at A000 w/ bank 0x10, capture quantised with the game's own dither matrix into SRAM A100) + Game Boy Printer on the link port. gbui.js = UI glue.
The phone camera feeds the sensor (128x112 gray, scaled by exposure/0x800 * "Sensor bright"). Game prints (VIEW -> photo -> A -> up=print -> A) are caught, shown as a page, and sent to the cat printer (2x scale, 4 greys via 2x2 dots).
ROM: user supplies camera.gb via "Load ROM…" (stored in this browser's IndexedDB only; saves = photos persist in IDB 'sram', Export save gives camera.sav). `rom/` holds a local symlink for headless tests only - do NOT publish it.
Tests: gbtest.html (boots real ROM, drives menus, prints), apptest.html (UI glue, mock printer). Chrome headless, serve with python3 -m http.server 8799.
Unverified: real phone camera as sensor, touch controls, performance on the phone, real printer. Audio not implemented.

## Game Boy Color look (camera tab)
gbc.js: captures colour at 128x112, 8x8 tiles each pick one of 8 palettes of 4 colours (15-bit RGB, k-means fitted per frame, warm-started), Bayer-dithered. Select "Look: Game Boy Color". Preview/PNG/gallery thumbs are colour; printing is still mono from the same photo. Saturation slider added. Not yet applied inside the emulator tab (there the GBC-style palettes still apply to the DMG output).

## Colour dither look
`Look: Colour dither (better camera)`: full-colour photo at 128x112 / 192x168 / 384x336, reduced to 8/27/64/216 colours (levels^3 RGB) with Bayer 8x8 or Floyd-Steinberg (gbc.js GBC.dither). Shots store a 192x168 RGB copy so colour looks work on saved photos. Print stays mono.

## Effects tab
fx.js: 14 warp effects (football head, big head, bug eyes, tiny face, swirl, fisheye, mirror x2, kaleidoscope, wobble, chunky pixels, squash, skinny, multiply) applied to the 384x336 work canvas in grabVideo/loadBitmap, so they flow into every look, the gallery and Print. Tap/drag on the viewfinder places the effect; 'Follow my face' uses the Shape Detection FaceDetector if the browser has it (Android Chrome: flag chrome://flags Experimental Web Platform features). Headless-checked with a synthetic cartoon face (fxtest.html); not tried with a live camera/face.

## GitHub Pages
Static, no build step. Serve the repo root (Pages: Settings -> Pages -> Deploy from branch -> main / root). The Game Boy tab needs your own `camera.gb`: use "Load ROM..." on the phone once (it is kept in the browser only). The "From server" button only works when run via serve.sh with a local `rom/camera.gb`.
