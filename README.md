# GB CatCam

A single-page web app (PWA, no build step, hosted on GitHub Pages) for cheap Bluetooth "cat" thermal printers (tested with a PD01; GB01/02/03, MX05/06, YT01 use the same protocol). It started as a Game Boy Camera look-alike and grew into a pocket print shop.

**Run it:** `./serve.sh` and open the https URL in Chrome on Android (accept the cert warning), or use the GitHub Pages site. Tap **Connect printer** once; after that the app remembers it (see "Bluetooth" below).

## Tabs
| Tab | What it does | Code |
|---|---|---|
| Cam | Live camera, Game Boy / GBC / colour dithers, timer, burst, photo-booth strips, clips, album | `index.html`, `gbc.js`, `shots.js`, `album.js` |
| Fun | 44 effects (warps, glitch, goo/liquify), frames, stickers, captions | `fx.js`, `fx2.js`, `goo.js`, `overlay.js` |
| Print | Label printer, calibration page, **printer health** (paper gauge, status check) | `print.js`, `health.js` |
| Make | 26 printables: photo strip, sticker, wanted poster, gift tags, QR/barcodes, QR scanner, to-do, day card, dice, scroll, mazes, sudoku, word search, drawing pad, ANSI art viewer/editor, image search, Logo turtle, origami, **party printables, labels and templates, planners, Wikipedia cards** | `make.js`, `printables.js`, `logo.js`, `origami.js`, `ansi.js`, `ansidraw.js` |
| GB | Game Boy / Game Boy Colour emulator with Pocket Camera and Game Boy Printer support (bring your own ROMs) | `gb.js`, `gbui.js` |
| ZX | ZX Spectrum 48K emulator with ZX Printer (COPY/LPRINT), BASIC typing, .TAP/.ZIP loading | `spectrum/` |

Kid mode (`kid.js`) hides the less suitable panels, adds a print limit and a PIN. `swipe.js` swaps tabs by swiping.

## How printing works
`Prt.printBits(bits, label)` (print.js) is the single entry point. `bits` is a `Uint8Array`, 384 dots wide x h rows, 1 = ink (about 8 dots per mm). Everything else (Make panels, album, emulators) builds bits and calls it.
- Protocol: BLE service 0xAE30, write 0xAE01, notify 0xAE02. Frame `51 78 cmd 00 lenLE data crc8(poly 7) ff`. Job: A4 quality, A6 lattice start, AF energy, BE mode, one A2 per dot row, A1 feed, A6 lattice end, A3 status query.
- Default chunk size is 20 bytes (100 failed on a real phone). Flow control via the 0xAE notification.
- **Stop** (red button while printing): `ble.abort` makes the sender skip the remaining rows but still send feed + end. The unprinted rest is kept as `Prt.rest` ("Print the rest").
- **Print part**: Make > preview > Part: From/To sliders snap to blank rows so cuts fall between items.
- Printer health: `health.js` estimates paper used from rows printed (roll length setting, 75/90/100% warnings) and shows the raw reply to the A3 status query. Battery and paper-sensor bits are not decoded yet.

## Bluetooth
The chooser is shown once. The picked printer is stored (`localStorage catcam-printer`) and reconnected silently through `navigator.bluetooth.getDevices()` when the browser supports it. Otherwise the chooser only lists devices whose name starts like the last printer (e.g. "PD"). Printer settings has "Show all Bluetooth devices" and "Forget remembered printer".

## Make panel framework (make.js)
`KINDS[name] = { title, html(), build(root, v, opts), init(root), noPreview? }`. `build` returns `{bits, h, canvas?}`. Helpers: `page(h, fn)`, `Prt.textBits/stack/blank`, `field/sel/chk`, `wrapLines`, `rng`, `ditherBitmap`. Inputs persist in localStorage `catcam-make`. `printables.js` draws party/label/planner designs as canvases (`Printables.build(what, options)`).

## Tests
Browser test pages live in `tests/` (each has `<base href="../">` so it loads the app files from the repo root). Serve the repo root (`python3 -m http.server 8801`) and open `http://localhost:8801/tests/<name>.html`, or run headless with Chrome (`--virtual-time-budget`, `--dump-dom`). Many log to a tiny log server (`:8802`) or the console. Useful ones:
- `tests/smoke.html`: opens every Make panel and tries every dropdown option and checkbox; reports exceptions, blank or oversized output.
- `tests/printtest.html`, `maketest.html`, `origamitest.html`, `gifttest.html`, `badgetest.html`: render checks for printables.
- `tests/parttest.html`: stop mid-print, print a part, print the rest (mock printer).
- `tests/bletest.html`: the remembered-printer logic with a fake `navigator.bluetooth`.
- `tests/hwtest.html`, `tests/zextest.html`: Z80 / Game Boy accuracy (zextest runs the long ZEXDOC exerciser and needs real time).
- `tests/gbtest.html`, `gbprint_test.html`, `romtest.html` need your own ROMs in `rom/` (never committed).

## Release checklist
Bump the version in three places: the header label (`>vNN<`) and `?v=NN` on the script tags in `index.html`, and the cache name in `sw.js` (`catcam-vNN`). The service worker is network-first, so updates arrive on a normal reload (reload twice if a phone holds the old version).

## Legal notes
- `spectrum/48.rom` is bundled under Amstrad's permission (see `spectrum/ROM-NOTICE.txt`).
- `vendor/Web437_IBM_VGA_8x16.woff` is CC BY-SA 4.0 (credit and licence in `vendor/`).
- Game ROMs, ANSI/NFO art by other people and test ROMs are never committed (see `.gitignore`).
- Wikipedia card text is CC BY-SA, which is why each card says so. Commons pictures print their credit.

---
# Older notes (feature rounds, in the order they were built)

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

## v8 feature round (2026-11-19)
- **Print tab** (print.js): label printer (type text, size/align/bold/date), calibration page (ruler, grey ramp, solid black, checkerboard, line pattern, current settings), shared printBits() + preview modal.
- **Cam tab** (shots.js): self-timer 3/5/10 s, burst x4, photo-booth strips x3/x4 (preview, print, save frames to album), 3 s clip recorder with frame scrubber + Keep.
- **Fun tab** (fx.js, overlay.js): 22 effects incl. glitch filters (scanlines, RGB split, VHS, neon edges, echo trails, motion ghosts, rainbow trails); frames (simple/rounded/film/polaroid/Game Boy/dotted/hearts/stars), caption + date band, stickers (googly eyes with motion physics, moustache, speech bubble, emoji hats/etc.; they track the face when FaceDetector is available, otherwise drag them).
- **Dithers**: halftone dots, newsprint lines, blue-ish noise (also in colour dither).
- **Album** (album.js): select mode, favourites + filter, print selected (queue), Zip export (own ZIP writer), Share, batch import from camera roll with current look/effect, Install button.
- **Game Boy tab**: APU (4 channels, WebAudio ScriptProcessor, mute button); MBC1/MBC3/MBC5 mappers (synthetic-ROM tested) so other mono GB games run; several stored games + per-game saves; save import/export; colour viewfinder (tints the Camera ROM's viewfinder with the real camera colours by locating the 128x112 image on screen).
Tests: featest.html, gbfeat.html, mbctest.html, audiotest.html (serve with python3 -m http.server 8799; Chrome headless).
Not verified on a real phone/printer: touch UI, real camera, face tracking, audio quality/latency, real BLE printing.
