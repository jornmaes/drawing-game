// Score -> funny verdict. Pure data + a picker; edit freely.
// Each band applies to scores >= min. `badge` is a small emoji shown with the score.
window.DG = window.DG || {};

DG.VERDICTS = [
  {
    min: 90, badge: '🏆',
    lines: [
      'Absolutely uncanny. Are you secretly a printer?',
      'Pixel-perfect show-off.',
      'The judges checked twice. It\'s basically the same picture.',
      'Museums will be calling. Let it ring.',
    ],
  },
  {
    min: 75, badge: '🎨',
    lines: [
      'Wow, that\'s a real copy!',
      'Did you trace this?! (We\'re watching you.)',
      'Gallery-worthy. Small gallery. But still.',
      'Your art teacher just felt a disturbance in the force.',
    ],
  },
  {
    min: 60, badge: '✨',
    lines: [
      'Ooh, not bad at all!',
      'The resemblance is… actually there!',
      'Solid work, Picasso-in-training.',
      'Fridge door? No. Living room wall.',
    ],
  },
  {
    min: 45, badge: '👍',
    lines: [
      'Respectable fridge-door material.',
      'Hey, the vibes are there!',
      'Your mum would definitely hang this up.',
      'We can see what it is! Mostly!',
    ],
  },
  {
    min: 30, badge: '🤔',
    lines: [
      'I can see what you were going for. Sort of.',
      'Points for confidence.',
      'If you squint really hard… nope, still squinting.',
      'It\'s giving… something.',
    ],
  },
  {
    min: 15, badge: '🙈',
    lines: [
      'Picasso would weep. Not in a good way.',
      'Did you draw this with your elbow?',
      'Bold. Abstract. Wrong.',
      'A brave interpretation of the source material.',
    ],
  },
  {
    min: 0, badge: '🥔',
    lines: [
      'Is that… a potato?',
      'My cat could do that. My cat DID do that.',
      'The judges have left the building.',
      'Modern art! Very modern. Too modern.',
    ],
  },
];

DG.VERDICT_EMPTY = { badge: '🫥', line: 'The canvas is still waiting for you…' };

DG.pickVerdict = function (score, empty) {
  if (empty) return { badge: DG.VERDICT_EMPTY.badge, line: DG.VERDICT_EMPTY.line };
  const band = DG.VERDICTS.find((b) => score >= b.min) || DG.VERDICTS[DG.VERDICTS.length - 1];
  const line = band.lines[Math.floor(Math.random() * band.lines.length)];
  return { badge: band.badge, line };
};
