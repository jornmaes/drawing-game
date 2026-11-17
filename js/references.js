// Reference images: categories, the list, and rendering one onto a canvas.
// To add one, add an entry to a category below (see CLAUDE.md). Image refs need a local server.
window.DG = window.DG || {};

DG.SIZE = 512;   // logical canvas size; all drawing/scoring uses these units
DG.SCALE = 2;    // backing store = SIZE * SCALE (1024) for sharpness

// Players can switch categories on/off. `pictures` holds image files from /images.
DG.CATEGORIES = [
  { id: 'food', name: 'Food', icon: '🍔' },
  { id: 'animals', name: 'Animals', icon: '🐾' },
  { id: 'nature', name: 'Nature & weather', icon: '🌈' },
  { id: 'objects', name: 'Things', icon: '🎁' },
  { id: 'faces', name: 'Faces', icon: '😀' },
  { id: 'symbols', name: 'Symbols', icon: '❤️' },
  { id: 'pictures', name: 'Pictures', icon: '🖼️', needsServer: true },
];

// Compact helpers so the lists stay readable: [id, name, emoji] / [id, name, file in /images].
DG.emojiRefs = (category, list) =>
  list.map(([id, name, value]) => ({ id, name, category, type: 'emoji', value }));
DG.imageRefs = (category, list) =>
  list.map(([id, name, src]) => ({ id, name, category, type: 'image', src }));

DG.REFERENCES = [
  ...DG.emojiRefs('food', [
    ['apple', 'Apple', '🍎'], ['banana', 'Banana', '🍌'], ['pizza', 'Pizza', '🍕'], ['donut', 'Donut', '🍩'],
    ['watermelon', 'Watermelon', '🍉'], ['avocado', 'Avocado', '🥑'], ['icecream', 'Ice cream', '🍦'],
    ['strawberry', 'Strawberry', '🍓'], ['cherries', 'Cherries', '🍒'], ['lemon', 'Lemon', '🍋'],
    ['orange', 'Orange', '🍊'], ['grapes', 'Grapes', '🍇'], ['pear', 'Pear', '🍐'], ['carrot', 'Carrot', '🥕'],
    ['corn', 'Corn', '🌽'], ['broccoli', 'Broccoli', '🥦'], ['burger', 'Burger', '🍔'], ['fries', 'Fries', '🍟'],
    ['hotdog', 'Hot dog', '🌭'], ['cupcake', 'Cupcake', '🧁'], ['cookie', 'Cookie', '🍪'], ['cake', 'Cake', '🍰'],
    ['egg', 'Fried egg', '🍳'], ['cheese', 'Cheese', '🧀'], ['croissant', 'Croissant', '🥐'],
    ['lollipop', 'Lollipop', '🍭'], ['candy', 'Candy', '🍬'], ['pretzel', 'Pretzel', '🥨'],
    ['taco', 'Taco', '🌮'], ['popcorn', 'Popcorn', '🍿'], ['peach', 'Peach', '🍑'],
    ['pineapple', 'Pineapple', '🍍'], ['coconut', 'Coconut', '🥥'], ['kiwi', 'Kiwi', '🥝'],
    ['pepper', 'Chili pepper', '🌶️'],
  ]),
  ...DG.emojiRefs('animals', [
    ['fish', 'Fish', '🐟'], ['tropicalfish', 'Tropical fish', '🐠'], ['frog', 'Frog', '🐸'],
    ['octopus', 'Octopus', '🐙'], ['turtle', 'Turtle', '🐢'], ['cat', 'Cat', '🐱'], ['dog', 'Dog', '🐶'],
    ['pig', 'Pig', '🐷'], ['cow', 'Cow', '🐮'], ['mouse', 'Mouse', '🐭'], ['rabbit', 'Bunny', '🐰'],
    ['fox', 'Fox', '🦊'], ['bear', 'Bear', '🐻'], ['panda', 'Panda', '🐼'], ['koala', 'Koala', '🐨'],
    ['tiger', 'Tiger', '🐯'], ['lion', 'Lion', '🦁'], ['monkey', 'Monkey', '🐵'], ['penguin', 'Penguin', '🐧'],
    ['chick', 'Chick', '🐤'], ['duck', 'Duck', '🦆'], ['owl', 'Owl', '🦉'], ['whale', 'Whale', '🐳'],
    ['dolphin', 'Dolphin', '🐬'], ['shark', 'Shark', '🦈'], ['crab', 'Crab', '🦀'], ['snail', 'Snail', '🐌'],
    ['bee', 'Bee', '🐝'], ['ladybug', 'Ladybug', '🐞'], ['butterfly', 'Butterfly', '🦋'],
    ['snake', 'Snake', '🐍'], ['unicorn', 'Unicorn', '🦄'], ['dino', 'Dinosaur', '🦖'],
    ['elephant', 'Elephant', '🐘'],
  ]),
  ...DG.emojiRefs('nature', [
    ['cactus', 'Cactus', '🌵'], ['clover', 'Clover', '🍀'], ['moon', 'Moon', '🌙'], ['sun', 'Sun', '☀️'],
    ['star', 'Star', '⭐'], ['fire', 'Fire', '🔥'], ['rainbow', 'Rainbow', '🌈'], ['cloud', 'Cloud', '☁️'],
    ['snowman', 'Snowman', '⛄'], ['snowflake', 'Snowflake', '❄️'], ['lightning', 'Lightning', '⚡'],
    ['droplet', 'Droplet', '💧'], ['sunflower', 'Sunflower', '🌻'], ['tulip', 'Tulip', '🌷'],
    ['rose', 'Rose', '🌹'], ['blossom', 'Blossom', '🌸'], ['pine', 'Pine tree', '🌲'],
    ['palm', 'Palm tree', '🌴'], ['leaf', 'Maple leaf', '🍁'], ['wave', 'Wave', '🌊'],
    ['mushroom', 'Mushroom', '🍄'], ['volcano', 'Volcano', '🌋'], ['earth', 'Earth', '🌍'],
    ['comet', 'Shooting star', '🌠'],
  ]),
  ...DG.emojiRefs('objects', [
    ['balloon', 'Balloon', '🎈'], ['football', 'Football', '⚽'], ['basketball', 'Basketball', '🏀'],
    ['gift', 'Present', '🎁'], ['key', 'Key', '🔑'], ['pencil', 'Pencil', '✏️'], ['pin', 'Pushpin', '📌'],
    ['tophat', 'Top hat', '🎩'], ['crown', 'Crown', '👑'], ['gem', 'Gem', '💎'], ['bell', 'Bell', '🔔'],
    ['bulb', 'Light bulb', '💡'], ['umbrella', 'Umbrella', '☂️'], ['rocket', 'Rocket', '🚀'],
    ['car', 'Car', '🚗'], ['bus', 'Bus', '🚌'], ['sailboat', 'Sailboat', '⛵'], ['house', 'House', '🏠'],
    ['guitar', 'Guitar', '🎸'], ['socks', 'Socks', '🧦'], ['sneaker', 'Sneaker', '👟'],
    ['sunglasses', 'Sunglasses', '🕶️'], ['clock', 'Alarm clock', '⏰'], ['magnet', 'Magnet', '🧲'],
    ['target', 'Target', '🎯'], ['teddy', 'Teddy bear', '🧸'], ['pumpkin', 'Jack-o\'-lantern', '🎃'],
    ['xmastree', 'Christmas tree', '🎄'], ['trophy', 'Trophy', '🏆'], ['anchor', 'Anchor', '⚓'],
    ['dice', 'Die', '🎲'], ['paperclip', 'Paperclip', '📎'], ['lock', 'Padlock', '🔒'],
    ['scissors', 'Scissors', '✂️'],
  ]),
  ...DG.emojiRefs('faces', [
    ['grin', 'Grinning', '😀'], ['joy', 'Tears of joy', '😂'], ['hearteyes', 'Heart eyes', '😍'],
    ['cool', 'Cool', '😎'], ['sleepy', 'Sleeping', '😴'], ['angry', 'Angry', '😡'], ['cold', 'Freezing', '🥶'],
    ['sick', 'Nauseated', '🤢'], ['scream', 'Scream', '😱'], ['wink', 'Wink', '😉'],
    ['tongue', 'Tongue out', '😛'], ['clown', 'Clown', '🤡'], ['poop', 'Poop', '💩'], ['ghost', 'Ghost', '👻'],
    ['alien', 'Alien', '👽'], ['robot', 'Robot', '🤖'], ['skull', 'Skull', '💀'],
    ['monkeyeyes', 'See-no-evil monkey', '🙈'],
  ]),
  ...DG.emojiRefs('symbols', [
    ['heart', 'Heart', '❤️'], ['brokenheart', 'Broken heart', '💔'], ['cross', 'Cross mark', '❌'],
    ['circle', 'Red circle', '⭕'], ['question', 'Question mark', '❓'], ['exclaim', 'Exclamation', '❗'],
    ['hundred', '100', '💯'], ['triangle', 'Triangle', '🔺'], ['peace', 'Peace', '☮️'],
    ['yinyang', 'Yin yang', '☯️'], ['recycle', 'Recycle', '♻️'], ['zzz', 'Zzz', '💤'], ['boom', 'Boom', '💥'],
    ['speech', 'Speech bubble', '💬'], ['warning', 'Warning', '⚠️'], ['stop', 'Stop sign', '🛑'],
    ['music', 'Music notes', '🎶'], ['checkmark', 'Check mark', '✅'], ['sparkles', 'Sparkles', '✨'],
  ]),
  // Original CC0 illustrations made for this game (see images/CREDITS.md).
  ...DG.imageRefs('pictures', [
    ['pic-house', 'Cosy house', 'images/house.svg'],
    ['pic-tree', 'Tree', 'images/tree.svg'],
    ['pic-cat', 'Cat', 'images/cat.svg'],
    ['pic-rocket', 'Rocket', 'images/rocket.svg'],
    ['pic-sailboat', 'Sailboat', 'images/sailboat.svg'],
    ['pic-umbrella', 'Umbrella', 'images/umbrella.svg'],
    ['pic-cupcake', 'Cupcake', 'images/cupcake.svg'],
    ['pic-robot', 'Robot', 'images/robot.svg'],
    ['pic-flowerpot', 'Flower pot', 'images/flowerpot.svg'],
    ['pic-airballoon', 'Hot-air balloon', 'images/airballoon.svg'],
    ['pic-whale', 'Whale', 'images/whale.svg'],
    ['pic-popsicle', 'Ice lolly', 'images/popsicle.svg'],
  ]),
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
