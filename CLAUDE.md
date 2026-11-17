# Copy That! — draw-the-reference browser game

A silly single-page browser game. The player sees a reference (emoji or simple image) and copies it on a
canvas. They press Done and watch a sped-up replay of their strokes while "calculating similarity…" runs,
then get a 0–100% score with a funny verdict. The result can be downloaded as a PNG or a side-by-side
result card, turned into a die-cut-style sticker, shared through the phone's share sheet, or copied.
Plain HTML/CSS/vanilla JS: no framework, no build step, no backend, no external APIs. Mobile/touch is a
first-class target, since sharing stickers mostly happens on phones.

## Run
- Quick: double-click `index.html`. This works for emoji references only (no server needed).
- Full: `python -m http.server 8000` → http://localhost:8000. Needed for `/images` references, because
  file:// images taint the canvas and break scoring/export. localhost counts as secure, so Share/Copy work.
- Phone on the same Wi-Fi: run the server, find the PC's IPv4 with `ipconfig`, open `http://<IP>:8000`.
  If it doesn't load, allow Python through Windows Firewall (private networks).
- Share/Copy on a phone need HTTPS (a LAN IP over http is not a secure context). Run
  `npx localtunnel --port 8000` or `cloudflared tunnel --url http://localhost:8000` and open the https URL.
- Debug: add `?debug=1` for scoring masks and sub-scores. `?ref=<id>` forces a specific reference.

## Files
| File | Job |
|---|---|
| `index.html` | Markup for 3 screens (draw / replay / result), toolbar, help `<dialog>`; script order matters |
| `css/style.css` | Layout (side by side ≥ 700px, stacked below); screens shown via `body[data-phase]` |
| `js/main.js` | Game state + phase transitions, timer, deck, button wiring. The only file that touches the DOM broadly |
| `js/draw.js` | Pointer input, current tool/color/size, palette, undo/clear, live incremental drawing |
| `js/strokes.js` | Stroke model, `renderAll(strokes, ctx)`, `replay(strokes, ctx, ms, onProgress, onDone)` |
| `js/fill.js` | Scanline flood fill on the transparent layer (used by both live drawing and replay) |
| `js/references.js` | `DG.REFERENCES` list + `renderReference(ref, ctx, size)` |
| `js/scoring.js` | `DG.score(refCanvas, drawCanvas)` → `{score, shape, color, raw, debug}`; knobs in `DG.SCORING` |
| `js/verdicts.js` | Score bands → verdict strings, plus a special empty-canvas verdict |
| `js/export.js` | Blobs: drawing PNG, result card (1080×1350), sticker (512×512) |
| `js/share.js` | Feature detection + `share(blob)`, `copy(blob)`, `download(blob, name)` |
| `js/help.js` | `DG.HELP` sticker how-to text (iPhone/Android) + popup rendering |
| `images/` | Optional copyright-free reference images |

## Game flow
`drawing` → (Done or timer hits 0) → `replaying` → `result` → (Play again) → `drawing`.
- State lives in one object in `main.js` (`phase, ref, deck, strokes, timer, result, exports`).
  `setPhase()` sets `body.dataset.phase`, and CSS does the showing/hiding.
- The deck is a shuffled copy of `DG.REFERENCES`. It reshuffles when empty and never repeats the last ref. Skip = next ref.
- The timer is optional (toggle, 60 s), and the setting is remembered in localStorage (wrapped in try/catch).
- The score is computed when Done is pressed but revealed after the replay. Replay length is clamped to 10–20 s,
  with idle gaps between strokes capped at 250 ms first. Replay can be skipped.
- Export blobs are generated when the result screen opens, so share/copy run instantly on click.

## Conventions
- Vanilla JS in classic `<script defer>` files, each attaching to the global `window.DG`. No ES modules
  (they fail on file://), no npm dependencies, no bundler. Keep files small and single-purpose.
- **Strokes are data:** `{tool:'brush'|'eraser'|'fill'|'clear', color, size, points:[{x,y,t}]}` in 512×512
  logical units (`t` = ms since round start). The canvas is always re-rendered from `state.strokes`, so undo
  = pop + `renderAll`. Never read pixels back as state.
- Canvases: 512×512 logical, 1024×1024 backing store, scaled by CSS. Reference and drawing use the same size.
- **Transparent drawing layer:** the white background is CSS only. The eraser uses `destination-out`.
  Exports: the sticker stays transparent; the plain drawing PNG and result card are put on white
  (transparent PNGs look broken in many phone galleries).
- Separation: scoring doesn't know about the UI, export doesn't know about scoring (it gets numbers/text
  passed in), and share.js only handles blobs.
- Input uses Pointer Events with `touch-action: none` on the canvas and `setPointerCapture`. No separate
  mouse/touch handlers.

## Add a reference
Append to `DG.REFERENCES` in `js/references.js`:
`{ id:'pizza', name:'Pizza', type:'emoji', value:'🍕' }` or
`{ id:'cat', name:'Cat', type:'image', src:'images/cat.png' }`.
Pick simple, bold, mostly-filled shapes. Images must be copyright-free (note the source in
`images/CREDITS.md`), roughly square, with a transparent or white background. They are drawn
centered with padding. Emoji look different per OS; that's fine, because scoring uses what was rendered.

## Tweak scoring
Pipeline (js/scoring.js): ink = painted alpha on the transparent layers → crop each to its ink bounding
box and fit into a 64×64 grid → **shape** = Cohen's kappa of the ink masks (chance-corrected, so filling
the whole canvas scores ~0), averaged over hole-filled masks (tolerant by `DILATE`) and raw masks (strict)
→ **colour** = closeness over the reference's ink, as seen on white → drawings much smaller than the
reference are penalised → `raw = shape^SHAPE_EXP × (COLOR_BASE + (1-COLOR_BASE) × colour)` →
fun curve `100 × ((raw-FLOOR)/(CEIL-FLOOR))^GAMMA`.
All knobs are in `DG.SCORING`. Too harsh → lower `CEIL`/`GAMMA`/`SHAPE_EXP` or raise `DILATE`.
Wrong colours too forgiving → lower `COLOR_BASE`. Scribbles too high → raise `FLOOR`.
`?debug=1` shows the 64×64 grids, a mask diff (teal both, red missed, blue extra) and sub-scores.
Calibrated on synthetic drawings: exact copy 100, wobbly palette copy ~85–100, plain-colour silhouette
~90, right shape wrong colours ~40, outline only ~30–45, random scribble ~15–40, dot/full fill 0.
A decent real attempt should land at 50–80. Verdicts (bands + badges) live in `js/verdicts.js`.
Image refs with a white background get it knocked out to transparent on load (`keepBackground: true` opts out).

## Export & sharing
- Sticker: crop to alpha bbox + padding → white silhouette (`source-in`) → dilate by stamping it around a
  circle → soft drop shadow → original on top → fit into 512×512 transparent PNG. Don't use `ctx.filter` (Safari).
- Share sheet (`navigator.share({files})`, gated by `navigator.canShare`) and Copy image (`ClipboardItem`
  with a Promise blob for Safari) need **HTTPS or localhost** and must be called directly in a click handler.
- Desktop Firefox can't share files, and clipboard support varies, so Download is always shown. Hide
  unsupported buttons instead of letting them fail.
- iOS downloads land in Files. Tell users to use Share → Save Image for Photos.
- Instagram sticker steps change often. Update `DG.HELP` in `js/help.js` and bump its `lastChecked`.

## Testing checklist (no automated tests)
Desktop Chrome + Firefox, iPhone Safari, Android Chrome. Draw with touch, undo/clear/eraser/fill, replay
length, scores in the expected range (`?debug=1`), sticker has transparent corners and an even outline,
Share/Copy appear only where supported (test the phone over an HTTPS tunnel).
