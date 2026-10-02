// Stamps: click or drag to scatter little shapes, like a stamp or a confetti brush.
// Every stamp is an ordinary block, so it can be recolored, moved or deleted later.

import { makeBlock, makeRepeat } from './model.js';
import { shiftHue } from './color.js';

export const STAMPS = [
  ['star', 'Stars', (s) => ({ type: 'star', w: s, h: s, points: 5, inner: 0.45 })],
  ['sparkle', 'Sparkles', (s) => ({ type: 'star', w: s, h: s, points: 4, inner: 0.3 })],
  ['heart', 'Hearts', (s) => ({ type: 'heart', w: s, h: s * 0.92 })],
  ['dot', 'Dots', (s) => ({ type: 'circle', w: s * 0.7, h: s * 0.7 })],
  ['flower', 'Flowers', (s) => ({ type: 'petal', w: s * 0.36, h: s, repeats: [makeRepeat('radial', { count: 5, around: 'self' })] })],
  ['leaf', 'Leaves', (s) => ({ type: 'petal', w: s * 0.45, h: s })],
  ['snow', 'Snowflakes', (s) => ({ type: 'crystal', w: s * 0.28, h: s * 0.62, strokeWidth: Math.max(1.5, s / 18), depth: 2, repeats: [makeRepeat('radial', { count: 6, around: 'self' })] })],
  ['bubble', 'Bubbles', (s) => ({ type: 'ring', w: s, h: s })],
];

/**
 * One stamp at (x, y). rnd() is a seeded random function so tests are repeatable.
 * opts: { size, color, jitter (0..1), rainbow, outline }
 */
export function makeStamp(kind, x, y, rnd, { size = 40, color = '#ff4f87', jitter = 0.6, rainbow = false, outline = false } = {}) {
  const def = STAMPS.find((s) => s[0] === kind) || STAMPS[0];
  const k = 1 + (rnd() - 0.5) * jitter * 1.2;
  const spec = def[2](size * k);
  const lineOnly = spec.type === 'crystal' || spec.type === 'ring';
  const c = rainbow ? shiftHue(color, (rnd() - 0.5) * 120) : color;
  return makeBlock(spec.type, {
    ...spec, name: `Stamp: ${def[1].toLowerCase().replace(/s$/, '')}`, penMade: true,
    x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, rot: Math.round((rnd() - 0.5) * jitter * 80) || 0,
    fill: c, fillMode: 'solid', stroke: lineOnly ? c : '#221f4f',
    strokeWidth: lineOnly ? spec.strokeWidth || Math.max(2, size / 14) : outline ? Math.max(1.5, size / 16) : 0,
  });
}
