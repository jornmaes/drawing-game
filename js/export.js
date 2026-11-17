// Turns canvases into PNG blobs: the plain drawing, the shareable result card and the sticker.
// Knows nothing about scoring: callers pass numbers/text in.
window.DG = window.DG || {};

DG.Export = (function () {
  const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif';
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const C = {
    bg: '#fff4d6', ink: '#2b2118', muted: '#7a6a58', accent: '#ff5a5f', dots: 'rgba(43,33,24,0.07)',
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
  }

  // The drawing on white (transparent PNGs look broken in many galleries); the sticker stays transparent.
  function drawingPng(drawCanvas) {
    const c = makeCanvas(drawCanvas.width, drawCanvas.height);
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(drawCanvas, 0, 0);
    return toBlob(c);
  }

  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }

  // A white tile with a chunky border + offset shadow (same look as the game UI), with `img` inside.
  function tile(x, img, cx, cy, size, angle) {
    x.save();
    x.translate(cx, cy);
    x.rotate((angle * Math.PI) / 180);
    const h = size / 2, r = 36, border = 7;
    x.fillStyle = C.ink;
    roundRect(x, -h + 10, -h + 10, size, size, r); // shadow
    x.fill();
    roundRect(x, -h, -h, size, size, r);
    x.fill();
    x.fillStyle = '#fff';
    roundRect(x, -h + border, -h + border, size - 2 * border, size - 2 * border, r - border);
    x.fill();
    x.save();
    x.clip();
    x.drawImage(img, -h + border, -h + border, size - 2 * border, size - 2 * border);
    x.restore();
    x.restore();
  }

  function wrapLines(x, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (x.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  // 1080x1350 portrait card: title, reference vs drawing, big score, verdict.
  // opts: { refCanvas, drawCanvas, refName, score (number|null), badge, verdict }
  function resultCard(opts) {
    const W = 1080, H = 1350;
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');

    // background + dot grid
    x.fillStyle = C.bg;
    x.fillRect(0, 0, W, H);
    x.fillStyle = C.dots;
    for (let py = 20; py < H; py += 36) for (let px = 20; px < W; px += 36) {
      x.beginPath(); x.arc(px, py, 3, 0, Math.PI * 2); x.fill();
    }

    // title
    x.save();
    x.translate(W / 2, 120);
    x.rotate(-0.035);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `900 104px ${FONT}`;
    const t1 = 'Copy ', t2 = 'That!';
    const w1 = x.measureText(t1).width, w2 = x.measureText(t2).width;
    x.textAlign = 'left';
    x.fillStyle = C.ink;
    x.fillText(t1, -(w1 + w2) / 2, 0);
    x.fillStyle = C.accent;
    x.fillText(t2, -(w1 + w2) / 2 + w1, 0);
    x.restore();

    // tiles + labels
    const size = 450, gap = 50, top = 300;
    const cxL = W / 2 - gap / 2 - size / 2, cxR = W / 2 + gap / 2 + size / 2;
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.fillStyle = C.muted;
    x.font = `800 38px ${FONT}`;
    x.fillText(opts.refName ? `The ${opts.refName.toLowerCase()}` : 'The original', cxL, top - 24);
    x.fillText('My copy', cxR, top - 24);
    tile(x, opts.refCanvas, cxL, top + size / 2, size, -2);
    tile(x, opts.drawCanvas, cxR, top + size / 2, size, 1.5);

    // score + badge
    const scoreY = top + size + 265;
    const scoreText = opts.score == null ? '??%' : `${opts.score}%`;
    x.font = `900 190px ${FONT}`;
    const sw = x.measureText(scoreText).width;
    x.font = `150px ${EMOJI_FONT}`;
    const bw = opts.badge ? x.measureText(opts.badge).width + 30 : 0;
    const startX = W / 2 - (sw + bw) / 2;
    x.textAlign = 'left';
    x.fillStyle = C.accent;
    x.font = `900 190px ${FONT}`;
    x.fillText(scoreText, startX, scoreY);
    if (opts.badge) {
      x.font = `150px ${EMOJI_FONT}`;
      x.fillText(opts.badge, startX + sw + 30, scoreY - 12);
    }
    x.textAlign = 'center';
    x.fillStyle = C.muted;
    x.font = `800 36px ${FONT}`;
    x.fillText('SIMILARITY', W / 2, scoreY - 180);

    // verdict: shrink the font until it fits in 2 lines (there's room for 2 above the footer)
    x.fillStyle = C.ink;
    let fs = 58, lines;
    for (; fs >= 34; fs -= 6) {
      x.font = `900 ${fs}px ${FONT}`;
      lines = wrapLines(x, opts.verdict || '', W - 140);
      if (lines.length <= 2) break;
    }
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')]; // last resort: very long line 2
    lines.forEach((line, i) => x.fillText(line, W / 2, scoreY + 100 + i * fs * 1.18, W - 100));

    // footer
    x.fillStyle = C.muted;
    x.font = `700 32px ${FONT}`;
    x.fillText('Can you do better? ✏️ Copy That!', W / 2, H - 50);

    return toBlob(c);
  }

  // ---------- sticker ----------
  DG.STICKER = {
    SIZE: 512,          // output is SIZE x SIZE, transparent (a common sticker size)
    OUTLINE: 14,        // white border thickness in output px
    SHADOW_BLUR: 10,
    SHADOW_Y: 4,
    SHADOW_COLOR: 'rgba(0, 0, 0, 0.28)',
    MARGIN: 10,         // extra room around outline + shadow
  };

  function alphaBounds(canvas) {
    const { width: w, height: h } = canvas;
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Die-cut sticker: crop to the drawing, thick white outline, soft shadow, transparent square.
  // Returns { canvas, blob: Promise<Blob> } or null for an empty drawing.
  function sticker(drawCanvas) {
    const S = DG.STICKER;
    const box = alphaBounds(drawCanvas);
    if (!box) return null;
    const N = S.SIZE;

    // 1) the drawing, cropped and scaled to fit inside the margins (outline + shadow room)
    const room = S.OUTLINE + S.SHADOW_BLUR + S.SHADOW_Y + S.MARGIN;
    const scale = (N - 2 * room) / Math.max(box.w, box.h);
    const dw = box.w * scale, dh = box.h * scale;
    const dx = (N - dw) / 2, dy = (N - dh) / 2 - S.SHADOW_Y / 2;
    const art = makeCanvas(N, N);
    const ax = art.getContext('2d');
    ax.imageSmoothingQuality = 'high';
    ax.drawImage(drawCanvas, box.x, box.y, box.w, box.h, dx, dy, dw, dh);

    // 2) white silhouette of the drawing
    const sil = makeCanvas(N, N);
    const sx = sil.getContext('2d');
    sx.drawImage(art, 0, 0);
    sx.globalCompositeOperation = 'source-in';
    sx.fillStyle = '#fff';
    sx.fillRect(0, 0, N, N);

    // 3) thick outline = the silhouette stamped in rings around itself (a cheap dilation that
    //    works in every browser, unlike ctx.filter which Safari has only recently supported)
    const outline = makeCanvas(N, N);
    const ox = outline.getContext('2d');
    const R = S.OUTLINE;
    for (const r of [R, R * 0.7, R * 0.4]) {
      const steps = Math.max(12, Math.ceil(r * 2.4));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ox.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    ox.drawImage(sil, 0, 0);

    // 4) compose: shadowed outline, then the drawing on top
    const out = makeCanvas(N, N);
    const x = out.getContext('2d');
    x.save();
    x.shadowColor = S.SHADOW_COLOR;
    x.shadowBlur = S.SHADOW_BLUR;
    x.shadowOffsetY = S.SHADOW_Y;
    x.drawImage(outline, 0, 0);
    x.restore();
    x.drawImage(art, 0, 0);

    return { canvas: out, blob: toBlob(out) };
  }

  return { drawingPng, resultCard, sticker, toBlob };
})();
