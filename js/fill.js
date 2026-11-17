// Flood fill ("paint bucket") on a transparent drawing layer.
// Works in device pixels, so it reads the ctx's current scale (logical -> backing store).
window.DG = window.DG || {};

DG.FILL_TOLERANCE = 48; // how different a pixel may be (premultiplied RGBA, 0-255) and still get filled

DG.floodFill = function (ctx, lx, ly, color) {
  const canvas = ctx.canvas;
  const w = canvas.width, h = canvas.height;
  const scale = ctx.getTransform().a || 1;
  const sx = Math.floor(lx * scale), sy = Math.floor(ly * scale);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [fr, fg, fb] = hexToRgb(color);

  // Compare in premultiplied space so "transparent black" and "transparent white" count as the same.
  const s = (sy * w + sx) * 4;
  const sa = d[s + 3] / 255;
  const seed = [d[s] * sa, d[s + 1] * sa, d[s + 2] * sa, d[s + 3]];
  const tol = DG.FILL_TOLERANCE;
  function matches(p) {
    const i = p * 4, a = d[i + 3] / 255;
    return Math.abs(d[i] * a - seed[0]) <= tol &&
           Math.abs(d[i + 1] * a - seed[1]) <= tol &&
           Math.abs(d[i + 2] * a - seed[2]) <= tol &&
           Math.abs(d[i + 3] - seed[3]) <= tol;
  }

  // Already this colour? Nothing to do (avoids filling the whole region again).
  if (d[s + 3] === 255 && d[s] === fr && d[s + 1] === fg && d[s + 2] === fb) return;

  // 1) Scanline fill to build a mask of the region.
  const mask = new Uint8Array(w * h);
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(), x0 = stack.pop();
    let x = x0;
    while (x >= 0 && !mask[y * w + x] && matches(y * w + x)) x--;
    x++;
    let spanUp = false, spanDown = false;
    for (; x < w; x++) {
      const p = y * w + x;
      if (mask[p] || !matches(p)) break;
      mask[p] = 1;
      if (y > 0) {
        const up = p - w;
        if (!spanUp && !mask[up] && matches(up)) { stack.push(x, y - 1); spanUp = true; }
        else if (spanUp && (mask[up] || !matches(up))) spanUp = false;
      }
      if (y < h - 1) {
        const dn = p + w;
        if (!spanDown && !mask[dn] && matches(dn)) { stack.push(x, y + 1); spanDown = true; }
        else if (spanDown && (mask[dn] || !matches(dn))) spanDown = false;
      }
    }
  }

  // 2) Paint the region solid, then grow it 2px *underneath* the neighbouring pixels.
  //    This removes the pale halo you'd otherwise get against anti-aliased line edges.
  const GROW = 2;
  const ring = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -GROW; dy <= GROW; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -GROW; dx <= GROW; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (!mask[q]) ring[q] = 1;
        }
      }
    }
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (mask[p]) {
      d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
    } else if (ring[p]) {
      const a = d[i + 3] / 255; // existing pixel drawn OVER the fill colour
      d[i] = d[i] * a + fr * (1 - a);
      d[i + 1] = d[i + 1] * a + fg * (1 - a);
      d[i + 2] = d[i + 2] * a + fb * (1 - a);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
};
