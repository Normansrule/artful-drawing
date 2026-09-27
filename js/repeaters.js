// Repeats are the "algorithms" you can stack on any block.
//
// Each repeater turns one drawing into many by producing a list of copies:
//   { t: SVG transform string, hue: degrees to shift color, o: opacity }
// Stacked repeaters multiply: a Step of 3 followed by a Mirror gives 6 copies.

import { r2, rng } from './util.js';

export const MAX_COPIES = 3000;

const around = { key: 'around', label: 'Around', type: 'select', options: [['canvas', 'Canvas center'], ['self', 'This block'], ['point', 'A point I choose']] };
const pointParams = [
  { key: 'cx', label: 'Center x', type: 'range', min: 0, max: 800, step: 1, show: (r) => r.around === 'point' },
  { key: 'cy', label: 'Center y', type: 'range', min: 0, max: 800, step: 1, show: (r) => r.around === 'point' },
];
const hueStep = { key: 'hueStep', label: 'Color shift per copy', type: 'range', min: -60, max: 60, step: 1, hint: 'Walks each copy around the color wheel. Great for rainbows.' };

function centerOf(r, b, scene) {
  if (r.around === 'self') return [b.x, b.y];
  if (r.around === 'point') return [r.cx, r.cy];
  return [scene.width / 2, scene.height / 2];
}

/** Transform around a pivot point (px, py): move, then rotate and scale in place. */
const aroundPivot = (dx, dy, px, py, rot, s) =>
  `translate(${r2(dx + px)} ${r2(dy + py)})` + (rot ? ` rotate(${r2(rot)})` : '') + (s !== 1 ? ` scale(${r2(s * 1000) / 1000})` : '') + ` translate(${r2(-px)} ${r2(-py)})`;

export const REPEATERS = {
  mirror: {
    label: 'Mirror',
    blurb: 'Adds a flipped copy, like folding paper. Butterflies, faces, hearts, ears.',
    defaults: { axis: 'v', around: 'canvas', cx: 400, cy: 400 },
    params: [
      { key: 'axis', label: 'Fold', type: 'select', options: [['v', 'Left and right'], ['h', 'Top and bottom'], ['both', 'Four corners']] },
      around, ...pointParams,
    ],
    copies(b, r, scene) {
      const [cx, cy] = centerOf(r, b, scene);
      const out = [{ t: '', hue: 0, o: 1 }];
      const fx = `translate(${r2(2 * cx)} 0) scale(-1 1)`, fy = `translate(0 ${r2(2 * cy)}) scale(1 -1)`;
      if (r.axis === 'v' || r.axis === 'both') out.push({ t: fx, hue: 0, o: 1 });
      if (r.axis === 'h' || r.axis === 'both') out.push({ t: fy, hue: 0, o: 1 });
      if (r.axis === 'both') out.push({ t: `translate(${r2(2 * cx)} ${r2(2 * cy)}) scale(-1 -1)`, hue: 0, o: 1 });
      return out;
    },
  },

  radial: {
    label: 'Spin around',
    blurb: 'Copies spun evenly around a center. Snowflakes, flowers, suns, mandalas.',
    defaults: { count: 6, offset: 0, kaleido: false, around: 'canvas', cx: 400, cy: 400, hueStep: 0 },
    params: [
      { key: 'count', label: 'Copies', type: 'range', min: 1, max: 48, step: 1 },
      { key: 'offset', label: 'Starting angle', type: 'range', min: -180, max: 180, step: 1 },
      { key: 'kaleido', label: 'Kaleidoscope (mirror each copy)', type: 'toggle' },
      around, ...pointParams, hueStep,
    ],
    copies(b, r, scene) {
      const [cx, cy] = centerOf(r, b, scene), out = [];
      for (let i = 0; i < r.count; i++) {
        const a = r2(r.offset + (i * 360) / r.count);
        const rot = `rotate(${a} ${r2(cx)} ${r2(cy)})`;
        out.push({ t: a || r.offset ? rot : '', hue: i * r.hueStep, o: 1 });
        if (r.kaleido) out.push({ t: `${rot} translate(${r2(2 * cx)} 0) scale(-1 1)`, hue: i * r.hueStep, o: 1 });
      }
      return out;
    },
  },

  step: {
    label: 'Step and repeat',
    blurb: 'Each copy moves, turns and shrinks a little more than the last. Tree tiers, trails, stacks.',
    defaults: { count: 4, dx: 0, dy: -80, rot: 0, scale: 0.85, fade: 0, hueStep: 0 },
    params: [
      { key: 'count', label: 'Copies', type: 'range', min: 1, max: 60, step: 1 },
      { key: 'dx', label: 'Move right each time', type: 'range', min: -300, max: 300, step: 1 },
      { key: 'dy', label: 'Move down each time', type: 'range', min: -300, max: 300, step: 1 },
      { key: 'rot', label: 'Turn each time', type: 'range', min: -180, max: 180, step: 1 },
      { key: 'scale', label: 'Resize each time', type: 'range', min: 0.3, max: 1.5, step: 0.01 },
      { key: 'fade', label: 'Fade each time', type: 'range', min: 0, max: 0.5, step: 0.01 },
      hueStep,
    ],
    copies(b, r) {
      const out = [];
      for (let i = 0; i < r.count; i++) {
        out.push({
          t: i === 0 ? '' : aroundPivot(i * r.dx, i * r.dy, b.x, b.y, i * r.rot, Math.pow(r.scale, i)),
          hue: i * r.hueStep, o: Math.max(0, 1 - i * r.fade),
        });
      }
      return out;
    },
  },

  grid: {
    label: 'Grid',
    blurb: 'Rows and columns of copies. Wallpaper, tiles, fabric, polka dots.',
    defaults: { cols: 4, rows: 4, gapX: 120, gapY: 120, stagger: false, hueStep: 0 },
    params: [
      { key: 'cols', label: 'Columns', type: 'range', min: 1, max: 30, step: 1 },
      { key: 'rows', label: 'Rows', type: 'range', min: 1, max: 30, step: 1 },
      { key: 'gapX', label: 'Column spacing', type: 'range', min: 5, max: 400, step: 1 },
      { key: 'gapY', label: 'Row spacing', type: 'range', min: 5, max: 400, step: 1 },
      { key: 'stagger', label: 'Brick offset (shift every other row)', type: 'toggle' },
      hueStep,
    ],
    copies(b, r) {
      const out = [];
      for (let j = 0; j < r.rows; j++) {
        for (let i = 0; i < r.cols; i++) {
          const dx = i * r.gapX + (r.stagger && j % 2 ? r.gapX / 2 : 0), dy = j * r.gapY;
          out.push({ t: dx || dy ? `translate(${r2(dx)} ${r2(dy)})` : '', hue: (i + j) * r.hueStep, o: 1 });
        }
      }
      return out;
    },
  },

  scatter: {
    label: 'Scatter',
    blurb: 'Sprinkles copies at random around the block. Stars, snow, confetti, falling leaves.',
    defaults: { count: 20, spreadX: 350, spreadY: 350, sizeVar: 0.5, rotVar: 180, hueVar: 0, seed: 7 },
    params: [
      { key: 'count', label: 'Copies', type: 'range', min: 1, max: 300, step: 1 },
      { key: 'spreadX', label: 'Spread sideways', type: 'range', min: 0, max: 600, step: 1 },
      { key: 'spreadY', label: 'Spread up and down', type: 'range', min: 0, max: 600, step: 1 },
      { key: 'sizeVar', label: 'Size variety', type: 'range', min: 0, max: 0.95, step: 0.01 },
      { key: 'rotVar', label: 'Rotation variety', type: 'range', min: 0, max: 180, step: 1 },
      { key: 'hueVar', label: 'Color variety', type: 'range', min: 0, max: 180, step: 1 },
      { key: 'seed', label: 'Random seed', type: 'seed', min: 1, max: 9999, step: 1, hint: 'Same seed, same sprinkle. Change it to reshuffle.' },
    ],
    copies(b, r) {
      const rand = rng(r.seed), out = [];
      for (let i = 0; i < r.count; i++) {
        const dx = (rand() * 2 - 1) * r.spreadX, dy = (rand() * 2 - 1) * r.spreadY;
        const rot = (rand() * 2 - 1) * r.rotVar, s = 1 - rand() * r.sizeVar, hue = (rand() * 2 - 1) * r.hueVar;
        out.push({ t: aroundPivot(dx, dy, b.x, b.y, rot, s), hue, o: 1 });
      }
      return out;
    },
  },

  spiral: {
    label: 'Golden spiral',
    blurb: 'Copies placed by turning a fixed angle each time. 137.5° packs them like sunflower seeds.',
    defaults: { count: 120, angle: 137.5, spacing: 24, growth: 'sqrt', scaleStep: 1, orient: false, hueStep: 1 },
    params: [
      { key: 'count', label: 'Copies', type: 'range', min: 1, max: 600, step: 1 },
      { key: 'angle', label: 'Turn each time (degrees)', type: 'range', min: 1, max: 180, step: 0.1 },
      { key: 'spacing', label: 'Spacing', type: 'range', min: 1, max: 80, step: 0.5 },
      { key: 'growth', label: 'Growth', type: 'select', options: [['sqrt', 'Even packing (seed head)'], ['linear', 'Widening (galaxy arm)']] },
      { key: 'scaleStep', label: 'Resize each time', type: 'range', min: 0.97, max: 1.03, step: 0.001 },
      { key: 'orient', label: 'Point copies outward', type: 'toggle' },
      hueStep,
    ],
    copies(b, r) {
      const out = [];
      for (let i = 0; i < r.count; i++) {
        const a = (i * r.angle * Math.PI) / 180;
        const rad = r.growth === 'linear' ? r.spacing * i * 0.25 : r.spacing * Math.sqrt(i);
        out.push({
          t: i === 0 && !r.orient ? '' : aroundPivot(Math.cos(a) * rad, Math.sin(a) * rad, b.x, b.y, r.orient ? (i * r.angle) + 90 : 0, Math.pow(r.scaleStep, i)),
          hue: i * r.hueStep, o: 1,
        });
      }
      return out;
    },
  },
};

/** Apply a block's repeat stack in order and return every copy. */
export function expandRepeats(b, scene) {
  let copies = [{ t: '', hue: 0, o: 1 }];
  for (const r of b.repeats || []) {
    const def = REPEATERS[r.mode];
    if (!def) continue;
    const next = def.copies(b, r, scene), out = [];
    outer: for (const n of next) {
      for (const c of copies) {
        out.push({ t: [n.t, c.t].filter(Boolean).join(' '), hue: c.hue + n.hue, o: c.o * n.o });
        if (out.length >= MAX_COPIES) break outer;
      }
    }
    copies = out;
  }
  return copies;
}
