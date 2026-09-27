// Every block type lives here.
//
// A block definition is plain data plus one function:
//   label     name shown in the studio
//   category  which shelf it sits on
//   blurb     one sentence explaining what it is for
//   defaults  starting values (size, colors, shape settings)
//   params    shape-specific settings shown in the inspector
//   parts(p)  returns drawing instructions, centered on (0, 0):
//             [{ d, kind: 'fill' | 'line', sw, color, opacity, noStroke }]
//
// 'fill' parts are painted with the block's fill (and outline if it has one).
// 'line' parts are painted with the outline color; sw multiplies its width.
// Position, rotation and repeats are applied later by render.js, so a shape
// only has to know how to draw itself at the origin.

import { r2, rng } from './util.js';

// ---------- path helpers ----------

/** Scale a list of unit-space commands ([op, x, y, ...]) by sx, sy. */
const sc = (cmds, sx, sy) =>
  cmds.map(([op, ...a]) => op + a.map((v, i) => r2(i % 2 ? v * sy : v * sx)).join(' ')).join('');

export const ellipsePath = (rx, ry, cx = 0, cy = 0) =>
  `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(rx * 2)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-rx * 2)} 0Z`;

const polygon = (pts) => 'M' + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + 'Z';
const polyline = (pts) => 'M' + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L');

/** Smooth closed curve through points (Catmull-Rom converted to Bezier). */
function smoothClosed(pts) {
  const n = pts.length;
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d + 'Z';
}

// ---------- parameter helpers ----------

const range = (key, label, min, max, step = 1, hint = '') => ({ key, label, type: 'range', min, max, step, hint });
const select = (key, label, options, hint = '') => ({ key, label, type: 'select', options, hint });
const toggle = (key, label, hint = '') => ({ key, label, type: 'toggle', hint });
const seed = (hint = 'Change the number to get a different random variation.') =>
  ({ key: 'seed', label: 'Random seed', type: 'seed', min: 1, max: 9999, step: 1, hint });

const LINE = { fill: '#ffffff', stroke: '#221f4f', strokeWidth: 8 };

// ---------- block definitions ----------

export const SHAPES = {
  // ===== Shapes =====
  circle: {
    label: 'Circle', category: 'Shapes',
    blurb: 'A circle or oval. Stretch it into bellies, eyes, clouds and planets.',
    defaults: { w: 180, h: 180, fill: '#ff5c8a' },
    params: [],
    parts: (p) => [{ d: ellipsePath(p.w / 2, p.h / 2) }],
  },

  rect: {
    label: 'Box', category: 'Shapes',
    blurb: 'A rectangle with adjustable rounded corners. Presents, trunks, windows, stems.',
    defaults: { w: 200, h: 140, fill: '#5ce1e6', radius: 0.2 },
    params: [range('radius', 'Corner roundness', 0, 1, 0.01)],
    parts: (p) => {
      const w = p.w, h = p.h, r = (Math.min(w, h) / 2) * p.radius, x = -w / 2, y = -h / 2;
      if (r <= 0.01) return [{ d: polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) }];
      return [{
        d: `M${r2(x + r)} ${r2(y)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w)} ${r2(y + r)}` +
          `V${r2(y + h - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w - r)} ${r2(y + h)}H${r2(x + r)}` +
          `A${r2(r)} ${r2(r)} 0 0 1 ${r2(x)} ${r2(y + h - r)}V${r2(y + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + r)} ${r2(y)}Z`,
      }];
    },
  },

  triangle: {
    label: 'Triangle', category: 'Shapes',
    blurb: 'Point it up for trees and mountains, sideways for beaks and ears.',
    defaults: { w: 220, h: 200, fill: '#2fae66', tip: 0 },
    params: [range('tip', 'Lean of the tip', -1, 1, 0.01)],
    parts: (p) => [{ d: polygon([[(p.tip * p.w) / 2, -p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, p.h / 2]]) }],
  },

  polygon: {
    label: 'Polygon', category: 'Shapes',
    blurb: 'Any number of equal sides: hexagons for honeycomb, octagons for gems.',
    defaults: { w: 180, h: 180, fill: '#7b61ff', sides: 6 },
    params: [range('sides', 'Sides', 3, 12)],
    parts: (p) => {
      const pts = [];
      for (let i = 0; i < p.sides; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / p.sides;
        pts.push([(Math.cos(a) * p.w) / 2, (Math.sin(a) * p.h) / 2]);
      }
      return [{ d: polygon(pts) }];
    },
  },

  star: {
    label: 'Star', category: 'Shapes',
    blurb: 'Change the points and the inner size to go from sparkle to starfish.',
    defaults: { w: 180, h: 180, fill: '#ffce3a', points: 5, inner: 0.45 },
    params: [range('points', 'Points', 3, 16), range('inner', 'Inner size', 0.1, 0.95, 0.01)],
    parts: (p) => {
      const pts = [];
      for (let i = 0; i < p.points * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / p.points;
        const k = i % 2 ? p.inner : 1;
        pts.push([(Math.cos(a) * p.w * k) / 2, (Math.sin(a) * p.h * k) / 2]);
      }
      return [{ d: polygon(pts) }];
    },
  },

  heart: {
    label: 'Heart', category: 'Shapes',
    blurb: 'A classic heart. Squash it wide for a cute, chubby look.',
    defaults: { w: 200, h: 180, fill: '#ff4f87' },
    params: [],
    parts: (p) => [{
      d: sc([
        ['M', 0, 1], ['C', -0.55, 0.6, -1, 0.2, -1, -0.35], ['C', -1, -0.75, -0.7, -1, -0.5, -1],
        ['C', -0.25, -1, -0.05, -0.85, 0, -0.6], ['C', 0.05, -0.85, 0.25, -1, 0.5, -1],
        ['C', 0.7, -1, 1, -0.75, 1, -0.35], ['C', 1, 0.2, 0.55, 0.6, 0, 1], ['Z'],
      ], p.w / 2, p.h / 2),
    }],
  },

  petal: {
    label: 'Petal / leaf', category: 'Shapes',
    blurb: 'Pointed at both ends. Spin copies around a center to make a flower.',
    defaults: { w: 90, h: 200, fill: '#ff8fab', fullness: 1 },
    params: [range('fullness', 'Fullness', 0.3, 1.6, 0.01)],
    parts: (p) => {
      const k = 1.33 * p.fullness;
      return [{ d: sc([['M', 0, -1], ['C', k, -0.6, k, 0.6, 0, 1], ['C', -k, 0.6, -k, -0.6, 0, -1], ['Z']], p.w / 2, p.h / 2) }];
    },
  },

  drop: {
    label: 'Drop', category: 'Shapes',
    blurb: 'A teardrop: raindrops, flames, ghost arms and paisley.',
    defaults: { w: 120, h: 170, fill: '#00b4d8' },
    params: [],
    parts: (p) => [{
      d: sc([
        ['M', 0, -1], ['C', 0.35, -0.45, 1, -0.05, 1, 0.35], ['C', 1, 0.75, 0.55, 1, 0, 1],
        ['C', -0.55, 1, -1, 0.75, -1, 0.35], ['C', -1, -0.05, -0.35, -0.45, 0, -1], ['Z'],
      ], p.w / 2, p.h / 2),
    }],
  },

  egg: {
    label: 'Egg', category: 'Shapes',
    blurb: 'Rounder at the bottom than the top. Clip patterns inside it to decorate.',
    defaults: { w: 240, h: 310, fill: '#ffc8dd', pointy: 0.3 },
    params: [range('pointy', 'Pointy top', 0, 1, 0.01)],
    parts: (p) => {
      const a = 0.6 - p.pointy * 0.4;
      return [{
        d: sc([
          ['M', 0, -1], ['C', a, -1, 0.95, -0.25, 0.95, 0.25], ['C', 0.95, 0.75, 0.55, 1, 0, 1],
          ['C', -0.55, 1, -0.95, 0.75, -0.95, 0.25], ['C', -0.95, -0.25, -a, -1, 0, -1], ['Z'],
        ], p.w / 2, p.h / 2),
      }];
    },
  },

  moon: {
    label: 'Moon', category: 'Shapes',
    blurb: 'A crescent. Thin for a new moon, thick for almost full.',
    defaults: { w: 160, h: 160, fill: '#fff1a8', thickness: 0.55 },
    params: [range('thickness', 'Thickness', 0.05, 0.95, 0.01)],
    parts: (p) => {
      const sx = p.w / 2, sy = p.h / 2, k = 1 - p.thickness;
      return [{ d: `M0 ${r2(-sy)}A${r2(sx)} ${r2(sy)} 0 0 0 0 ${r2(sy)}A${r2(sx * k)} ${r2(sy)} 0 0 1 0 ${r2(-sy)}Z` }];
    },
  },

  ring: {
    label: 'Ring', category: 'Shapes',
    blurb: 'A donut. Use it for halos, wheels, bubbles and planet rings.',
    defaults: { w: 200, h: 200, fill: '#ffce3a', thickness: 0.25 },
    params: [range('thickness', 'Thickness', 0.03, 0.95, 0.01)],
    parts: (p) => {
      const k = 1 - p.thickness;
      return [{ d: ellipsePath(p.w / 2, p.h / 2) + ellipsePath((p.w / 2) * k, (p.h / 2) * k) }];
    },
  },

  wing: {
    label: 'Wing', category: 'Shapes',
    blurb: 'A butterfly wing, attached on its left edge. Mirror it for the other side.',
    defaults: { w: 300, h: 330, fill: '#ff7eb6', lower: 1 },
    params: [range('lower', 'Lower wing size', 0.4, 1.4, 0.01)],
    parts: (p) => {
      const L = p.lower;
      const q = (x, y) => [-1 + (x + 1) * L, y * L];
      const cmds = [
        ['M', -1, 0], ['C', -0.6, -1.1, 0.6, -1.25, 1, -0.85], ['C', 1.15, -0.5, 0.7, -0.1, -0.1, 0.05],
        ['C', ...q(0.55, 0.2), ...q(0.85, 0.65), ...q(0.55, 0.95)],
        ['C', ...q(0.25, 1.2), ...q(-0.55, 0.65), -1, 0], ['Z'],
      ];
      return [{ d: sc(cmds, p.w / 2, p.h / 2) }];
    },
  },

  ghost: {
    label: 'Ghost', category: 'Shapes',
    blurb: 'A friendly ghost body with a wavy hem. Add a Face block on top.',
    defaults: { w: 260, h: 320, fill: '#ffffff', stroke: '#221f4f', waves: 5, wiggle: 0.2 },
    params: [range('waves', 'Waves along the bottom', 2, 10), range('wiggle', 'Wave depth', 0.02, 0.4, 0.01)],
    parts: (p) => {
      const sx = p.w / 2, sy = p.h / 2, bottom = 0.78;
      let d = `M${r2(-sx)} ${r2(-0.1 * sy)}A${r2(sx)} ${r2(0.9 * sy)} 0 0 1 ${r2(sx)} ${r2(-0.1 * sy)}L${r2(sx)} ${r2(bottom * sy)}`;
      for (let i = 0; i < p.waves; i++) {
        const x0 = 1 - (i * 2) / p.waves, x1 = 1 - ((i + 1) * 2) / p.waves;
        d += `Q${r2(((x0 + x1) / 2) * sx)} ${r2((bottom + p.wiggle * 2) * sy)} ${r2(x1 * sx)} ${r2(bottom * sy)}`;
      }
      return [{ d: d + 'Z' }];
    },
  },

  blob: {
    label: 'Blob', category: 'Shapes',
    blurb: 'A soft, wobbly shape made from random bumps. Every seed is a new blob.',
    defaults: { w: 220, h: 200, fill: '#a7e08b', bumps: 7, wobble: 0.25, seed: 3 },
    params: [range('bumps', 'Bumps', 4, 16), range('wobble', 'Wobble', 0, 0.6, 0.01), seed()],
    parts: (p) => {
      const rand = rng(p.seed), pts = [];
      for (let i = 0; i < p.bumps; i++) {
        const a = (i / p.bumps) * Math.PI * 2, k = 1 + (rand() - 0.5) * 2 * p.wobble;
        pts.push([(Math.cos(a) * k * p.w) / 2, (Math.sin(a) * k * p.h) / 2]);
      }
      return [{ d: smoothClosed(pts) }];
    },
  },

  cloud: {
    label: 'Cloud', category: 'Shapes',
    blurb: 'Puffy bumps on top, soft curve underneath.',
    defaults: { w: 260, h: 140, fill: '#ffffff', puffs: 4 },
    params: [range('puffs', 'Puffs', 2, 8)],
    parts: (p) => {
      const sx = p.w / 2, sy = p.h / 2, pts = [];
      for (let i = 0; i <= p.puffs; i++) {
        const a = Math.PI + (i * Math.PI) / p.puffs;
        pts.push([Math.cos(a) * sx, (0.55 + Math.sin(a) * 0.9) * sy]);
      }
      let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const rr = (Math.hypot(bx - ax, by - ay) / 2) * 1.02;
        d += `A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(bx)} ${r2(by)}`;
      }
      d += `A${r2(sx)} ${r2(0.25 * sy)} 0 0 1 ${r2(-sx)} ${r2(0.55 * sy)}Z`;
      return [{ d }];
    },
  },

  // ===== Lines =====
  line: {
    label: 'Straight line', category: 'Lines',
    blurb: 'A single stroke. Width is its length; the outline width is its thickness.',
    defaults: { ...LINE, w: 300, h: 20 },
    params: [],
    parts: (p) => [{ d: `M${r2(-p.w / 2)} 0L${r2(p.w / 2)} 0`, kind: 'line' }],
  },

  curve: {
    label: 'Curve', category: 'Lines',
    blurb: 'A bendy line from bottom-left to top-right. Antennae, stems, whiskers, hair.',
    defaults: { ...LINE, w: 160, h: 160, bend: 0.4 },
    params: [range('bend', 'Bend', -1, 1, 0.01)],
    parts: (p) => {
      const len = Math.hypot(p.w, p.h) || 1;
      const nx = p.h / len, ny = p.w / len, k = (p.bend * len) / 2;
      return [{
        d: `M${r2(-p.w / 2)} ${r2(p.h / 2)}Q${r2(nx * k)} ${r2(ny * k)} ${r2(p.w / 2)} ${r2(-p.h / 2)}`,
        kind: 'line',
      }];
    },
  },

  arc: {
    label: 'Arc', category: 'Lines',
    blurb: 'Part of an oval outline: smiles, rainbows, eyebrows. 360° makes a full ring.',
    defaults: { ...LINE, w: 240, h: 240, sweep: 180 },
    params: [range('sweep', 'How much of the circle', 10, 360)],
    parts: (p) => {
      const n = Math.max(8, Math.round(p.sweep / 5)), pts = [];
      const a0 = ((-90 - p.sweep / 2) * Math.PI) / 180, a1 = ((-90 + p.sweep / 2) * Math.PI) / 180;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([(Math.cos(a) * p.w) / 2, (Math.sin(a) * p.h) / 2]);
      }
      return [{ d: polyline(pts) + (p.sweep >= 360 ? 'Z' : ''), kind: 'line' }];
    },
  },

  wave: {
    label: 'Wave', category: 'Lines',
    blurb: 'A smooth up-and-down line. Garlands, water, ribbons, hair.',
    defaults: { ...LINE, w: 320, h: 60, cycles: 3 },
    params: [range('cycles', 'Waves', 0.5, 12, 0.5)],
    parts: (p) => {
      const n = Math.ceil(p.cycles * 24), pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([-p.w / 2 + t * p.w, (Math.sin(t * p.cycles * Math.PI * 2) * p.h) / 2]);
      }
      return [{ d: polyline(pts), kind: 'line' }];
    },
  },

  zigzag: {
    label: 'Zigzag', category: 'Lines',
    blurb: 'Sharp ups and downs. Easter egg bands, lightning, crowns, teeth.',
    defaults: { ...LINE, w: 320, h: 60, peaks: 6 },
    params: [range('peaks', 'Peaks', 1, 24)],
    parts: (p) => {
      const pts = [];
      for (let i = 0; i <= p.peaks * 2; i++) {
        pts.push([-p.w / 2 + (i * p.w) / (p.peaks * 2), i % 2 ? -p.h / 2 : p.h / 2]);
      }
      return [{ d: polyline(pts), kind: 'line' }];
    },
  },

  spiral: {
    label: 'Spiral', category: 'Lines',
    blurb: 'A line that winds outward from the center. Snails, swirls, cinnamon rolls.',
    defaults: { ...LINE, w: 260, h: 260, turns: 4, growth: 1 },
    params: [range('turns', 'Turns', 1, 12, 0.5), range('growth', 'Opening speed', 0.4, 2.5, 0.01, 'Above 1, the gaps widen as it grows.')],
    parts: (p) => {
      const n = Math.ceil(p.turns * 48), pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = t * p.turns * Math.PI * 2, r = Math.pow(t, p.growth);
        pts.push([(Math.cos(a) * r * p.w) / 2, (Math.sin(a) * r * p.h) / 2]);
      }
      return [{ d: polyline(pts), kind: 'line' }];
    },
  },

  // ===== Algorithms (generators) =====
  tree: {
    label: 'Fractal tree', category: 'Algorithms',
    blurb: 'One rule, repeated: every branch splits into smaller branches.',
    defaults: {
      w: 520, h: 620, fill: '#7bc96f', stroke: '#5b3a29', strokeWidth: 24,
      depth: 8, angle: 25, ratio: 0.72, branches: 2, bend: 0, randomness: 0.2, leaf: 9, seed: 4,
    },
    params: [
      range('depth', 'Levels of branching', 1, 11, 1, 'Each level doubles the tips. Go slowly above 9.'),
      range('angle', 'Branch angle', 0, 90),
      range('ratio', 'Each branch is this much shorter', 0.4, 0.9, 0.01),
      range('branches', 'Branches per split', 2, 4),
      range('bend', 'Wind', -30, 30),
      range('randomness', 'Natural randomness', 0, 1, 0.01),
      range('leaf', 'Leaf size (0 = bare)', 0, 40),
      seed(),
    ],
    parts: (p) => {
      const levels = [], leaves = [], rand = rng(p.seed);
      const spread = (p.angle * Math.PI) / 180, bend = (p.bend * Math.PI) / 180;
      let segs = 0;
      const branch = (x, y, ang, len, lvl) => {
        if (segs++ > 16000) return;
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        (levels[lvl] ||= []).push(`M${r2(x)} ${r2(y)}L${r2(x2)} ${r2(y2)}`);
        if (lvl >= p.depth - 1) {
          if (p.leaf > 0) leaves.push(ellipsePath(p.leaf, p.leaf, x2, y2));
          return;
        }
        for (let i = 0; i < p.branches; i++) {
          const t = p.branches === 1 ? 0 : (i / (p.branches - 1)) * 2 - 1;
          const jitter = (rand() - 0.5) * p.randomness * spread * 1.2;
          const shrink = 1 - rand() * p.randomness * 0.35;
          branch(x2, y2, ang + t * spread + jitter + bend, len * p.ratio * shrink, lvl + 1);
        }
      };
      branch(0, p.h / 2, -Math.PI / 2, p.h * 0.28, 0);
      const parts = levels.map((ds, i) => ({
        d: ds.join(''), kind: 'line', sw: Math.max(0.06, Math.pow((p.depth - i) / p.depth, 1.6)),
      }));
      if (leaves.length) parts.push({ d: leaves.join(''), noStroke: true });
      return parts;
    },
  },

  crystal: {
    label: 'Snowflake arm', category: 'Algorithms',
    blurb: 'One arm of an ice crystal that grows side branches. Spin it 6 times for a snowflake.',
    defaults: { w: 260, h: 640, fill: '#ffffff', stroke: '#ffffff', strokeWidth: 10, depth: 3, sides: 3, angle: 60, ratio: 0.5, tip: 14 },
    params: [
      range('depth', 'Branch levels', 1, 4),
      range('sides', 'Side branches', 1, 5),
      range('angle', 'Branch angle', 20, 85),
      range('ratio', 'Sub-branch size', 0.2, 0.9, 0.01),
      range('tip', 'Tip crystal size', 0, 50),
    ],
    parts: (p) => {
      const levels = [], tips = [];
      const arm = (x, y, ang, len, lvl) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        (levels[lvl] ||= []).push(`M${r2(x)} ${r2(y)}L${r2(x2)} ${r2(y2)}`);
        if (lvl === 0 && p.tip > 0) {
          const s = p.tip, c = Math.cos(ang), si = Math.sin(ang);
          const pt = (u, v) => [x2 + c * u - si * v, y2 + si * u + c * v];
          tips.push(polygon([pt(s * 1.3, 0), pt(0, s * 0.8), pt(-s * 1.3, 0), pt(0, -s * 0.8)]));
        }
        if (lvl >= p.depth - 1) return;
        for (let k = 1; k <= p.sides; k++) {
          const t = 0.2 + (0.65 * k) / p.sides;
          const bx = x + Math.cos(ang) * len * t, by = y + Math.sin(ang) * len * t;
          const base = lvl === 0 ? p.w / 2 : len * p.ratio;
          const blen = base * (1.15 - t);
          const a = (p.angle * Math.PI) / 180;
          arm(bx, by, ang + a, blen, lvl + 1);
          arm(bx, by, ang - a, blen, lvl + 1);
        }
      };
      arm(0, 0, -Math.PI / 2, p.h / 2, 0);
      const parts = levels.map((ds, i) => ({ d: ds.join(''), kind: 'line', sw: Math.pow(0.62, i) }));
      if (tips.length) parts.push({ d: tips.join(''), noStroke: true });
      return parts;
    },
  },

  koch: {
    label: 'Koch snowflake', category: 'Algorithms',
    blurb: 'Replace every straight edge with a bumpy edge, again and again. A famous fractal.',
    defaults: { w: 360, h: 360, fill: '#90e0ef', depth: 3 },
    params: [range('depth', 'Levels', 0, 5)],
    parts: (p) => {
      let pts = [0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        return [Math.cos(a), Math.sin(a)];
      });
      const c = Math.cos(-Math.PI / 3), s = Math.sin(-Math.PI / 3);
      for (let d = 0; d < p.depth; d++) {
        const next = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const dx = (b[0] - a[0]) / 3, dy = (b[1] - a[1]) / 3;
          const p1 = [a[0] + dx, a[1] + dy], p2 = [a[0] + 2 * dx, a[1] + 2 * dy];
          next.push(a, p1, [p1[0] + dx * c - dy * s, p1[1] + dx * s + dy * c], p2);
        }
        pts = next;
      }
      return [{ d: polygon(pts.map(([x, y]) => [(x * p.w) / 2, (y * p.h) / 2])) }];
    },
  },

  sierpinski: {
    label: 'Sierpinski triangle', category: 'Algorithms',
    blurb: 'Cut the middle out of a triangle, then do the same to each smaller triangle.',
    defaults: { w: 380, h: 330, fill: '#7b61ff', depth: 4 },
    params: [range('depth', 'Levels', 0, 7)],
    parts: (p) => {
      const out = [];
      const tri = (a, b, c, d) => {
        if (d === 0) { out.push(polygon([a, b, c])); return; }
        const m = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
        const ab = m(a, b), bc = m(b, c), ca = m(c, a);
        tri(a, ab, ca, d - 1); tri(ab, b, bc, d - 1); tri(ca, bc, c, d - 1);
      };
      tri([0, -p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, p.h / 2], p.depth);
      return [{ d: out.join('') }];
    },
  },

  sunflower: {
    label: 'Seed spiral', category: 'Algorithms',
    blurb: 'Dots placed by the golden angle (137.5°), the way sunflowers pack their seeds.',
    defaults: { w: 260, h: 260, fill: '#8a5a2b', count: 300, angle: 137.5, dot: 0.9 },
    params: [
      range('count', 'Seeds', 10, 1500),
      range('angle', 'Turn between seeds (degrees)', 120, 160, 0.1, 'Try 137.5, then nudge it and watch the pattern break.'),
      range('dot', 'Seed size', 0.2, 1.6, 0.01),
    ],
    parts: (p) => {
      const c = p.w / 2 / Math.sqrt(p.count), ds = [], ar = (p.angle * Math.PI) / 180, k = p.h / p.w;
      for (let i = 0; i < p.count; i++) {
        const r = c * Math.sqrt(i + 0.5), a = i * ar;
        const rad = c * p.dot * 0.5 * (0.5 + 0.5 * Math.sqrt(i / p.count));
        ds.push(ellipsePath(rad, rad, Math.cos(a) * r, Math.sin(a) * r * k));
      }
      return [{ d: ds.join('') }];
    },
  },

  rays: {
    label: 'Sunburst', category: 'Algorithms',
    blurb: 'Pointed rays around a center. Suns, sparkles, starbursts, comic-book pops.',
    defaults: { w: 420, h: 420, fill: '#ffce3a', count: 16, inner: 0.35, thickness: 0.6 },
    params: [range('count', 'Rays', 3, 48), range('inner', 'Hole in the middle', 0, 0.9, 0.01), range('thickness', 'Ray thickness', 0.05, 1, 0.01)],
    parts: (p) => {
      const out = [], sx = p.w / 2, sy = p.h / 2;
      for (let i = 0; i < p.count; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / p.count, hw = (Math.PI / p.count) * p.thickness;
        out.push(polygon([
          [Math.cos(a - hw) * p.inner * sx, Math.sin(a - hw) * p.inner * sy],
          [Math.cos(a) * sx, Math.sin(a) * sy],
          [Math.cos(a + hw) * p.inner * sx, Math.sin(a + hw) * p.inner * sy],
        ]));
      }
      return [{ d: out.join('') }];
    },
  },

  pattern: {
    label: 'Pattern fill', category: 'Algorithms',
    blurb: 'Rows of stripes, dots, zigzags or waves. Clip it inside another block to decorate it.',
    defaults: { w: 300, h: 300, fill: '#a2d2ff', stroke: '#ff5c8a', strokeWidth: 8, style: 'stripes', rows: 6, thickness: 0.4 },
    params: [
      select('style', 'Style', [['stripes', 'Stripes'], ['checks', 'Checkerboard'], ['dots', 'Polka dots'], ['zigzag', 'Zigzags'], ['waves', 'Waves'], ['scallops', 'Scallops']]),
      range('rows', 'Rows', 1, 24),
      range('thickness', 'Thickness', 0.05, 1, 0.01),
    ],
    parts: (p) => {
      const W = p.w, H = p.h, x0 = -W / 2, y0 = -H / 2, bandH = H / p.rows;
      const cols = Math.max(1, Math.round((p.rows * W) / H)), cellW = W / cols;
      const fills = [], lines = [];
      for (let r = 0; r < p.rows; r++) {
        const cy = y0 + (r + 0.5) * bandH;
        if (p.style === 'stripes') {
          const t = bandH * p.thickness;
          fills.push(polygon([[x0, cy - t / 2], [x0 + W, cy - t / 2], [x0 + W, cy + t / 2], [x0, cy + t / 2]]));
        } else if (p.style === 'checks') {
          for (let c = (r % 2); c < cols; c += 2) {
            const x = x0 + c * cellW, y = y0 + r * bandH;
            fills.push(polygon([[x, y], [x + cellW, y], [x + cellW, y + bandH], [x, y + bandH]]));
          }
        } else if (p.style === 'dots') {
          const rad = (Math.min(cellW, bandH) / 2) * p.thickness, off = r % 2 ? cellW / 2 : 0;
          for (let c = -1; c <= cols; c++) fills.push(ellipsePath(rad, rad, x0 + (c + 0.5) * cellW + off, cy));
        } else if (p.style === 'zigzag') {
          const pts = [], amp = (bandH * p.thickness) / 2;
          for (let i = 0; i <= cols * 2; i++) pts.push([x0 + (i * cellW) / 2, cy + (i % 2 ? -amp : amp)]);
          lines.push(polyline(pts));
        } else if (p.style === 'waves') {
          const pts = [], amp = (bandH * p.thickness) / 2, n = cols * 16;
          for (let i = 0; i <= n; i++) pts.push([x0 + (i * W) / n, cy + Math.sin((i / n) * cols * Math.PI * 2) * amp]);
          lines.push(polyline(pts));
        } else {
          let d = `M${r2(x0)} ${r2(cy)}`;
          for (let c = 0; c < cols; c++) {
            const rr = cellW / 2;
            d += `A${r2(rr)} ${r2(rr * p.thickness * 1.6)} 0 0 0 ${r2(x0 + (c + 1) * cellW)} ${r2(cy)}`;
          }
          lines.push(d);
        }
      }
      const parts = [];
      if (fills.length) parts.push({ d: fills.join(''), noStroke: true });
      if (lines.length) parts.push({ d: lines.join(''), kind: 'line' });
      return parts;
    },
  },

  // ===== Pen =====
  stroke: {
    label: 'Pen stroke', category: 'Lines',
    blurb: 'A line you drew by hand with the Pen, smoothed out. Close it to fill it with color.',
    defaults: {
      w: 220, h: 160, fill: '#ff5c8a', stroke: '#221f4f', strokeWidth: 8, closed: false, smooth: 0.6,
      points: [[-0.5, 0.3], [-0.25, -0.35], [0, 0.2], [0.25, -0.4], [0.5, 0.25]],
    },
    params: [toggle('closed', 'Close and fill'), range('smooth', 'Smoothing', 0, 1, 0.05)],
    parts: (p) => {
      const pts = (Array.isArray(p.points) ? p.points : []).map(([x, y]) => [x * p.w, y * p.h]);
      if (pts.length < 2) return [];
      return [{ d: smoothPath(pts, p.smooth, p.closed), kind: p.closed ? 'fill' : 'line' }];
    },
  },

  // ===== Characters =====
  face: {
    label: 'Cute face', category: 'Characters',
    blurb: 'Eyes, mouth and rosy cheeks. Drop it on any shape to bring it to life.',
    defaults: { w: 150, h: 100, fill: '#221f4f', stroke: '#221f4f', strokeWidth: 5, expression: 'happy', blush: true, eyes: 1 },
    params: [
      select('expression', 'Expression', [['happy', 'Happy'], ['joy', 'Joyful'], ['surprised', 'Surprised'], ['sleepy', 'Sleepy'], ['wink', 'Wink'], ['cat', 'Cat mouth']]),
      range('eyes', 'Eye size', 0.4, 2, 0.01),
      toggle('blush', 'Rosy cheeks'),
    ],
    parts: (p) => {
      const sx = p.w / 2, sy = p.h / 2, er = Math.min(p.w, p.h) * 0.09 * p.eyes;
      const ex = sx * 0.62, ey = -sy * 0.15, m = sx * 0.22, my = sy * 0.3;
      const fills = [], shines = [], lines = [];
      const round = (x) => { fills.push(ellipsePath(er, er * 1.15, x, ey)); shines.push(ellipsePath(er * 0.34, er * 0.34, x + er * 0.35, ey - er * 0.45)); };
      const caret = (x) => lines.push(`M${r2(x - er)} ${r2(ey + er * 0.3)}Q${r2(x)} ${r2(ey - er * 1.3)} ${r2(x + er)} ${r2(ey + er * 0.3)}`);
      const shut = (x) => lines.push(`M${r2(x - er)} ${r2(ey)}Q${r2(x)} ${r2(ey + er * 1.2)} ${r2(x + er)} ${r2(ey)}`);
      const smile = (k = 1) => lines.push(`M${r2(-m * k)} ${r2(my)}Q0 ${r2(my + m * 0.9 * k)} ${r2(m * k)} ${r2(my)}`);
      switch (p.expression) {
        case 'joy': caret(-ex); caret(ex); fills.push(`M${r2(-m)} ${r2(my - m * 0.1)}Q0 ${r2(my + m * 1.6)} ${r2(m)} ${r2(my - m * 0.1)}Z`); break;
        case 'surprised': round(-ex); round(ex); lines.push(ellipsePath(m * 0.35, m * 0.45, 0, my + m * 0.3)); break;
        case 'sleepy': shut(-ex); shut(ex); smile(0.6); break;
        case 'wink': round(-ex); caret(ex); smile(); break;
        case 'cat': round(-ex); round(ex); lines.push(`M${r2(-m)} ${r2(my)}Q${r2(-m / 2)} ${r2(my + m * 0.7)} 0 ${r2(my)}Q${r2(m / 2)} ${r2(my + m * 0.7)} ${r2(m)} ${r2(my)}`); break;
        default: round(-ex); round(ex); smile();
      }
      const parts = [];
      if (p.blush) parts.push({ d: ellipsePath(sx * 0.2, sy * 0.13, -sx * 0.9, sy * 0.22) + ellipsePath(sx * 0.2, sy * 0.13, sx * 0.9, sy * 0.22), color: '#ff8fab', opacity: 0.65, noStroke: true });
      if (fills.length) parts.push({ d: fills.join(''), noStroke: true });
      if (shines.length) parts.push({ d: shines.join(''), color: '#ffffff', noStroke: true });
      if (lines.length) parts.push({ d: lines.join(''), kind: 'line' });
      return parts;
    },
  },
};

/** Catmull-Rom spline through points, written as cubic Bezier curves. tension 0 = straight lines. */
export function smoothPath(pts, tension = 0.6, closed = false) {
  const n = pts.length, k = tension / 6 * 1.0;
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

export const CATEGORIES = [
  { id: 'Shapes', blurb: 'Simple solid shapes. Most drawings are just these, stacked.' },
  { id: 'Lines', blurb: 'Strokes. Their color and thickness come from the outline settings.' },
  { id: 'Algorithms', blurb: 'Blocks that follow a rule to draw something complex for you.' },
  { id: 'Characters', blurb: 'Personality in one block.' },
];
