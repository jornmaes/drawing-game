// Reference images: the list, plus rendering one onto a canvas.
// To add one, append to DG.REFERENCES (see CLAUDE.md). Image refs need a local server.
window.DG = window.DG || {};

DG.SIZE = 512;   // logical canvas size; all drawing/scoring uses these units
DG.SCALE = 2;    // backing store = SIZE * SCALE (1024) for sharpness

DG.REFERENCES = [
  { id: 'apple',      name: 'Apple',      type: 'emoji', value: '🍎' },
  { id: 'banana',     name: 'Banana',     type: 'emoji', value: '🍌' },
  { id: 'pizza',      name: 'Pizza',      type: 'emoji', value: '🍕' },
  { id: 'donut',      name: 'Donut',      type: 'emoji', value: '🍩' },
  { id: 'watermelon', name: 'Watermelon', type: 'emoji', value: '🍉' },
  { id: 'avocado',    name: 'Avocado',    type: 'emoji', value: '🥑' },
  { id: 'icecream',   name: 'Ice cream',  type: 'emoji', value: '🍦' },
  { id: 'mushroom',   name: 'Mushroom',   type: 'emoji', value: '🍄' },
  { id: 'cactus',     name: 'Cactus',     type: 'emoji', value: '🌵' },
  { id: 'clover',     name: 'Clover',     type: 'emoji', value: '🍀' },
  { id: 'star',       name: 'Star',       type: 'emoji', value: '⭐' },
  { id: 'heart',      name: 'Heart',      type: 'emoji', value: '❤️' },
  { id: 'moon',       name: 'Moon',       type: 'emoji', value: '🌙' },
  { id: 'sun',        name: 'Sun',        type: 'emoji', value: '☀️' },
  { id: 'fire',       name: 'Fire',       type: 'emoji', value: '🔥' },
  { id: 'balloon',    name: 'Balloon',    type: 'emoji', value: '🎈' },
  { id: 'fish',       name: 'Fish',       type: 'emoji', value: '🐟' },
  { id: 'frog',       name: 'Frog',       type: 'emoji', value: '🐸' },
  { id: 'octopus',    name: 'Octopus',    type: 'emoji', value: '🐙' },
  { id: 'ghost',      name: 'Ghost',      type: 'emoji', value: '👻' },
  { id: 'poop',       name: 'Poop',       type: 'emoji', value: '💩' },
  { id: 'football',   name: 'Ball',       type: 'emoji', value: '⚽' },
  // { id: 'cat', name: 'Cat', type: 'image', src: 'images/cat.png' },
];

DG.REF_PADDING = 0.12; // fraction of canvas left empty around the reference

(function () {
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

// Load an image ref once and cache the promise.
const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load ' + src));
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

// Draw the raw source (emoji or image) onto a scratch canvas of `px` pixels.
async function rasterizeSource(ref, px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  if (ref.type === 'emoji') {
    ctx.font = `${Math.round(px * 0.7)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ref.value, px / 2, px / 2);
  } else if (ref.type === 'image') {
    const img = await loadImage(ref.src);
    const s = Math.min(px / img.width, px / img.height);
    ctx.drawImage(img, (px - img.width * s) / 2, (px - img.height * s) / 2, img.width * s, img.height * s);
    if (ref.keepBackground !== true) knockOutWhiteBackground(ctx, px);
  } else {
    throw new Error('Unknown reference type: ' + ref.type);
  }
  return c;
}

// Images with a white (non-transparent) background: make near-white pixels that touch the border
// transparent, so only the subject counts as "ink" for scoring. White *inside* the subject is kept.
function knockOutWhiteBackground(ctx, n) {
  const img = ctx.getImageData(0, 0, n, n);
  const d = img.data;
  const isBg = (p) => {
    const i = p * 4;
    return d[i + 3] < 16 || (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235);
  };
  const seen = new Uint8Array(n * n);
  const stack = [];
  const seed = (p) => { if (!seen[p] && isBg(p)) { seen[p] = 1; stack.push(p); } };
  for (let i = 0; i < n; i++) { seed(i); seed((n - 1) * n + i); seed(i * n); seed(i * n + n - 1); }
  while (stack.length) {
    const p = stack.pop(), x = p % n;
    d[p * 4 + 3] = 0;
    if (x > 0) seed(p - 1);
    if (x < n - 1) seed(p + 1);
    if (p >= n) seed(p - n);
    if (p < n * (n - 1)) seed(p + n);
  }
  ctx.putImageData(img, 0, 0);
}

// Bounding box of non-transparent, non-white pixels (emoji glyphs are never perfectly centered).
function contentBounds(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const isInk = d[i + 3] > 16 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245);
      if (isInk) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Render `ref` centered and scaled to fit (with padding) onto ctx, in logical units (0..DG.SIZE).
// The canvas stays transparent outside the reference; the white background is CSS.
DG.renderReference = async function (ref, ctx) {
  const size = DG.SIZE;
  const src = await rasterizeSource(ref, size * DG.SCALE);
  const box = contentBounds(src) || { x: 0, y: 0, w: src.width, h: src.height };
  const inner = size * (1 - 2 * DG.REF_PADDING);
  const s = Math.min(inner / box.w, inner / box.h);
  const dw = box.w * s, dh = box.h * s;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, box.x, box.y, box.w, box.h, (size - dw) / 2, (size - dh) / 2, dw, dh);
};
})();
