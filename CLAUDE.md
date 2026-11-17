# Copy That! — draw-the-reference browser game

A silly single-page browser game. The player sees a reference (emoji or simple picture) and copies it on a
canvas. They press Done and watch a sped-up replay of their strokes while "calculating similarity…" runs,
then get a 0–100% score with a funny verdict. The result can be downloaded as a PNG, as a side-by-side
result card, or as a die-cut-style sticker (512×512 transparent PNG with white outline).
Plain HTML/CSS/vanilla JS: no framework, no build step, no backend, no external APIs. Mobile/touch is a
first-class target, since sharing stickers mostly happens on phones.

## Run
- Quick: double-click `index.html`. Emoji categories work; the **Pictures** category is switched off
  automatically (file:// images taint the canvas and break scoring/export).
- Full: `python -m http.server 8000` → http://localhost:8000 (all categories; localhost is a secure context).
- Phone on the same Wi-Fi: run the server, find the PC's IPv4 with `ipconfig`, open `http://<IP>:8000`.
  If it doesn't load, allow Python through Windows Firewall (private networks).
- HTTPS for a phone (needed later for Share/Copy): `npx localtunnel --port 8000` or
  `cloudflared tunnel --url http://localhost:8000`, then open the https URL.
- Debug: `?debug=1` shows scoring grids/masks/sub-scores on the result card. `?ref=<id>` forces a reference.
- Keys: B/E/F brush/eraser/fill, Ctrl+Z / Ctrl+Y undo/redo, Enter = Done (drawing) or Play again (result).

## Files
| File | Job |
|---|---|
| `index.html` | Markup: draw / replay / result panels, toolbar, sticker + category `<dialog>`s; script order matters |
| `css/style.css` | Layout (ref + canvas + side column ≥ 760px, stacked below); panels shown via `body[data-phase]` |
| `js/main.js` | Game state + phase transitions, deck + categories, timer, best score, exports, all button wiring |
| `js/draw.js` | Pointer input, palette (`DG.PALETTE`), brush sizes, tool state, live incremental drawing |
| `js/strokes.js` | Stroke rendering (`drawPoint`, `drawStroke`, `renderAll`) and `replay(strokes, ctx, opts)` |
| `js/fill.js` | Scanline flood fill on the transparent layer (live drawing and replay) |
| `js/references.js` | `DG.CATEGORIES`, `DG.REFERENCES`, `renderReference(ref, ctx)` (crop + centre, white-bg knockout) |
| `js/scoring.js` | `DG.score(refCanvas, drawCanvas)` → `{score, shape, color, …, debug}`; knobs in `DG.SCORING` |
| `js/verdicts.js` | `DG.VERDICTS` score bands (badge + lines) and `DG.pickVerdict(score, empty)` |
| `js/export.js` | `DG.Export`: `drawingPng`, `resultCard` (1080×1350), `sticker` (512×512, knobs in `DG.STICKER`) |
| `js/share.js` | `DG.Share.download(blob, name)` (share sheet + clipboard planned, see step 8) |
| `images/` | Original CC0 SVG illustrations for the Pictures category; sources listed in `images/CREDITS.md` |

## Game flow
`drawing` → (Done / timer hits 0) → `replaying` → `result` → (Play again / Enter) → `drawing`.
- State lives in one object in `main.js` (`phase, ref, deck, categories, strokes, redo, timer, result, exports`).
  `setPhase()` sets `body.dataset.phase`; CSS does the showing/hiding and drawing is disabled outside `drawing`.
- Deck = shuffled copy of the references in the enabled categories; reshuffles when empty, never repeats the
  last ref back-to-back. Skip = next ref. Category choice, timer toggle and best score live in localStorage
  (`dg.categories`, `dg.timer`, `dg.best`), always via the try/catch `store` wrapper.
- The score is computed when Done is pressed (before the replay clears the canvas) and revealed after the
  replay: count-up, then badge + verdict; confetti at ≥ 75% or a new personal best.
- Replay length is clamped to 10–20 s after capping idle gaps at 250 ms; it can be skipped.
- Export blobs are generated as soon as the result is known, so buttons (and a future share sheet) are instant.

## Conventions
- Vanilla JS in classic `<script defer>` files, each attaching to the global `window.DG`; wrap helpers in an
  IIFE. No ES modules (they fail on file://), no npm dependencies, no bundler. Small, single-purpose files.
- **Strokes are data:** `{tool:'brush'|'eraser'|'fill'|'clear', color, size, points:[{x,y,t}]}` in 512×512
  logical units (`t` = ms since round start). The canvas is always re-rendered from `state.strokes`, so undo
  = pop + `renderAll`. Clear is a stroke too (undoable). Never read pixels back as state.
- Canvases: 512×512 logical, 1024×1024 backing store, scaled by CSS. Reference and drawing use the same size.
- **Transparent drawing layer:** the white background is CSS only; the eraser uses `destination-out`.
  Exports: the sticker stays transparent; the drawing PNG and result card are put on white
  (transparent PNGs look broken in many phone galleries).
- Separation: scoring knows nothing about the UI; export gets numbers/text passed in; share.js only handles blobs.
- Input: Pointer Events with `touch-action: none` + `setPointerCapture`; one code path for mouse/touch/pen.
- Respect `prefers-reduced-motion` for any new animation (there's a global override at the end of the CSS).

## Add a reference
Add an entry to a category list in `js/references.js`:
`['pizza', 'Pizza', '🍕']` inside `DG.emojiRefs('food', [...])`, or
`['pic-cat', 'Cat', 'images/cat.svg']` inside `DG.imageRefs('pictures', [...])`.
New category: add `{ id, name, icon }` to `DG.CATEGORIES` plus a matching list (`needsServer: true` for images).
Ids must be unique. Pick simple, bold, mostly-filled shapes. Emoji that default to text style need `️`.
Images: square-ish SVG/PNG, transparent or white background (white is knocked out unless
`keepBackground: true`), copyright-free, credited in `images/CREDITS.md`. Emoji look different per OS;
that's fine, scoring uses what was rendered.

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
A decent real attempt should land at 50–80. Verdict bands, badges and lines live in `js/verdicts.js`.

## Export & sharing
- Sticker: crop to alpha bbox → white silhouette (`source-in`) → dilate by stamping it in rings → soft drop
  shadow → drawing on top → 512×512 transparent PNG. Don't use `ctx.filter` (Safari). Separate drawn pieces
  get separate outlines (no merging into one die-cut shape).
- Planned (step 8): share sheet (`navigator.share({files})` gated by `navigator.canShare`) and Copy image
  (`ClipboardItem` with a Promise blob for Safari). Both need **HTTPS or localhost** and must be called
  directly in a click handler with the pre-made blobs. Desktop Firefox can't share files, so Download stays.
- iOS downloads land in the Files app, not Photos (share sheet → Save Image fixes that once step 8 exists).

## Build log
Each step is one commit; commit after every completed step.
1. ✅ Layout + reference rendering (emoji via `fillText`, cropped + centred)
2. ✅ Brush, palette, sizes, touch drawing (Pointer Events)
3. ✅ Strokes as data: undo, redo, undoable clear, eraser to transparency, fill bucket; 14 colours + custom picker
4. ✅ Game loop: replay with "calculating" card, result screen, Play again, Skip, optional 60 s timer
5. ✅ Scoring (kappa shape + colour, fun curve, `?debug=1`) and verdicts
6. ✅ Download drawing PNG + result card
7. ✅ Sticker export + preview dialog
8. ⏭️ **Skipped for now — next up:** Share sheet + Copy image buttons in the sticker dialog (feature-detected,
   hidden when unsupported), and a "How to use as a sticker" help popup (`js/help.js`, `DG.HELP` data object
   with `lastChecked`; Instagram: send the image in a DM → long-press → Make Sticker, or Stories → Cutouts).
   Test on iPhone Safari + Android Chrome over an HTTPS tunnel.
9. ✅ Polish: 164 emoji in 6 categories + 12 CC0 SVG pictures, category picker, personal best, confetti,
   Enter shortcuts, reduced-motion support, favicon, tighter phone layout, `file://` handling

## Future ideas (not in v1)
- Share sheet / clipboard / sticker help (step 8 above)
- Calibrate scoring on real player drawings (collect a few `?debug=1` numbers per category)
- Merge separate pieces into one die-cut sticker outline (morphological closing before the outline)
- Difficulty levels (easy/medium/hard tags per reference), daily challenge with a seeded reference
- Replay export as GIF/video (needs an encoder or MediaRecorder; heavy, browser quirks)
- Undo history / gallery of past drawings (IndexedDB), PWA/offline install
- Pressure-sensitive pen, zoom/pan, shape tools; rotation-tolerant scoring
- Multiplayer / leaderboards (would need a backend; out of scope for now)

## Testing checklist (no automated tests)
Desktop Chrome + Firefox, iPhone Safari, Android Chrome. Draw with touch; undo/redo/clear/eraser/fill; replay
length; scores in the expected range (`?debug=1`); category picker (and Pictures disabled on file://);
sticker has transparent corners and an even outline; result card text fits; downloads have sensible names.
