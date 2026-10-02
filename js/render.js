// Turns a scene into SVG markup. Pure functions, no DOM required,
// so the same code draws the studio canvas, thumbnails, the Learn page
// demos, file exports, and runs in Node for tests.

import { SHAPES } from './shapes.js';
import { expandRepeats } from './repeaters.js';
import { shiftHue } from './color.js';
import { r2, esc } from './util.js';

// Shape geometry only depends on shape settings, not position,
// so cache it: dragging a 2,000-branch tree stays smooth.
const cache = new Map();
const GEOMETRY_SKIP = new Set(['id', 'name', 'x', 'y', 'rot', 'flipX', 'fill', 'fill2', 'fillMode', 'gradAngle', 'stroke', 'strokeWidth', 'opacity', 'visible', 'locked', 'clipTo', 'repeats']);

export function blockParts(b) {
  const def = SHAPES[b.type];
  if (!def) return [];
  const key = b.type + JSON.stringify(Object.keys(b).filter((k) => !GEOMETRY_SKIP.has(k)).sort().map((k) => [k, b[k]]));
  if (cache.has(key)) return cache.get(key);
  let parts = [];
  try { parts = def.parts(b) || []; } catch (e) { console.warn('Could not draw', b.type, e); }
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  cache.set(key, parts);
  return parts;
}

export const baseTransform = (b) =>
  `translate(${r2(b.x)} ${r2(b.y)})` + (b.rot ? ` rotate(${r2(b.rot)})` : '') + (b.flipX ? ' scale(-1 1)' : '');

function gradient(id, mode, c1, c2, angle) {
  if (mode === 'radial') {
    return `<radialGradient id="${id}" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
  }
  const a = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(a) / 2, y = Math.sin(a) / 2;
  return `<linearGradient id="${id}" x1="${r2(0.5 - x)}" y1="${r2(0.5 - y)}" x2="${r2(0.5 + x)}" y2="${r2(0.5 + y)}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
}

function renderBlock(b, scene, pfx, defs, reveal, bi) {
  const parts = blockParts(b);
  const copies = expandRepeats(b, scene);
  const perCopyGrad = b.fillMode !== 'solid' && b.fillMode !== 'none' && copies.some((c) => c.hue);
  const bt = baseTransform(b);
  let clip = '';
  if (b.clipTo) {
    const target = scene.blocks.find((x) => x.id === b.clipTo);
    if (target) {
      const cid = `${pfx}clip-${b.id}`;
      const tparts = blockParts(target).filter((p) => p.kind !== 'line' && p.d);
      const tbt = baseTransform(target);
      const paths = expandRepeats(target, scene)
        .map((c) => tparts.map((p) => `<path transform="${c.t ? c.t + ' ' : ''}${tbt}" d="${p.d}"/>`).join(''))
        .join('');
      defs.push(`<clipPath id="${cid}" clip-rule="evenodd">${paths}</clipPath>`);
      clip = ` clip-path="url(#${cid})"`;
    }
  }
  let fx = '';
  if (b.effect && b.effect !== 'none') {
    const fid = `${pfx}fx-${b.id}`;
    const glowColor = b.fillMode === 'none' || !parts.some((p) => p.kind !== 'line') ? b.stroke : b.fill;
    defs.push(effectFilter(fid, b.effect, glowColor, scene));
    fx = ` filter="url(#${fid})"`;
  }
  let out = `<g data-block="${esc(b.id)}"${b.opacity < 1 ? ` opacity="${r2(b.opacity)}"` : ''}${clip}>`;
  if (fx) out += `<g${fx}>`;
  copies.forEach((c, i) => {
    // reveal(blockIndex, copyIndex, copyCount) -> 0..1 lets animations grow copies in.
    const t = reveal ? reveal(bi, i, copies.length) : 1;
    if (t <= 0.001) return;
    let fill;
    if (b.fillMode === 'none') fill = 'none';
    else if (b.fillMode === 'solid') fill = shiftHue(b.fill, c.hue);
    else {
      const gid = perCopyGrad ? `${pfx}g-${b.id}-${i}` : `${pfx}g-${b.id}`;
      if (i === 0 || perCopyGrad) defs.push(gradient(gid, b.fillMode, shiftHue(b.fill, c.hue), shiftHue(b.fill2, c.hue), b.gradAngle));
      fill = `url(#${gid})`;
    }
    const stroke = shiftHue(b.stroke, c.hue);
    const o = c.o * Math.min(1, t * 1.6);
    out += `<g transform="${c.t ? c.t + ' ' : ''}${bt}${t !== 1 ? ` scale(${r2(Math.max(0.001, t))})` : ''}"${o < 1 ? ` opacity="${r2(o)}"` : ''}>`;
    for (const p of parts) {
      const op = p.opacity != null ? ` opacity="${p.opacity}"` : '';
      if (p.kind === 'text') {
        const s = b.strokeWidth > 0 ? ` stroke="${stroke}" stroke-width="${r2(b.strokeWidth * 2)}" stroke-linejoin="round" paint-order="stroke"` : '';
        const n = p.lines.length, lh = p.size / 0.78;
        const fit = p.fit ? ` textLength="${r2(p.fit)}" lengthAdjust="spacingAndGlyphs"` : '';
        out += `<text text-anchor="middle" dominant-baseline="central" font-family="${esc(p.font)}" font-weight="${p.weight}" font-style="${p.style}" font-size="${r2(p.size)}" letter-spacing="${r2(p.spacing)}" fill="${fill === 'none' ? 'none' : fill}"${s}${op}>` +
          p.lines.map((line, k) => `<tspan x="0" y="${r2((k - (n - 1) / 2) * lh)}"${fit}>${esc(line) || ' '}</tspan>`).join('') + '</text>';
        continue;
      }
      if (p.kind === 'line') {
        const w = r2(b.strokeWidth * (p.sw ?? 1));
        if (w <= 0) continue;
        out += `<path d="${p.d}" fill="none" stroke="${p.color ? shiftHue(p.color, c.hue) : stroke}" stroke-width="${w}"${op}/>`;
      } else {
        const f = p.color ? shiftHue(p.color, c.hue) : fill;
        const s = b.strokeWidth > 0 && !p.noStroke ? ` stroke="${stroke}" stroke-width="${r2(b.strokeWidth)}"` : '';
        out += `<path d="${p.d}" fill="${f}"${s}${op}/>`;
      }
    }
    out += '</g>';
  });
  return out + (fx ? '</g>' : '') + '</g>';
}

/**
 * SVG filters for layer effects. The filter region covers the whole canvas in canvas units,
 * so thin lines (whose bounding box has no height) still get their glow.
 */
function effectFilter(id, effect, color, scene) {
  const W = scene.width, H = scene.height;
  const region = `filterUnits="userSpaceOnUse" x="${-W}" y="${-H}" width="${W * 3}" height="${H * 3}"`;
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  switch (effect) {
    case 'shadow':
      return `<filter id="${id}" ${region}><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#0b0920" flood-opacity="0.35"/></filter>`;
    case 'glow':
      return `<filter id="${id}" ${region}><feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b2"/>` +
        `<feFlood flood-color="${c}" flood-opacity="0.9"/><feComposite in2="b1" operator="in" result="g1"/>` +
        `<feMerge><feMergeNode in="g1"/><feMergeNode in="g1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    case 'sticker':
      return `<filter id="${id}" ${region}><feMorphology in="SourceAlpha" operator="dilate" radius="7" result="grow"/>` +
        `<feFlood flood-color="#ffffff"/><feComposite in2="grow" operator="in" result="edge"/>` +
        `<feDropShadow in="edge" dx="0" dy="6" stdDeviation="5" flood-color="#0b0920" flood-opacity="0.35" result="edgeShadow"/>` +
        `<feMerge><feMergeNode in="edgeShadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    case 'soft':
      return `<filter id="${id}" ${region}><feGaussianBlur stdDeviation="4"/></filter>`;
    case 'long': {
      // A flat "long shadow": the shape's silhouette repeated down and to the right.
      const steps = [6, 12, 18, 24, 30, 36].map((d, i) => `<feOffset in="SourceAlpha" dx="${d}" dy="${d}" result="o${i}"/>`).join('');
      const merge = [0, 1, 2, 3, 4, 5].map((i) => `<feMergeNode in="o${i}"/>`).join('');
      return `<filter id="${id}" ${region}>${steps}<feMerge result="stack">${merge}</feMerge>` +
        `<feFlood flood-color="#0b0920" flood-opacity="0.28"/><feComposite in2="stack" operator="in" result="shade"/>` +
        `<feMerge><feMergeNode in="shade"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    }
    default: return '';
  }
}

/** Inner SVG markup (defs + background + blocks). */
export function renderSceneInner(scene, { prefix = '', reveal = null } = {}) {
  const defs = [];
  const bg = scene.background || { mode: 'solid', c1: '#ffffff' };
  let bgFill = bg.c1;
  if (bg.mode === 'linear' || bg.mode === 'radial') {
    defs.push(gradient(`${prefix}bg`, bg.mode, bg.c1, bg.c2, bg.angle));
    bgFill = `url(#${prefix}bg)`;
  }
  const body = scene.blocks.map((b, i) => (b.visible === false ? '' : renderBlock(b, scene, prefix, defs, reveal, i))).join('');
  return `<defs>${defs.join('')}</defs><rect data-bg="1" width="${scene.width}" height="${scene.height}" fill="${bgFill}"/>` +
    `<g fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}

/** A complete, standalone SVG document. */
export function renderSceneSVG(scene, { prefix = '', width, height, title = 'artful drawing drawing', reveal = null } = {}) {
  const w = width ?? scene.width, h = height ?? scene.height;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${w}" height="${h}" role="img"><title>${esc(title)}</title>${renderSceneInner(scene, { prefix, reveal })}</svg>`;
}

/** Counts for the studio's status monitor: blocks, visible shapes after repeats. */
export function sceneStats(scene) {
  let shapes = 0, visible = 0;
  for (const b of scene.blocks) {
    if (b.visible === false) continue;
    visible++;
    shapes += expandRepeats(b, scene).length * Math.max(1, blockParts(b).length);
  }
  return { blocks: scene.blocks.length, visible, shapes };
}
