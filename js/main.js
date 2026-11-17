// Game flow + UI wiring.
// Step 3: drawing tools (brush, eraser, fill), undo/clear; Skip picks another reference.
window.DG = window.DG || {};

(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  const state = {
    phase: 'drawing',
    ref: null,
    deck: [],
    strokes: [],
  };
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
      updateEditButtons();
    },
  });

  // ---------- undo / clear ----------
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
    $('btn-clear').disabled = !hasVisibleStrokes();
  }

  function undo() {
    if (!state.strokes.length) return;
    state.strokes.pop();
    DG.Strokes.renderAll(state.strokes, drawCtx);
    updateEditButtons();
  }

  function clearDrawing() {
    if (!hasVisibleStrokes()) return;
    // Recorded as a step (not a wipe of the list) so Clear itself can be undone.
    const stroke = { tool: 'clear', color: null, size: 0, points: [{ x: 0, y: 0, t: DG.Draw.now() }] };
    state.strokes.push(stroke);
    DG.Strokes.drawStroke(drawCtx, stroke);
    updateEditButtons();
  }

  $('btn-undo').addEventListener('click', undo);
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
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

  buildRadioGroup($('palette'), DG.PALETTE, (c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c.value;
    b.setAttribute('aria-checked', String(c.value === DG.Draw.settings.color));
    return b;
  }, (c) => {
    DG.Draw.settings.color = c.value;
    refreshSizeDots();
    if (DG.Draw.settings.tool === 'eraser') selectTool('brush'); // picking a colour means "I want to paint"
  });

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

  // ---------- game flow ----------
  function setPhase(phase) {
    state.phase = phase;
    document.body.dataset.phase = phase;
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
    state.ref = ref || nextRef();
    state.strokes = [];
    DG.Draw.reset();
    DG.Strokes.renderAll(state.strokes, drawCtx);
    updateEditButtons();
    $('ref-name').textContent = state.ref.name;
    try {
      await DG.renderReference(state.ref, refCtx);
    } catch (err) {
      console.error(err);
      $('ref-name').textContent = state.ref.name + ' (failed to load, skipping…)';
      setTimeout(() => startRound(), 800);
      return;
    }
    setPhase('drawing');
  }

  $('btn-skip').addEventListener('click', () => startRound());

  // ?ref=<id> forces a specific reference (debug).
  const forced = DG.REFERENCES.find((r) => r.id === params.get('ref'));
  startRound(forced);
})();
