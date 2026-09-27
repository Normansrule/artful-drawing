// Live examples for the Learn page.
// Every <figure data-demo="name"> is filled with a picture drawn by the same
// engine the studio uses, plus a link that opens that exact picture for editing.

import { makeBlock as B, blankScene } from './model.js';
import { renderSceneSVG, renderSceneInner, sceneStats } from './render.js';
import { encodeScene } from './share.js';
import { esc } from './util.js';
import { playBloom } from './bloom.js';
import { enhanceReadingPage } from './fx.js';

const R = (mode, o = {}) => ({ mode, ...o });
const paper = { mode: 'solid', c1: '#ffffff', c2: '#ffffff', angle: 90 };
const soft = (c1, c2) => ({ mode: 'linear', c1, c2, angle: 180 });
const night = { mode: 'radial', c1: '#3a4a8c', c2: '#141a3a', angle: 90 };
const S = (blocks, background = paper) => ({ ...blankScene(), background, blocks });

export const DEMOS = {
  // ---- blocks ----
  'one-block': () => S([B('circle', { w: 360, h: 360, fill: '#ffce3a' })]),
  'two-blocks': () => S([B('circle', { w: 360, h: 360, fill: '#ffce3a' }), B('face', { y: 410, w: 190, h: 120 })]),
  'stacked': () => S([
    B('circle', { y: 690, w: 300, h: 40, fill: '#000000', opacity: 0.15 }),
    B('ghost', { y: 400, w: 380, h: 480, fillMode: 'radial', fill: '#ffffff', fill2: '#d9d2ff', stroke: '#221f4f', strokeWidth: 8 }),
    B('face', { y: 350, w: 190, h: 120 }),
  ], soft('#e7f0ff', '#f8e9ff')),

  // ---- mirror ----
  'mirror-off': () => S([B('wing', { x: 560, y: 400, w: 300, h: 360, fillMode: 'linear', fill: '#ff7eb6', fill2: '#7b61ff', gradAngle: 50, stroke: '#221f4f', strokeWidth: 8 })], soft('#e8f6ff', '#fff0f7')),
  'mirror-on': () => S([
    B('wing', { x: 560, y: 400, w: 300, h: 360, fillMode: 'linear', fill: '#ff7eb6', fill2: '#7b61ff', gradAngle: 50, stroke: '#221f4f', strokeWidth: 8, repeats: [R('mirror')] }),
    B('circle', { y: 420, w: 44, h: 250, fill: '#221f4f' }),
  ], soft('#e8f6ff', '#fff0f7')),
  'mirror-both': () => S([
    B('heart', { x: 560, y: 250, w: 200, h: 180, rot: 45, fill: '#ff4f87', repeats: [R('mirror', { axis: 'both' })] }),
    B('circle', { w: 110, h: 110, fill: '#ffce3a' }),
  ]),

  // ---- radial ----
  'radial-6': () => S([
    B('petal', { y: 260, w: 120, h: 260, fill: '#ff8fab', repeats: [R('radial', { count: 6 })] }),
    B('circle', { w: 130, h: 130, fill: '#ffce3a' }),
  ], soft('#fff8e6', '#ffe9f1')),
  'radial-12': () => S([
    B('petal', { y: 250, w: 90, h: 280, fill: '#ff5c8a', repeats: [R('radial', { count: 12, hueStep: 30 })] }),
    B('circle', { w: 110, h: 110, fill: '#ffffff' }),
  ], night),
  'kaleido': () => S([
    B('wing', { x: 470, y: 230, w: 150, h: 190, rot: 20, fill: '#13877e', repeats: [R('radial', { count: 8, kaleido: true, hueStep: 10 })] }),
    B('star', { w: 120, h: 120, fill: '#ffce3a', points: 8, inner: 0.5 }),
  ], soft('#effaf8', '#e6ecff')),

  // ---- step ----
  'step-tree': () => S([
    B('rect', { y: 650, w: 60, h: 90, fill: '#7a4b2a', radius: 0.15 }),
    B('triangle', { y: 540, w: 400, h: 200, fill: '#2fae66', repeats: [R('step', { count: 4, dy: -95, scale: 0.75 })] }),
  ], soft('#e6f4ff', '#ffffff')),
  'step-swirl': () => S([
    B('rect', { x: 400, y: 400, w: 520, h: 520, fillMode: 'none', stroke: '#7b61ff', strokeWidth: 6, radius: 0.1, repeats: [R('step', { count: 22, dx: 0, dy: 0, rot: 8, scale: 0.9, hueStep: 8 })] }),
  ]),
  'step-trail': () => S([
    B('circle', { x: 150, y: 620, w: 70, h: 70, fill: '#ff4f87', repeats: [R('step', { count: 9, dx: 62, dy: -48, scale: 1.08, hueStep: 22 })] }),
  ], soft('#fffaf0', '#f0f4ff')),

  // ---- grid ----
  'grid-plain': () => S([B('heart', { x: 175, y: 175, w: 110, h: 100, fill: '#ff4f87', repeats: [R('grid', { cols: 4, rows: 4, gapX: 150, gapY: 150 })] })], soft('#fff0f5', '#fff8e6')),
  'grid-brick': () => S([B('polygon', { x: 128, y: 85, w: 132, h: 132, fill: '#ffce3a', stroke: '#e0a100', strokeWidth: 5, sides: 6, repeats: [R('grid', { cols: 5, rows: 7, gapX: 121, gapY: 105, stagger: true, hueStep: 3 })] })]),

  'grid-stars': () => S([B('star', { x: 130, y: 130, w: 90, h: 90, fill: '#ff5c8a', inner: 0.45, repeats: [R('grid', { cols: 5, rows: 5, gapX: 135, gapY: 135, hueStep: 14 })] })], night),

  // ---- scatter ----
  'scatter-a': () => S([B('star', { w: 34, h: 34, fill: '#fff6c9', points: 4, inner: 0.35, repeats: [R('scatter', { count: 60, spreadX: 380, spreadY: 380, seed: 3, sizeVar: 0.7, rotVar: 20 })] })], night),
  'scatter-b': () => S([B('star', { w: 34, h: 34, fill: '#fff6c9', points: 4, inner: 0.35, repeats: [R('scatter', { count: 60, spreadX: 380, spreadY: 380, seed: 4, sizeVar: 0.7, rotVar: 20 })] })], night),
  'scatter-confetti': () => S([B('rect', { w: 22, h: 44, fill: '#ff4f87', radius: 0.3, repeats: [R('scatter', { count: 140, spreadX: 380, spreadY: 380, seed: 12, sizeVar: 0.5, rotVar: 180, hueVar: 180 })] })]),

  // ---- golden angle ----
  'golden-137': () => S([B('sunflower', { w: 700, h: 700, fill: '#8a5a2b', count: 500, angle: 137.5, dot: 0.9 })], soft('#fff3c4', '#ffe08a')),
  'golden-137-3': () => S([B('sunflower', { w: 700, h: 700, fill: '#8a5a2b', count: 500, angle: 137.3, dot: 0.9 })], soft('#fff3c4', '#ffe08a')),
  'golden-140': () => S([B('sunflower', { w: 700, h: 700, fill: '#8a5a2b', count: 500, angle: 140, dot: 0.9 })], soft('#fff3c4', '#ffe08a')),
  'golden-petals': () => S([
    B('petal', { x: 400, y: 400, w: 20, h: 40, fill: '#ff5c8a', repeats: [R('spiral', { count: 300, angle: 137.5, spacing: 20, growth: 'sqrt', scaleStep: 1.002, orient: true, hueStep: 0.2 })] }),
  ], night),
  'golden-dots': () => S([
    B('circle', { x: 400, y: 400, w: 16, h: 16, fill: '#ff5c8a', repeats: [R('spiral', { count: 400, angle: 137.5, spacing: 17.5, scaleStep: 1.002, hueStep: 0.9 })] }),
  ], { mode: 'solid', c1: '#130f2e', c2: '#130f2e', angle: 90 }),
  'galaxy': () => S([
    B('star', { x: 400, y: 400, w: 14, h: 14, fill: '#9fd8ff', points: 4, inner: 0.4, repeats: [R('spiral', { count: 90, angle: 8, spacing: 14.5, growth: 'linear', scaleStep: 1.008, hueStep: 2 }), R('radial', { count: 3, around: 'self' })] }),
  ], { mode: 'radial', c1: '#2a1e5c', c2: '#07051a', angle: 90 }),

  // ---- recursion ----
  'tree-2': () => S([B('tree', { y: 420, w: 520, h: 640, depth: 2, randomness: 0, leaf: 0 })]),
  'tree-5': () => S([B('tree', { y: 420, w: 520, h: 640, depth: 5, randomness: 0, leaf: 0 })]),
  'tree-9': () => S([B('tree', { y: 420, w: 520, h: 640, depth: 9, randomness: 0.25, leaf: 8 })], soft('#e9f6ff', '#fffbea')),
  'koch-0': () => S([B('koch', { w: 560, h: 560, depth: 0 })]),
  'koch-1': () => S([B('koch', { w: 560, h: 560, depth: 1 })]),
  'koch-4': () => S([B('koch', { w: 560, h: 560, depth: 4 })]),
  'sierpinski': () => S([B('sierpinski', { y: 430, w: 640, h: 560, depth: 5 })]),
  'crystal-arm': () => S([B('crystal', { w: 250, h: 620, strokeWidth: 12, depth: 3 })], night),
  'crystal': () => S([B('crystal', { w: 250, h: 620, strokeWidth: 12, depth: 3, repeats: [R('radial', { count: 6 })] })], night),

  // ---- clipping ----
  'clip-off': () => {
    const egg = B('egg', { id: 'egg', w: 380, h: 500, fill: '#ffc8dd' });
    return S([egg, B('pattern', { w: 500, h: 600, style: 'zigzag', fill: '#ffc8dd', stroke: '#7b61ff', rows: 7 })], soft('#effaf8', '#fff8e6'));
  },
  'clip-on': () => {
    const egg = B('egg', { id: 'egg', w: 380, h: 500, fill: '#ffc8dd' });
    return S([egg, B('pattern', { w: 500, h: 600, style: 'zigzag', fill: '#ffc8dd', stroke: '#7b61ff', rows: 7, clipTo: 'egg' })], soft('#effaf8', '#fff8e6'));
  },

  // ---- stacking repeats ----
  'stack-radial-step': () => S([
    B('circle', { y: 300, w: 60, h: 60, fill: '#13877e', repeats: [R('step', { count: 4, dy: -55, scale: 0.8, hueStep: 25 }), R('radial', { count: 10 })] }),
  ]),
  'stack-step-radial': () => S([
    B('circle', { y: 150, w: 60, h: 60, fill: '#13877e', repeats: [R('radial', { count: 10 }), R('step', { count: 4, scale: 0.7, hueStep: 25 })] }),
  ]),

  // ---- shape language ----
  'shape-round': () => S([B('blob', { w: 440, h: 380, fill: '#ffb3c7', bumps: 6, wobble: 0.15, seed: 2 }), B('face', { y: 420, w: 250, h: 160, expression: 'joy' })], soft('#fff0f5', '#ffffff')),
  'shape-square': () => S([B('rect', { w: 400, h: 400, fill: '#5ce1e6', radius: 0.05 }), B('face', { y: 390, w: 250, h: 150, expression: 'sleepy' })], soft('#eafcfd', '#ffffff')),
  'shape-spiky': () => S([B('star', { w: 460, h: 460, fill: '#ffce3a', points: 7, inner: 0.55 }), B('face', { y: 425, w: 200, h: 125, expression: 'surprised' })], soft('#fff8e0', '#ffffff')),

  // ---- baby schema (cuteness) ----
  'cute-no': () => S([B('rect', { y: 420, w: 260, h: 520, fill: '#b9b1ff', radius: 0.12 }), B('face', { y: 240, w: 110, h: 60, eyes: 0.6, blush: false })]),
  'cute-yes': () => S([B('circle', { y: 430, w: 480, h: 440, fill: '#b9b1ff' }), B('face', { y: 470, w: 250, h: 150, eyes: 1.5 })]),

  // ---- color ----
  'hue-walk': () => S([B('circle', { x: 116, y: 400, w: 64, h: 64, fill: '#ff4f5e', repeats: [R('step', { count: 8, dx: 71, dy: 0, scale: 1, hueStep: 40 })] })]),
  'value-steps': () => S([
    B('circle', { x: 130, y: 400, w: 110, h: 110, fill: '#1c2b6b' }),
    B('circle', { x: 265, y: 400, w: 110, h: 110, fill: '#33479e' }),
    B('circle', { x: 400, y: 400, w: 110, h: 110, fill: '#5670d1' }),
    B('circle', { x: 535, y: 400, w: 110, h: 110, fill: '#91a5ec' }),
    B('circle', { x: 670, y: 400, w: 110, h: 110, fill: '#d3dcfb' }),
  ]),
  'sat-steps': () => S([
    B('circle', { x: 130, y: 400, w: 110, h: 110, fill: '#8a8580' }),
    B('circle', { x: 265, y: 400, w: 110, h: 110, fill: '#a58568' }),
    B('circle', { x: 400, y: 400, w: 110, h: 110, fill: '#c0844f' }),
    B('circle', { x: 535, y: 400, w: 110, h: 110, fill: '#db8335' }),
    B('circle', { x: 670, y: 400, w: 110, h: 110, fill: '#f6821a' }),
  ]),
  'harmony-triad': () => S([
    B('rect', { x: 400, y: 400, w: 520, h: 520, fill: '#2f6fe0', radius: 0.08 }),
    B('circle', { x: 330, y: 340, w: 280, h: 280, fill: '#ffd23f' }),
    B('triangle', { x: 470, y: 490, w: 260, h: 230, fill: '#ff3b4f' }),
  ]),
  'harmony-comp': () => S([B('circle', { w: 420, h: 420, fill: '#1f6fd6' }), B('star', { w: 250, h: 250, fill: '#ff9a1f', inner: 0.45 })]),
  'harmony-analog': () => S([
    B('circle', { w: 500, h: 500, fill: '#13877e' }),
    B('circle', { w: 340, h: 340, fill: '#2bb39a' }),
    B('circle', { w: 180, h: 180, fill: '#8fd694' }),
  ]),

  // ---- composition ----
  'comp-center': () => S([B('moon', { w: 220, h: 220, rot: -25, fill: '#fff1a8', thickness: 0.45 }), B('circle', { y: 820, w: 1100, h: 260, fill: '#0c1330' })], night),
  'comp-thirds': () => S([B('moon', { x: 533, y: 267, w: 220, h: 220, rot: -25, fill: '#fff1a8', thickness: 0.45 }), B('circle', { y: 820, w: 1100, h: 260, fill: '#0c1330' }), B('ghost', { x: 250, y: 610, w: 120, h: 150, fill: '#ffffff', waves: 3, stroke: '#221f4f', strokeWidth: 0 }), B('face', { x: 250, y: 595, w: 64, h: 40, strokeWidth: 3 })], night),
};

// ------------------------------------------------------------------
// Playgrounds: live pictures with sliders, so you can feel what each number does.
// (The idea of explaining an algorithm by letting readers poke it comes from
// Transformer Explainer and LLM Visualization.)

const fmt = new Intl.NumberFormat('en-US');
const GOLDEN = 360 / ((1 + Math.sqrt(5)) / 2) ** 2; // 137.5077...

export const PLAYGROUNDS = {
  golden: {
    eyebrow: 'Playground', title: 'Find the golden angle',
    controls: [
      { key: 'angle', label: 'Turn between seeds (°)', min: 130, max: 145, step: 0.1, value: 135 },
      { key: 'count', label: 'Seeds', min: 20, max: 900, step: 1, value: 450 },
    ],
    build: (v) => S([B('sunflower', { w: 680, h: 680, fill: '#8a5a2b', count: v.count, angle: v.angle, dot: 0.9 })], soft('#fff3c4', '#ffe08a')),
    readout: (v) => {
      const d = Math.abs(v.angle - GOLDEN);
      if (d < 0.06) return `${v.angle}° is the golden angle (${GOLDEN.toFixed(3)}°). No two seeds line up, so the disc packs evenly all the way out.`;
      if (d < 1.2) return `${d.toFixed(1)}° away from golden. Curved spiral arms appear because every few turns the seeds almost line up.`;
      return `${d.toFixed(1)}° away from golden. Seeds line up into straight spokes with empty wedges between them. Slide toward 137.5°.`;
    },
  },
  radial: {
    eyebrow: 'Playground', title: 'Spin around, with and without a kaleidoscope', countShapes: true,
    controls: [
      { key: 'count', label: 'Copies', min: 1, max: 24, step: 1, value: 6 },
      { key: 'hue', label: 'Color shift per copy', min: 0, max: 60, step: 1, value: 0 },
      { key: 'kaleido', label: 'Kaleidoscope', options: [['off', 'Off'], ['on', 'On']], value: 'off' },
    ],
    build: (v) => S([
      B('wing', { x: 470, y: 235, w: 150, h: 190, rot: 20, fill: '#13877e', stroke: '#221f4f', strokeWidth: 3, repeats: [R('radial', { count: v.count, kaleido: v.kaleido === 'on', hueStep: v.hue })] }),
      B('star', { w: 110, h: 110, fill: '#ffce3a', points: Math.max(3, v.count), inner: 0.5 }),
    ], soft('#effaf8', '#e6ecff')),
    readout: (v) => v.count === 1
      ? 'One copy is just the original block. Add more copies.'
      : `${v.count} copies, each turned ${(360 / v.count).toFixed(1).replace(/\.0$/, '')}° from the last. ` +
        (v.kaleido === 'on' ? `Every other copy is mirrored too: dihedral symmetry, the symmetry of snowflakes.` : `Only turning, no mirroring: rotational symmetry, like a pinwheel.`),
  },
  tree: {
    eyebrow: 'Playground', title: 'Grow a fractal tree',
    controls: [
      { key: 'depth', label: 'Levels of branching', min: 1, max: 10, step: 1, value: 6 },
      { key: 'angle', label: 'Branch angle (°)', min: 0, max: 90, step: 1, value: 25 },
      { key: 'ratio', label: 'Each branch is this much shorter', min: 0.5, max: 0.85, step: 0.01, value: 0.72 },
      { key: 'randomness', label: 'Natural randomness', min: 0, max: 0.8, step: 0.01, value: 0.15 },
    ],
    build: (v) => S([B('tree', { y: 420, w: 540, h: 660, depth: v.depth, angle: v.angle, ratio: v.ratio, randomness: v.randomness, leaf: v.depth > 6 ? 8 : 0 })], soft('#e9f6ff', '#fffbea')),
    readout: (v) => `${v.depth} levels: ${fmt.format(2 ** v.depth)} branch tips and ${fmt.format(2 ** (v.depth + 1) - 1)} branches in all. One more level doubles the tips.`,
  },
  stack: {
    eyebrow: 'Playground', title: 'Swap the order of two repeats',
    controls: [
      { key: 'order', label: 'Order', options: [['step-first', 'Step, then Spin'], ['spin-first', 'Spin, then Step']], value: 'step-first' },
      { key: 'count', label: 'Spin copies', min: 3, max: 16, step: 1, value: 10 },
      { key: 'steps', label: 'Step copies', min: 1, max: 6, step: 1, value: 4 },
    ],
    build: (v) => {
      const spin = R('radial', { count: v.count });
      const step = v.order === 'step-first' ? R('step', { count: v.steps, dy: -55, scale: 0.8, hueStep: 25 }) : R('step', { count: v.steps, scale: 0.7, hueStep: 25 });
      return S([B('circle', { y: v.order === 'step-first' ? 300 : 150, w: 60, h: 60, fill: '#13877e', repeats: v.order === 'step-first' ? [step, spin] : [spin, step] })]);
    },
    readout: (v) => `${v.steps} × ${v.count} = ${v.steps * v.count} dots either way. ` +
      (v.order === 'step-first' ? 'Step builds one ray, then Spin copies the ray.' : 'Spin builds one ring, then Step copies the whole ring, smaller each time, pinned at the top dot.'),
  },
};

function playground(root) {
  const def = PLAYGROUNDS[root.dataset.playground];
  if (!def) return;
  const v = Object.fromEntries(def.controls.map((c) => [c.key, c.value]));
  const id = `pg-${root.dataset.playground}`;
  root.innerHTML = `<div class="pg-view"><svg viewBox="0 0 800 800" role="img" aria-labelledby="${id}-t ${id}-r"></svg></div>
    <div class="pg-controls">
      <span class="pg-eyebrow">${esc(def.eyebrow)}</span>
      <h3 class="pg-title" id="${id}-t">${esc(def.title)}</h3>
      <div class="pg-inputs"></div>
      <p class="pg-readout" id="${id}-r" aria-live="polite"></p>
      <div class="pg-actions"><button type="button" class="btn btn-small pg-bloom">▶ Bloom</button><a class="btn btn-small pg-open" href="studio.html">Open in studio →</a></div>
    </div>`;
  const svg = root.querySelector('svg'), inputs = root.querySelector('.pg-inputs');
  const readout = root.querySelector('.pg-readout'), open = root.querySelector('.pg-open');
  let stop = null, linkTimer = 0;
  const draw = () => {
    stop?.(); stop = null;
    const scene = def.build(v);
    svg.innerHTML = renderSceneInner(scene, { prefix: `${id}-` });
    const n = sceneStats(scene).shapes;
    readout.textContent = def.readout(v) + (def.countShapes ? ` ${fmt.format(n)} shapes drawn.` : '');
    clearTimeout(linkTimer);
    linkTimer = setTimeout(async () => { try { open.href = `studio.html#scene=${await encodeScene(scene)}`; } catch { /* keep plain link */ } }, 250);
    return scene;
  };
  for (const c of def.controls) {
    const wrap = document.createElement('div');
    if (c.options) {
      wrap.innerHTML = `<span class="label" style="font-size:.85rem;font-weight:700;display:block;margin-bottom:.3rem">${esc(c.label)}</span><div class="seg" role="group" aria-label="${esc(c.label)}">` +
        c.options.map(([val, lab]) => `<button type="button" data-val="${esc(val)}" aria-pressed="${val === v[c.key]}">${esc(lab)}</button>`).join('') + '</div>';
      wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        v[c.key] = b.dataset.val;
        wrap.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', o === b));
        draw();
      }));
    } else {
      const iid = `${id}-${c.key}`;
      wrap.innerHTML = `<label for="${iid}">${esc(c.label)} <output for="${iid}">${c.value}</output></label>
        <input type="range" id="${iid}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">`;
      const input = wrap.querySelector('input'), out = wrap.querySelector('output');
      input.addEventListener('input', () => { v[c.key] = Number(input.value); out.textContent = input.value; draw(); });
    }
    inputs.append(wrap);
  }
  root.querySelector('.pg-bloom').addEventListener('click', () => {
    const scene = draw();
    stop = playBloom(svg, scene, { prefix: `${id}-`, pace: 1.2, onDone: () => { stop = null; } });
  });
  draw();
}

async function fill(fig) {
  const name = fig.dataset.demo;
  const build = DEMOS[name];
  if (!build) { fig.textContent = `Missing demo: ${name}`; return; }
  const scene = build();
  const caption = fig.dataset.caption || '';
  const svg = renderSceneSVG(scene, { prefix: `d-${name}-`, title: caption || name });
  fig.innerHTML = svg + (caption ? `<figcaption>${esc(caption)}</figcaption>` : '');
  try {
    const code = await encodeScene(scene);
    const a = document.createElement('a');
    a.className = 'open-link';
    a.href = `studio.html#scene=${code}`;
    a.textContent = 'Open in studio →';
    a.setAttribute('aria-label', `Open ${caption || 'this example'} in the studio`);
    fig.append(a);
  } catch { /* old browser without compression streams: the picture still shows */ }
}

function heroStrip() {
  const strip = document.querySelector('[data-hero]');
  if (!strip) return;
  import('./templates.js').then(({ getTemplate }) => {
    const ids = strip.dataset.hero.split(',');
    strip.innerHTML = ids.map((id) => {
      const t = getTemplate(id.trim());
      if (!t) return '';
      return `<a href="studio.html#template=${esc(t.id)}" aria-label="Open the ${esc(t.name)} picture in the studio">${renderSceneSVG(t.build(), { prefix: `h-${t.id}-`, title: t.name })}</a>`;
    }).join('');
  });
}

if (typeof document !== 'undefined') { // lets tests import DEMOS and PLAYGROUNDS in Node
  document.querySelectorAll('[data-demo]').forEach(fill);
  document.querySelectorAll('[data-playground]').forEach(playground);
  heroStrip();
  enhanceReadingPage();
}
