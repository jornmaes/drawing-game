// Game flow + UI wiring.
// Game flow + UI wiring: drawing -> replaying -> result -> next round.
window.DG = window.DG || {};

(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  const state = {
    phase: 'drawing',
    ref: null,
    deck: [],
    strokes: [],
    redo: [],     // strokes taken off by Undo, restorable with Redo
    timer: { enabled: false, endsAt: 0, handle: 0 },
    replay: null, // controller for the running replay
    drawTimeMs: 0,
    result: null, // { score, raw, shape, color, empty, verdict: {badge, line}, ... }
    exports: {},  // PNG blob promises, made as soon as the result is known
  };
  const DEBUG = params.has('debug');
  DG.state = state; // handy for poking around in the console

  // Canvases use logical 512x512 units; the backing store is 2x for sharpness.
  function setupCanvas(canvas) {
    canvas.width = canvas.height = DG.SIZE * DG.SCALE;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(DG.SCALE, 0, 0, DG.SCALE, 0, 0);
    return ctx;
  }
  const refCtx = setupCanvas($('ref-canvas'));
  const drawCtx = setupCanvas($('draw-canvas'));

  DG.Draw.init($('draw-canvas'), drawCtx, {
    onStrokeEnd(stroke) {
      state.strokes.push(stroke);
      state.redo = []; // a new action invalidates the redo history
      updateEditButtons();
    },
  });

  // ---------- undo / redo / clear ----------
  // Is anything visible right now? (i.e. at least one drawing stroke after the last clear)
  function hasVisibleStrokes() {
    for (let i = state.strokes.length - 1; i >= 0; i--) {
      if (state.strokes[i].tool === 'clear') return false;
      if (state.strokes[i].tool !== 'eraser') return true;
    }
    return false;
  }

  function updateEditButtons() {
    $('btn-undo').disabled = state.strokes.length === 0;
    $('btn-redo').disabled = state.redo.length === 0;
    $('btn-clear').disabled = !hasVisibleStrokes();
    $('btn-done').disabled = !hasVisibleStrokes();
  }

  function undo() {
    if (!state.strokes.length) return;
    state.redo.push(state.strokes.pop());
    DG.Strokes.renderAll(state.strokes, drawCtx);
    updateEditButtons();
  }

  function redo() {
    if (!state.redo.length) return;
    const stroke = state.redo.pop();
    state.strokes.push(stroke);
    DG.Strokes.drawStroke(drawCtx, stroke); // appending, so drawing on top == full re-render
    updateEditButtons();
  }

  function clearDrawing() {
    if (!hasVisibleStrokes()) return;
    // Recorded as a step (not a wipe of the list) so Clear itself can be undone.
    const stroke = { tool: 'clear', color: null, size: 0, points: [{ x: 0, y: 0, t: DG.Draw.now() }] };
    state.strokes.push(stroke);
    state.redo = [];
    DG.Strokes.drawStroke(drawCtx, stroke);
    updateEditButtons();
  }

  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-clear').addEventListener('click', clearDrawing);

  // ---------- tools ----------
  const toolButtons = Array.from(document.querySelectorAll('.tool-btn[data-tool]'));
  function selectTool(tool) {
    DG.Draw.setTool(tool);
    toolButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tool === tool)));
  }
  toolButtons.forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool)));

  document.addEventListener('keydown', (e) => {
    if (state.phase !== 'drawing' || e.target.closest('input, textarea')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const keyTool = { b: 'brush', e: 'eraser', f: 'fill' }[e.key.toLowerCase()];
    if (keyTool) selectTool(keyTool);
  });

  // ---------- toolbar ----------
  function buildRadioGroup(container, items, makeButton, onPick) {
    const buttons = items.map((item) => {
      const b = makeButton(item);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', item.name);
      b.title = item.name;
      b.addEventListener('click', () => {
        buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        onPick(item);
      });
      container.appendChild(b);
      return b;
    });
    return buttons;
  }

  function refreshSizeDots() {
    document.querySelectorAll('.size-btn .dot').forEach((d) => d.style.setProperty('--dot', DG.Draw.settings.color));
  }

  function setColor(value) {
    DG.Draw.settings.color = value;
    refreshSizeDots();
    if (DG.Draw.settings.tool === 'eraser') selectTool('brush'); // picking a colour means "I want to paint"
  }

  const swatches = buildRadioGroup($('palette'), DG.PALETTE, (c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c.value;
    b.setAttribute('aria-checked', String(c.value === DG.Draw.settings.color));
    return b;
  }, (c) => {
    customSwatch.setAttribute('aria-checked', 'false');
    setColor(c.value);
  });

  // "Any colour" swatch: a real <input type="color"> stretched invisibly over a rainbow circle,
  // so tapping it opens the native colour picker on desktop, iOS and Android.
  const customSwatch = document.createElement('label');
  customSwatch.className = 'swatch swatch-custom';
  customSwatch.title = 'Pick any colour';
  customSwatch.setAttribute('role', 'radio');
  customSwatch.setAttribute('aria-checked', 'false');
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.value = '#00bfa5';
  customInput.setAttribute('aria-label', 'Pick any colour');
  customSwatch.appendChild(customInput);
  $('palette').appendChild(customSwatch);
  function useCustomColor() {
    swatches.forEach((x) => x.setAttribute('aria-checked', 'false'));
    customSwatch.setAttribute('aria-checked', 'true');
    customSwatch.style.setProperty('--custom', customInput.value);
    setColor(customInput.value);
  }
  customInput.addEventListener('input', useCustomColor);
  customInput.addEventListener('change', useCustomColor);

  buildRadioGroup($('sizes'), DG.BRUSH_SIZES, (s) => {
    const b = document.createElement('button');
    b.className = 'size-btn';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const px = Math.max(4, Math.min(24, s.value * 0.85)); // on-screen preview size
    dot.style.width = dot.style.height = px + 'px';
    b.appendChild(dot);
    b.setAttribute('aria-checked', String(s.value === DG.Draw.settings.size));
    return b;
  }, (s) => { DG.Draw.settings.size = s.value; });
  refreshSizeDots();

  // ---------- small UI helpers ----------
  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  // localStorage can throw (private mode, blocked storage), so wrap it.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } },
  };

  // ---------- timer (optional) ----------
  const TIMER_MS = 60 * 1000;

  function stopTimer() {
    clearInterval(state.timer.handle);
    state.timer.handle = 0;
  }

  function startTimer() {
    stopTimer();
    const pill = $('timer-pill');
    if (!state.timer.enabled) { pill.hidden = true; return; }
    state.timer.endsAt = performance.now() + TIMER_MS;
    pill.hidden = false;
    tickTimer();
    state.timer.handle = setInterval(tickTimer, 200);
  }

  function tickTimer() {
    const left = Math.max(0, state.timer.endsAt - performance.now());
    const pill = $('timer-pill');
    pill.textContent = formatTime(left);
    pill.classList.toggle('urgent', left <= 10000);
    if (left <= 0) {
      stopTimer();
      if (hasVisibleStrokes()) {
        toast("⏱ Time's up! Pencils down!");
        finishDrawing();
      } else {
        toast("⏱ Time's up… and the canvas is empty. Here's a new one!");
        startRound();
      }
    }
  }

  state.timer.enabled = store.get('dg.timer') === '1';
  $('timer-toggle').checked = state.timer.enabled;
  $('timer-toggle').addEventListener('change', (e) => {
    state.timer.enabled = e.target.checked;
    store.set('dg.timer', state.timer.enabled ? '1' : '0');
    if (state.phase === 'drawing') startTimer(); // turning it on mid-round starts a fresh 60s
  });

  // ---------- game flow ----------
  function setPhase(phase) {
    state.phase = phase;
    document.body.dataset.phase = phase;
    DG.Draw.setEnabled(phase === 'drawing');
  }

  // Shuffled deck, refilled when empty, never repeating the previous ref back-to-back.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function nextRef() {
    if (state.deck.length === 0) {
      state.deck = shuffle(DG.REFERENCES.slice());
      if (state.ref && state.deck.length > 1 && state.deck[state.deck.length - 1].id === state.ref.id) {
        state.deck.unshift(state.deck.pop());
      }
    }
    return state.deck.pop();
  }

  async function startRound(ref) {
    stopTimer();
    if (state.replay) { state.replay.cancel(); state.replay = null; }
    state.ref = ref || nextRef();
    state.exports = {};
    state.strokes = [];
    state.redo = [];
    DG.Draw.reset();
    DG.Strokes.renderAll(state.strokes, drawCtx);
    updateEditButtons();
    setPhase('drawing');
    $('timer-pill').hidden = true;
    $('ref-name').textContent = state.ref.name;
    try {
      await DG.renderReference(state.ref, refCtx);
    } catch (err) {
      console.error(err);
      $('ref-name').textContent = state.ref.name + ' (failed to load, skipping…)';
      setTimeout(() => startRound(), 800);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    DG.Draw.reset(); // the clock starts once the reference is actually visible
    startTimer();
  }

  // Fake "analysis" lines shown during the replay. Purely for fun.
  const CALC_LINES = [
    'Measuring wobbliness…',
    'Counting pixels by hand…',
    'Squinting really hard…',
    'Consulting a very serious art critic…',
    'Comparing vibes…',
    'Asking a pigeon for its opinion…',
    'Calibrating the potato detector…',
    'Checking for stick figures…',
    'Ignoring that one weird line…',
    'Applying generous rounding…',
    'Holding it at arm\'s length…',
    'Turning it upside down, just in case…',
  ];
  let calcLineTimer = 0;

  function finishDrawing() {
    if (state.phase !== 'drawing' || !hasVisibleStrokes()) return;
    stopTimer();
    state.drawTimeMs = DG.Draw.now();
    setPhase('replaying'); // (also commits a stroke that was still in progress)

    // Score now, while the canvas still shows the finished drawing; reveal it after the replay.
    try {
      state.result = DG.score($('ref-canvas'), $('draw-canvas'));
    } catch (err) {
      // e.g. an image reference loaded from file:// taints the canvas -> getImageData throws
      console.error('Scoring failed:', err);
      state.result = { score: null, empty: false, error: true };
    }
    state.result.verdict = state.result.error
      ? { badge: '🤷', line: 'The judges lost their glasses. (Scoring failed: try running from a local server.)' }
      : DG.pickVerdict(state.result.score, state.result.empty);

    // Rotating status lines in random order.
    const lines = shuffle(CALC_LINES.slice());
    let li = 0;
    $('calc-status').textContent = lines[li];
    clearInterval(calcLineTimer);
    calcLineTimer = setInterval(() => { $('calc-status').textContent = lines[++li % lines.length]; }, 1700);

    const fill = $('progress-fill');
    fill.style.width = '0%';
    state.replay = DG.Strokes.replay(state.strokes, drawCtx, {
      minMs: 10000,
      maxMs: 20000,
      maxGap: 250,
      onProgress(p) {
        // Ease out so it races ahead early and crawls at the end, like every real progress bar.
        const shown = p >= 1 ? 100 : Math.min(99, Math.round((1 - Math.pow(1 - p, 2.2)) * 100));
        fill.style.width = shown + '%';
        fill.parentElement.setAttribute('aria-valuenow', String(shown));
      },
      onDone: showResult,
    });
  }

  function showResult() {
    clearInterval(calcLineTimer);
    state.replay = null;
    setPhase('result');

    const r = state.result;
    const card = document.querySelector('.phase-result');
    card.classList.remove('revealed');
    $('badge').textContent = '';
    $('verdict').textContent = '';
    countUp($('score'), r.score, () => {
      $('badge').textContent = r.verdict.badge;
      $('verdict').textContent = r.verdict.line;
      card.classList.add('revealed');
    });
    if (DEBUG) renderDebug(r);
    prepareExports();

    const drawn = state.strokes.filter((s) => s.tool === 'brush' || s.tool === 'fill').length;
    $('stats').textContent = `Drawn in ${formatTime(state.drawTimeMs)} with ${drawn} stroke${drawn === 1 ? '' : 's'}.`;
    $('btn-again').focus({ preventScroll: true });
    // On phones the result card sits under the canvas: bring it into view.
    document.querySelector('.phase-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- saving ----------
  // Blobs are made up front so the buttons (and later the share sheet) respond instantly.
  function prepareExports() {
    const r = state.result;
    const slug = state.ref.id;
    state.exports = {
      drawing: { name: `copy-that-${slug}.png`, blob: DG.Export.drawingPng($('draw-canvas')) },
      card: {
        name: `copy-that-${slug}-${r.score == null ? 'card' : r.score + 'pct'}.png`,
        blob: DG.Export.resultCard({
          refCanvas: $('ref-canvas'),
          drawCanvas: $('draw-canvas'),
          refName: state.ref.name,
          score: r.score,
          badge: r.verdict.badge,
          verdict: r.verdict.line,
        }),
      },
    };
    const buttons = { drawing: $('btn-dl-drawing'), card: $('btn-dl-card') };
    for (const [key, btn] of Object.entries(buttons)) {
      btn.disabled = true;
      state.exports[key].blob.then(() => { btn.disabled = false; }, (err) => {
        console.error('Export failed:', err);
        btn.title = 'Could not create this image';
      });
    }
  }

  async function downloadExport(key) {
    const e = state.exports[key];
    if (!e) return;
    try {
      DG.Share.download(await e.blob, e.name);
    } catch (err) {
      console.error(err);
      toast('Hmm, could not save that image.');
    }
  }

  $('btn-dl-drawing').addEventListener('click', () => downloadExport('drawing'));
  $('btn-dl-card').addEventListener('click', () => downloadExport('card'));

  // Animate 0 -> target with an ease-out, then call done().
  function countUp(el, target, done) {
    if (target == null) { el.textContent = '??%'; done(); return; }
    const ms = 600 + target * 12; // higher scores take a little longer: more suspense
    const t0 = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - t0) / ms);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + '%';
      if (p < 1) requestAnimationFrame(frame);
      else done();
    }
    requestAnimationFrame(frame);
  }

  // ?debug=1: show the 64x64 grids/masks and the sub-scores, for tuning DG.SCORING.
  function renderDebug(r) {
    const box = $('debug');
    box.hidden = false;
    box.innerHTML = '';
    if (!r.debug) { box.textContent = r.empty ? 'empty drawing' : 'no debug data'; return; }
    const { refGrid, drawGrid, inkA, inkB, N } = r.debug;
    const tile = (label, paint) => {
      const fig = document.createElement('figure');
      const c = document.createElement('canvas');
      c.width = c.height = N;
      paint(c.getContext('2d'));
      fig.appendChild(c);
      const cap = document.createElement('figcaption');
      cap.textContent = label;
      fig.appendChild(cap);
      box.appendChild(fig);
    };
    tile('ref', (x) => x.drawImage(refGrid, 0, 0));
    tile('you', (x) => x.drawImage(drawGrid, 0, 0));
    tile('masks', (x) => {
      // teal = both, red = only theirs (missed), blue = only yours (extra)
      const img = x.createImageData(N, N);
      for (let p = 0; p < N * N; p++) {
        const a = inkA[p], b = inkB[p], i = p * 4;
        const c = a && b ? [59, 183, 165] : a ? [229, 57, 53] : b ? [30, 79, 216] : [255, 255, 255];
        img.data.set([...c, 255], i);
      }
      x.putImageData(img, 0, 0);
    });
    const f = (v) => (v == null ? '–' : v.toFixed(2));
    const pre = document.createElement('pre');
    pre.textContent =
      `score ${r.score}  raw ${f(r.raw)}
` +
      `shape ${f(r.shape)} (filled ${f(r.kFilled)}, raw ${f(r.kRaw)})
` +
      `colour ${f(r.color)}  size× ${f(r.sizeFactor)}
` +
      `precision ${f(r.precision)}  recall ${f(r.recall)}`;
    box.appendChild(pre);
  }

  $('btn-done').addEventListener('click', finishDrawing);
  $('btn-skip').addEventListener('click', () => startRound());
  $('btn-skip-replay').addEventListener('click', () => state.replay && state.replay.skip());
  $('btn-again').addEventListener('click', () => startRound());

  // ?ref=<id> forces a specific reference (debug).
  const forced = DG.REFERENCES.find((r) => r.id === params.get('ref'));
  startRound(forced);
})();
