// Coloring pages: turn any picture into outlines you can fill with the paint bucket.

import { SHAPES } from './shapes.js';
import { clone } from './util.js';
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, isHex } from './color.js';

const INK = '#221f4f';

/** True when a block draws only lines (so "coloring" it changes its line color). */
export function isLineBlock(b) {
  if (b.type === 'stroke') return !b.closed;
  return SHAPES[b.type]?.category === 'Lines' || ['tree', 'crystal', 'koch', 'sierpinski', 'rays'].includes(b.type) && b.fillMode === 'none';
}

/** A copy of the scene as a coloring page: white shapes with dark outlines, on white paper. */
export function toColoringPage(scene) {
  const s = clone(scene);
  s.background = { mode: 'solid', c1: '#ffffff', c2: '#ffffff', angle: 90 };
  for (const b of s.blocks) {
    if (b.type === 'face') continue; // faces keep their eyes
    if (isLineBlock(b)) { b.stroke = INK; b.strokeWidth = Math.max(2, Math.min(b.strokeWidth || 3, 6)); continue; }
    b.fillMode = 'solid';
    b.fill = '#ffffff';
    b.stroke = INK;
    b.strokeWidth = Math.max(2.5, Math.min(b.strokeWidth || 0, 6)) || 3;
    b.opacity = Math.max(b.opacity ?? 1, 0.9);
    for (const r of b.repeats || []) { if ('hueStep' in r) r.hueStep = 0; if ('hueVar' in r) r.hueVar = 0; if ('fade' in r) r.fade = 0; }
  }
  return s;
}

/** Paint one block with the bucket: fills for shapes, line color for lines. */
export function paintBlock(b, color) {
  if (isLineBlock(b)) { b.stroke = color; return 'line'; }
  b.fillMode = 'solid';
  b.fill = color;
  return 'fill';
}

// ---------- color harmony: recolor a whole drawing, keeping its lights and darks ----------

export const HARMONIES = [
  ['analogous', 'Analogous (neighbors)', [0, -28, 28, -56, 56]],
  ['complementary', 'Complementary (opposites)', [0, 180, 20, 200, -20]],
  ['triadic', 'Triadic (three-way)', [0, 120, 240]],
  ['split', 'Split complementary', [0, 150, 210]],
  ['mono', 'Monochrome (one color)', [0]],
];

/**
 * Recolor every color in the drawing from one starting color, like "Recolor artwork"
 * in professional apps: each color keeps its lightness (so light stays light and dark
 * stays dark) and gets a new hue from the chosen harmony. Grays stay nearly gray.
 */
export function harmonize(scene, base, kind = 'analogous') {
  const s = clone(scene);
  const offsets = (HARMONIES.find((h) => h[0] === kind) || HARMONIES[0])[2];
  const [h0, s0] = rgbToHsl(...hexToRgb(isHex(base) ? base : '#ff4f87'));
  // Every color slot we are allowed to change.
  const slots = [];
  const add = (obj, key) => { if (isHex(obj[key])) slots.push([obj, key]); };
  add(s.background, 'c1'); if (s.background.mode !== 'solid') add(s.background, 'c2');
  for (const b of s.blocks) {
    if (b.type === 'face') continue;
    if (b.fillMode !== 'none') { add(b, 'fill'); if (b.fillMode !== 'solid') add(b, 'fill2'); }
    if (isLineBlock(b) || b.fillMode === 'none') add(b, 'stroke');
  }
  const distinct = [...new Set(slots.map(([o, k]) => o[k].toLowerCase()))];
  // Spread the harmony's hues over the drawing's colors in their original hue order.
  const byHue = [...distinct].sort((a, b) => rgbToHsl(...hexToRgb(a))[0] - rgbToHsl(...hexToRgb(b))[0]);
  const map = new Map();
  byHue.forEach((c, i) => {
    const [, sat, light] = rgbToHsl(...hexToRgb(c));
    const neutral = sat < 0.12 || light > 0.96 || light < 0.06;
    const hue = h0 + offsets[i % offsets.length];
    const newSat = neutral ? Math.min(0.14, s0 * 0.2) : Math.max(0.45, Math.min(0.95, 0.35 + s0 * 0.6));
    map.set(c, rgbToHex(...hslToRgb(hue, newSat, Math.max(0.08, Math.min(0.97, light)))));
  });
  for (const [o, k] of slots) o[k] = map.get(o[k].toLowerCase());
  return s;
}
