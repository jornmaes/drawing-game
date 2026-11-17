// Drawing input + tool settings. Records each stroke as data and draws it live.
// Pointer Events cover mouse, touch and pen with one code path.
window.DG = window.DG || {};

DG.PALETTE = [
  { name: 'Black',  value: '#222222' },
  { name: 'White',  value: '#ffffff' },
  { name: 'Red',    value: '#e53935' },
  { name: 'Orange', value: '#fb8c00' },
  { name: 'Yellow', value: '#fdd835' },
  { name: 'Tan',    value: '#f2c48d' },
  { name: 'Brown',  value: '#8d5524' },
  { name: 'Green',  value: '#43a047' },
  { name: 'Blue',   value: '#1e88e5' },
  { name: 'Purple', value: '#8e24aa' },
  { name: 'Pink',   value: '#f06292' },
];

DG.BRUSH_SIZES = [
  { name: 'Small',  value: 5 },
  { name: 'Medium', value: 12 },
  { name: 'Large',  value: 26 },
];

DG.Draw = (function () {
  const settings = {
    tool: 'brush',
    color: DG.PALETTE[0].value,
    size: DG.BRUSH_SIZES[1].value,
  };

  let canvas, ctx, onStrokeEnd;
  let current = null;        // stroke being drawn
  let activePointer = null;  // ignore extra fingers while one is drawing
  let roundStart = performance.now();
  let enabled = true;

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * DG.SIZE;
    const y = ((e.clientY - r.top) / r.height) * DG.SIZE;
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      t: Math.round(performance.now() - roundStart),
    };
  }

  function addPoint(p) {
    const pts = current.points;
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) return; // skip jitter
    pts.push(p);
    DG.Strokes.drawPoint(ctx, current, pts.length - 1);
  }

  function onDown(e) {
    if (!enabled || activePointer !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    activePointer = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not fatal */ }
    const p = toLogical(e);
    if (settings.tool === 'fill') {
      // A fill is a one-point "stroke": apply it and finish immediately.
      const stroke = { tool: 'fill', color: settings.color, size: 0, points: [p] };
      DG.Strokes.drawStroke(ctx, stroke);
      onStrokeEnd(stroke);
      activePointer = null;
      return;
    }
    current = { tool: settings.tool, color: settings.color, size: settings.size, points: [] };
    addPoint(p);
  }

  function onMove(e) {
    if (e.pointerId !== activePointer || !current) return;
    e.preventDefault();
    // Coalesced events give the full-rate pointer path (much smoother lines on phones).
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) addPoint(toLogical(ev));
  }

  function onUp(e) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (current && current.points.length) onStrokeEnd(current);
    current = null;
  }

  return {
    settings,

    init(canvasEl, context, opts) {
      canvas = canvasEl;
      ctx = context;
      onStrokeEnd = opts.onStrokeEnd;
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    // Start a fresh round: timestamps restart from 0.
    reset() {
      current = null;
      activePointer = null;
      roundStart = performance.now();
    },

    setEnabled(on) { enabled = on; },

    // ms since the round started (used to timestamp "clear" entries)
    now() { return Math.round(performance.now() - roundStart); },

    setTool(tool) {
      settings.tool = tool;
      canvas.dataset.tool = tool;
    },
  };
})();
