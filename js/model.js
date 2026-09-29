// The scene model: what a drawing *is*, as plain JSON.
//
// scene = { version, width, height, background, blocks: [block, ...] }
// Blocks are drawn in order, so later blocks sit on top of earlier ones.

import { SHAPES } from './shapes.js';
import { REPEATERS } from './repeaters.js';
import { uid, clone } from './util.js';
import { isHex } from './color.js';

/** Layer effects, like the layer styles in a paint program. */
export const EFFECTS = [['none', 'None'], ['shadow', 'Drop shadow'], ['glow', 'Glow'], ['sticker', 'Sticker (white edge)'], ['soft', 'Soft focus'], ['long', 'Long shadow']];

export const COMMON = {
  x: 400, y: 400, w: 200, h: 200, rot: 0, flipX: false,
  fill: '#ff5c8a', fill2: '#ffce3a', fillMode: 'solid', gradAngle: 90,
  stroke: '#221f4f', strokeWidth: 0, opacity: 1, effect: 'none',
  visible: true, locked: false, clipTo: '',
};

export function makeRepeat(mode, o = {}) {
  return { ...clone(REPEATERS[mode].defaults), ...o, mode };
}

export function makeBlock(type, o = {}) {
  const def = SHAPES[type];
  if (!def) throw new Error(`Unknown block type: ${type}`);
  const b = { ...COMMON, ...clone(def.defaults), ...o, type, id: o.id || uid(), name: o.name || def.label };
  b.repeats = (o.repeats || []).filter((r) => REPEATERS[r.mode]).map((r) => makeRepeat(r.mode, r));
  return b;
}

export function blankScene() {
  return {
    version: 1, width: 800, height: 800,
    background: { mode: 'solid', c1: '#ffffff', c2: '#dbe4ff', angle: 90 },
    blocks: [],
  };
}

/** Repair anything missing or broken in a loaded scene (old files, hand-edited JSON). */
export function normalizeScene(input) {
  const s = blankScene();
  if (!input || typeof input !== 'object') return s;
  const bg = input.background || {};
  s.background = {
    mode: ['solid', 'linear', 'radial'].includes(bg.mode) ? bg.mode : 'solid',
    c1: isHex(bg.c1) ? bg.c1 : s.background.c1,
    c2: isHex(bg.c2) ? bg.c2 : s.background.c2,
    angle: Number.isFinite(bg.angle) ? bg.angle : 90,
  };
  const seen = new Set();
  s.blocks = (Array.isArray(input.blocks) ? input.blocks : [])
    .filter((b) => b && SHAPES[b.type])
    .map((b) => {
      const nb = makeBlock(b.type, b);
      if (seen.has(nb.id)) nb.id = uid();
      seen.add(nb.id);
      for (const k of ['fill', 'fill2', 'stroke']) if (!isHex(nb[k])) nb[k] = COMMON[k];
      if (!EFFECTS.some(([id]) => id === nb.effect)) nb.effect = 'none';
      if (nb.type === 'stroke') {
        const pts = Array.isArray(nb.points) ? nb.points.filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])) : [];
        nb.points = pts.length >= 2 ? pts.slice(0, 600) : clone(SHAPES.stroke.defaults.points);
      }
      return nb;
    });
  const ids = new Set(s.blocks.map((b) => b.id));
  s.blocks.forEach((b) => { if (b.clipTo && (!ids.has(b.clipTo) || b.clipTo === b.id)) b.clipTo = ''; });
  return s;
}
