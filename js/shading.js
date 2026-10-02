// Shading helpers: one click to make a flat shape look round, or to set it on the ground.
// Both only add a few ordinary blocks (clipped inside the shape, grouped with it), so
// everything stays editable and Undo removes it in one step.

import { makeBlock } from './model.js';
import { SHAPES } from './shapes.js';
import { clone, uid } from './util.js';
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, isHex } from './color.js';

const NOT_SHADEABLE = new Set(['face', 'text', 'pattern', 'stroke', 'sunflower', 'rays', 'tree', 'crystal', 'koch', 'sierpinski']);

/** Can this block get one-click shading? */
export function canShade(b) {
  return !!b && SHAPES[b.type]?.category === 'Shapes' && !NOT_SHADEABLE.has(b.type) && b.fillMode !== 'none' && b.visible !== false;
}
export const isShaded = (scene, b) => scene.blocks.some((o) => o.clipTo === b.id && /shadow|highlight|shade/i.test(o.name));

const shade = (hex, dl, ds = 0) => {
  const [h, s, l] = rgbToHsl(...hexToRgb(isHex(hex) ? hex : '#888888'));
  return rgbToHex(...hslToRgb(h - dl * 20, Math.min(1, s + ds), Math.max(0.04, Math.min(0.98, l + dl))));
};

/**
 * Light from the top left: a darker crescent toward the bottom right, a soft highlight
 * near the top left, and the outline redrawn on top so edges stay crisp.
 */
export function addShading(scene, id) {
  const s = clone(scene);
  const i = s.blocks.findIndex((b) => b.id === id);
  const host = s.blocks[i];
  if (!canShade(host) || isShaded(s, host)) return s;
  const group = host.group || uid();
  host.group = group;
  const base = host.fill;
  const reps = clone(host.repeats || []);
  const shapeParams = Object.fromEntries((SHAPES[host.type].params || []).map((p) => [p.key, host[p.key]]));
  const shadow = makeBlock(host.type, {
    ...shapeParams, name: `${host.name} shadow`, group, clipTo: host.id, repeats: reps,
    x: host.x + host.w * 0.13, y: host.y + host.h * 0.13, w: host.w * 1.02, h: host.h * 1.02, rot: host.rot, flipX: host.flipX,
    fillMode: 'solid', fill: shade(base, -0.2, 0.05), strokeWidth: 0, opacity: 0.6, effect: 'soft',
  });
  // A shadow block drawn under the host would be hidden; it is clipped inside instead, so cut the lit side away:
  // drawing the host's own color again, shifted up-left, leaves only a crescent of shadow.
  const lit = makeBlock(host.type, {
    ...shapeParams, name: `${host.name} shade`, group, clipTo: host.id, repeats: clone(reps),
    x: host.x - host.w * 0.06, y: host.y - host.h * 0.06, w: host.w * 0.98, h: host.h * 0.98, rot: host.rot, flipX: host.flipX,
    fillMode: host.fillMode, fill: host.fill, fill2: host.fill2, gradAngle: host.gradAngle, strokeWidth: 0, effect: 'soft',
  });
  const highlight = makeBlock('circle', {
    name: `${host.name} highlight`, group, clipTo: host.id, repeats: clone(reps),
    x: host.x - host.w * 0.2, y: host.y - host.h * 0.24, w: host.w * 0.3, h: host.h * 0.17, rot: -32,
    fillMode: 'solid', fill: '#ffffff', strokeWidth: 0, opacity: 0.55, effect: 'soft',
  });
  const add = [shadow, lit, highlight];
  if (host.strokeWidth > 0) {
    add.push(makeBlock(host.type, {
      ...shapeParams, name: `${host.name} outline`, group, repeats: clone(reps),
      x: host.x, y: host.y, w: host.w, h: host.h, rot: host.rot, flipX: host.flipX,
      fillMode: 'none', stroke: host.stroke, strokeWidth: host.strokeWidth,
    }));
  }
  s.blocks.splice(i + 1, 0, ...add);
  return s;
}

/** A soft oval shadow under the given parts, drawn behind them, so they sit on the ground. */
export function addGroundShadow(scene, ids, box) {
  const s = clone(scene);
  const first = s.blocks.findIndex((b) => ids.includes(b.id));
  if (first < 0) return s;
  const w = box.width * 0.75, h = Math.max(14, box.width * 0.11);
  const shadow = makeBlock('circle', {
    name: 'Ground shadow', x: box.x + box.width / 2, y: box.y + box.height - h * 0.15, w, h,
    fillMode: 'solid', fill: '#0b0920', strokeWidth: 0, opacity: 0.32, effect: 'soft',
  });
  s.blocks.splice(first, 0, shadow);
  return s;
}
