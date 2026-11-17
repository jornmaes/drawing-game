// Stroke data model + rendering. Live drawing, undo/redraw and replay all render through here,
// so a stroke looks identical every time it is drawn.
//
// Stroke: { tool: 'brush'|'eraser'|'fill'|'clear', color, size, points: [{x, y, t}] }
// Coordinates and size are in logical units (0..DG.SIZE); t = ms since round start.
window.DG = window.DG || {};

DG.Strokes = (function () {
  function applyStyle(ctx, stroke) {
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = stroke.color || '#000';
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // Draw the part of a stroke that point i adds: a dot for the first point, a segment after that.
  function drawPoint(ctx, stroke, i) {
    if (stroke.tool === 'fill' || stroke.tool === 'clear') { drawStroke(ctx, stroke); return; }
    const p = stroke.points[i];
    ctx.save();
    applyStyle(ctx, stroke);
    if (i === 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const q = stroke.points[i - 1];
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStroke(ctx, stroke) {
    if (stroke.tool === 'clear') {
      ctx.clearRect(0, 0, DG.SIZE, DG.SIZE);
      return;
    }
    if (!stroke.points.length) return;
    if (stroke.tool === 'fill') {
      DG.floodFill(ctx, stroke.points[0].x, stroke.points[0].y, stroke.color);
      return;
    }
    ctx.save();
    applyStyle(ctx, stroke);
    const pts = stroke.points;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Redraw everything from data: the canvas is never the source of truth.
  function renderAll(strokes, ctx) {
    ctx.clearRect(0, 0, DG.SIZE, DG.SIZE);
    for (const s of strokes) drawStroke(ctx, s);
  }

  return { drawPoint, drawStroke, renderAll };
})();
