// Coloring pages: turn any picture into outlines you can fill with the paint bucket.

import { SHAPES } from './shapes.js';
import { clone } from './util.js';

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
