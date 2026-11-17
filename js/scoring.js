// Similarity scoring: "forgiving silhouette + colour" at low resolution.
// Pure functions of two canvases; knows nothing about the UI. Tweak the knobs in DG.SCORING.
//
// Both canvases are TRANSPARENT layers, so "ink" = painted pixels (alpha), and colours are
// compared as they look on white.
//
// Pipeline:
//   1. shrink both canvases to WORK px (good-quality halving)
//   2. (ALIGN_TO_BBOX) crop each to its ink bounding box and fit it into a SIZE x SIZE grid,
//      so a drawing that's a bit too small or off-centre isn't punished
//   3. ink masks
//   4. shape  = chance-corrected agreement of the masks (Cohen's kappa), tolerant by DILATE cells,
//               averaged over the raw masks and the masks with enclosed holes filled.
//               -> filling the whole canvas scores ~0; a closed outline gets about half the shape credit
//   5. colour = how close your colours are to theirs, over their ink (uncovered parts count as wrong)
//   6. raw = sizeFactor * shape^SHAPE_EXP * (COLOR_BASE + (1-COLOR_BASE)*colour)
//   7. fun curve: score = 100 * clamp((raw-FLOOR)/(CEIL-FLOOR))^GAMMA
window.DG = window.DG || {};

DG.SCORING = {
  WORK: 256,             // working resolution before the grid step
  SIZE: 64,              // comparison grid (64x64)
  ALIGN_TO_BBOX: true,   // compare shapes regardless of position/size
  INK_ALPHA: 77,         // alpha (0-255) above which a grid cell counts as ink (~30%)
  HOLES_WEIGHT: 0.5,     // shape = mix of kappa(holes filled) and kappa(raw ink); 0 = raw only
  DILATE: 1,             // shape tolerance in grid cells (1 cell ~ 8px on the 512 canvas)
  RAW_DILATE: 0,         // tolerance for the raw-ink kappa (0 = strict: scribbles don't "cover" things)
  SMALL_DRAWING: 0.55,   // drawings smaller than this fraction of the reference's size get penalised
  COLOR_FREE: 90,        // colour distance that still counts as a perfect match (palette can't do shading)
  COLOR_TOLERANCE: 330,  // colour distance at which colour credit drops to 0 (redmean, max ~765)
  SHAPE_EXP: 0.7,        // < 1 = more forgiving about shape
  COLOR_BASE: 0.35,      // share of the score you keep with completely wrong colours
  FLOOR: 0.16,           // raw at/below this -> 0%
  CEIL: 0.90,            // raw at/above this -> 100%
  GAMMA: 0.8,            // < 1 lifts the middle of the range (friendlier scores)
};

DG.score = (function () {
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // Halve repeatedly (good-quality downscale) down to `size`, keeping transparency.
  function shrink(src, size) {
    let cur = src;
    while (cur.width / 2 >= size) {
      const n = makeCanvas(cur.width / 2, cur.height / 2);
      const x = n.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    if (cur.width === size) return cur;
    const out = makeCanvas(size, size);
    const o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(cur, 0, 0, size, size);
    return out;
  }

  function inkBounds(canvas, t) {
    const n = canvas.width;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, n, n).data;
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (d[(y * n + x) * 4 + 3] > t) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Draw `box` of `src` into an N x N transparent grid (via a 2N step for smoother downscaling).
  function toGrid(src, box, N) {
    const big = makeCanvas(N * 2, N * 2);
    const b = big.getContext('2d');
    b.imageSmoothingQuality = 'high';
    const s = Math.min(big.width / box.w, big.height / box.h);
    const dw = box.w * s, dh = box.h * s;
    b.drawImage(src, box.x, box.y, box.w, box.h, (big.width - dw) / 2, (big.height - dh) / 2, dw, dh);
    const out = makeCanvas(N, N);
    const o = out.getContext('2d', { willReadFrequently: true });
    o.imageSmoothingQuality = 'high';
    o.drawImage(big, 0, 0, N, N);
    return out;
  }

  // RGBA grid -> ink mask + colours composited onto white.
  function analyse(canvas, N, t) {
    const d = canvas.getContext('2d').getImageData(0, 0, N, N).data;
    const ink = new Uint8Array(N * N);
    const rgb = new Float32Array(N * N * 3);
    for (let p = 0; p < N * N; p++) {
      const i = p * 4, a = d[i + 3] / 255;
      ink[p] = d[i + 3] > t ? 1 : 0;
      // getImageData is un-premultiplied: composite over white by hand
      rgb[p * 3] = d[i] * a + 255 * (1 - a);
      rgb[p * 3 + 1] = d[i + 1] * a + 255 * (1 - a);
      rgb[p * 3 + 2] = d[i + 2] * a + 255 * (1 - a);
    }
    return { ink, rgb };
  }

  // Mark empty cells not reachable from the border as ink (closed outlines become solid shapes).
  function fillHoles(m, N) {
    const outside = new Uint8Array(N * N);
    const stack = [];
    const seed = (p) => { if (!m[p] && !outside[p]) { outside[p] = 1; stack.push(p); } };
    for (let i = 0; i < N; i++) {
      seed(i); seed((N - 1) * N + i); seed(i * N); seed(i * N + N - 1);
    }
    while (stack.length) {
      const p = stack.pop(), x = p % N, y = (p / N) | 0;
      if (x > 0) seed(p - 1);
      if (x < N - 1) seed(p + 1);
      if (y > 0) seed(p - N);
      if (y < N - 1) seed(p + N);
    }
    const out = new Uint8Array(N * N);
    for (let p = 0; p < N * N; p++) out[p] = outside[p] ? 0 : 1;
    return out;
  }

  function dilate(m, N, r) {
    if (r <= 0) return m;
    const out = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!m[y * N + x]) continue;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= N) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < N) out[yy * N + xx] = 1;
          }
        }
      }
    }
    return out;
  }

  // A cell agrees if it's their ink and you have ink nearby (tolerant), or it's their
  // background and you left it empty (strict, so covering everything doesn't pay off).
  // Kappa then subtracts the agreement you'd get by chance with that much ink.
  function kappa(mA, mB, N, r) {
    const nearB = dilate(mB, N, r), nearA = dilate(mA, N, r);
    const total = N * N;
    let countA = 0, countB = 0, hitA = 0, hitB = 0, agree = 0;
    for (let p = 0; p < total; p++) {
      if (mA[p]) { countA++; if (nearB[p]) { hitA++; agree++; } }
      else if (!mB[p]) agree++;
      if (mB[p]) { countB++; if (nearA[p]) hitB++; }
    }
    const pA = countA / total, pB = countB / total;
    const po = agree / total;
    const pe = pA * pB + (1 - pA) * (1 - pB);
    return {
      k: pe < 1 ? Math.max(0, (po - pe) / (1 - pe)) : 0,
      precision: countB ? hitB / countB : 0,
      recall: countA ? hitA / countA : 0,
    };
  }

  // "Redmean" colour distance: cheap, and much closer to human perception than plain RGB.
  function colorDist(a, p, b, q) {
    const i = p * 3, j = q * 3;
    const rm = (a[i] + b[j]) / 2;
    const dr = a[i] - b[j], dg = a[i + 1] - b[j + 1], db = a[i + 2] - b[j + 2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }

  return function score(refCanvas, drawCanvas, opts) {
    const C = Object.assign({}, DG.SCORING, opts || {});
    const N = C.SIZE, T = C.INK_ALPHA;

    const refSmall = shrink(refCanvas, C.WORK);
    const drawSmall = shrink(drawCanvas, C.WORK);
    const full = { x: 0, y: 0, w: C.WORK, h: C.WORK };
    const refBox = inkBounds(refSmall, T / 4) || full;
    const drawBox = inkBounds(drawSmall, T / 4);

    if (!drawBox) {
      return { score: 0, raw: 0, shape: 0, color: 0, empty: true, debug: null };
    }

    const refGrid = toGrid(refSmall, C.ALIGN_TO_BBOX ? refBox : full, N);
    const drawGrid = toGrid(drawSmall, C.ALIGN_TO_BBOX ? drawBox : full, N);
    const A = analyse(refGrid, N, T);
    const B = analyse(drawGrid, N, T);

    // ---- shape: tolerant agreement, corrected for chance (Cohen's kappa) ----
    const filledA = fillHoles(A.ink, N), filledB = fillHoles(B.ink, N);
    const kFilled = kappa(filledA, filledB, N, C.DILATE);
    const kRaw = kappa(A.ink, B.ink, N, C.RAW_DILATE);
    const shape = C.HOLES_WEIGHT * kFilled.k + (1 - C.HOLES_WEIGHT) * kRaw.k;
    const { precision, recall } = kRaw;

    // Alignment would blow a tiny doodle up to full size, so penalise drawings much smaller than the ref.
    const sizeRatio = Math.max(drawBox.w, drawBox.h) / Math.max(refBox.w, refBox.h);
    const sizeFactor = Math.min(1, sizeRatio / C.SMALL_DRAWING);

    // ---- colour: over their ink, best match among your pixels within 1 cell ----
    // (Your pixels are compared as they look on white, so unpainted spots count as "white".)
    let colorSum = 0, colorN = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const p = y * N + x;
        if (!A.ink[p]) continue;
        let best = Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
            best = Math.min(best, colorDist(A.rgb, p, B.rgb, yy * N + xx));
          }
        }
        colorSum += Math.min(1, Math.max(0, 1 - (best - C.COLOR_FREE) / (C.COLOR_TOLERANCE - C.COLOR_FREE)));
        colorN++;
      }
    }
    const color = colorN ? colorSum / colorN : 0;

    // Multiplicative, so a perfect shape in the wrong colours still loses a lot, and
    // perfect colours on a random shape don't rescue it.
    const raw = sizeFactor * Math.pow(shape, C.SHAPE_EXP) * (C.COLOR_BASE + (1 - C.COLOR_BASE) * color);
    const t = Math.min(1, Math.max(0, (raw - C.FLOOR) / (C.CEIL - C.FLOOR)));
    const final = Math.round(100 * Math.pow(t, C.GAMMA));

    return {
      score: final,
      raw, shape, color, precision, recall, sizeFactor,
      empty: false,
      kFilled: kFilled.k, kRaw: kRaw.k,
      debug: { refGrid, drawGrid, inkA: A.ink, inkB: B.ink, N },
    };
  };
})();
