// Smoke tests: every block, repeat, starter picture and Learn example renders
// to clean SVG. Run with `npm test` (Node 18 or newer, no dependencies).

import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, CATEGORIES } from '../js/shapes.js';
import { REPEATERS, MAX_COPIES, expandRepeats } from '../js/repeaters.js';
import { makeBlock, makeRepeat, blankScene, normalizeScene } from '../js/model.js';
import { renderSceneSVG, sceneStats } from '../js/render.js';
import { TEMPLATES, getTemplate } from '../js/templates.js';
import { encodeScene, decodeScene } from '../js/share.js';
import { bloomPlan, bloomReveal } from '../js/bloom.js';
import { DEMOS, PLAYGROUNDS } from '../js/learn.js';

const scene = (blocks, extra = {}) => ({ ...blankScene(), ...extra, blocks });
const clean = (svg, label) => {
  assert.ok(svg.startsWith('<svg'), `${label}: not an SVG`);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${label}: bad number in output`);
  assert.ok(svg.includes('<path'), `${label}: nothing drawn`);
};

test('every block type draws with its defaults', () => {
  for (const type of Object.keys(SHAPES)) clean(renderSceneSVG(scene([makeBlock(type)])), type);
});

test('every block belongs to a shelf category', () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const [type, def] of Object.entries(SHAPES)) assert.ok(ids.has(def.category), `${type} has unknown category ${def.category}`);
});

test('every block type draws at the edges of its slider ranges', () => {
  for (const [type, def] of Object.entries(SHAPES)) {
    for (const p of def.params.filter((q) => q.type === 'range')) {
      for (const v of [p.min, p.max]) clean(renderSceneSVG(scene([makeBlock(type, { [p.key]: v })])), `${type}.${p.key}=${v}`);
    }
  }
});

test('every repeat works on every block type', () => {
  for (const mode of Object.keys(REPEATERS)) {
    for (const type of Object.keys(SHAPES)) {
      const b = makeBlock(type, { x: 520, y: 300, repeats: [makeRepeat(mode)] });
      clean(renderSceneSVG(scene([b])), `${type} + ${mode}`);
      assert.ok(expandRepeats(b, scene([b])).length >= 1);
    }
  }
});

test('stacked repeats multiply and stop at the safety limit', () => {
  const b = makeBlock('circle', { repeats: [makeRepeat('radial', { count: 10 }), makeRepeat('step', { count: 4 })] });
  assert.equal(expandRepeats(b, scene([b])).length, 40);
  const huge = makeBlock('circle', { repeats: [makeRepeat('grid', { cols: 30, rows: 30 }), makeRepeat('radial', { count: 48 })] });
  assert.equal(expandRepeats(huge, scene([huge])).length, MAX_COPIES);
});

test('every starter picture renders cleanly', () => {
  assert.ok(TEMPLATES.length >= 10);
  for (const t of TEMPLATES) {
    const s = normalizeScene(t.build());
    clean(renderSceneSVG(s), t.id);
    assert.equal(getTemplate(t.id), t);
    assert.ok(sceneStats(s).shapes > 0);
  }
});

test('Learn page examples and playgrounds render cleanly', () => {
  for (const [name, build] of Object.entries(DEMOS)) clean(renderSceneSVG(build()), `demo ${name}`);
  for (const [name, pg] of Object.entries(PLAYGROUNDS)) {
    const v = Object.fromEntries(pg.controls.map((c) => [c.key, c.value]));
    clean(renderSceneSVG(pg.build(v)), `playground ${name}`);
    assert.equal(typeof pg.readout(v), 'string');
  }
});

test('broken project files are repaired, not rejected', () => {
  const s = normalizeScene({ background: { mode: 'weird', c1: 'red' }, blocks: [{ type: 'nope' }, { type: 'circle', fill: 'blue', clipTo: 'missing' }, null] });
  assert.equal(s.blocks.length, 1);
  assert.equal(s.blocks[0].clipTo, '');
  assert.match(s.blocks[0].fill, /^#[0-9a-f]{6}$/i);
  assert.equal(s.background.mode, 'solid');
  assert.deepEqual(normalizeScene('garbage').blocks, []);
});

test('share links round-trip a picture exactly', async () => {
  const s = normalizeScene(getTemplate('christmas-tree').build());
  const code = await encodeScene(s);
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'share code must be safe in a URL');
  assert.deepEqual(await decodeScene(code), JSON.parse(JSON.stringify(s)));
});

test('the bloom timeline starts empty and ends complete', () => {
  const s = getTemplate('butterfly').build();
  const plan = bloomPlan(s);
  assert.ok(plan.duration > 1 && plan.duration < 15);
  const start = bloomReveal(plan, 0), end = bloomReveal(plan, plan.duration);
  s.blocks.forEach((b, i) => {
    const n = expandRepeats(b, s).length;
    for (let c = 0; c < n; c++) assert.equal(end(i, c, n), 1, `${b.name} copy ${c} not finished`);
  });
  assert.ok(start(0, 0, 1) < 0.01);
  clean(renderSceneSVG(s, { reveal: bloomReveal(plan, plan.duration / 2) }), 'half bloom');
});

import { RECIPES } from '../js/recipes.js';
import { smoothPath } from '../js/shapes.js';

test('every draw-along recipe covers its picture exactly once', () => {
  for (const r of RECIPES) {
    const t = getTemplate(r.id);
    assert.ok(t, `recipe ${r.id} has no starter picture`);
    const names = t.build().blocks.map((b) => b.name);
    assert.equal(new Set(names).size, names.length, `${r.id}: block names must be unique`);
    const used = r.steps.flatMap((s) => s.blocks);
    for (const n of used) assert.ok(names.includes(n), `${r.id}: step names unknown block "${n}"`);
    assert.deepEqual([...used].sort(), [...names].sort(), `${r.id}: steps must add every block exactly once`);
    for (const s of r.steps) assert.ok(s.title && s.text.length > 20, `${r.id}: every step needs a title and instructions`);
  }
});

test('pen strokes draw smoothly, close into shapes, and repair bad points', () => {
  const open = makeBlock('stroke', { points: [[-0.5, 0], [0, -0.5], [0.5, 0]] });
  clean(renderSceneSVG(scene([open])), 'open stroke');
  const closed = makeBlock('stroke', { closed: true, points: [[-0.5, 0], [0, -0.5], [0.5, 0], [0, 0.5]], repeats: [makeRepeat('radial', { count: 8, kaleido: true })] });
  clean(renderSceneSVG(scene([closed])), 'closed kaleidoscope stroke');
  assert.match(smoothPath([[0, 0], [10, 10], [20, 0]], 0.6, true), /Z$/);
  assert.doesNotMatch(smoothPath([[0, 0], [10, 10]], 0), /NaN/);
  const repaired = normalizeScene({ blocks: [{ type: 'stroke', points: [[1, 'x'], null] }] });
  assert.ok(repaired.blocks[0].points.length >= 2);
});

import { toColoringPage, paintBlock, isLineBlock } from '../js/coloring.js';

test('every picture turns into a clean coloring page that the bucket can fill', () => {
  for (const t of TEMPLATES) {
    const page = toColoringPage(normalizeScene(t.build()));
    clean(renderSceneSVG(page), `coloring ${t.id}`);
    assert.equal(page.background.c1, '#ffffff');
    for (const b of page.blocks) {
      if (b.type === 'face' || isLineBlock(b)) continue;
      assert.equal(b.fill, '#ffffff', `${t.id}/${b.name} should start white`);
      assert.ok(b.strokeWidth >= 2, `${t.id}/${b.name} needs an outline to color inside`);
    }
    const target = page.blocks.find((b) => !isLineBlock(b) && b.type !== 'face');
    assert.equal(paintBlock(target, '#ff4f87'), 'fill');
    assert.equal(target.fill, '#ff4f87');
  }
  const line = makeBlock('wave');
  assert.equal(paintBlock(line, '#123456'), 'line');
  assert.equal(line.stroke, '#123456');
});

import { recognizeShape, makeStabilizer, resample } from '../js/assist.js';
import { BRUSHES } from '../js/shapes.js';

// Wobbly, hand-drawn test shapes from a seeded random number generator.
const wobbly = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5); };
const jitter = (pts, amount, seed = 7) => { const r = wobbly(seed); return pts.map((p) => ({ x: p.x + r() * amount, y: p.y + r() * amount })); };
const oval = (a, b, rotDeg, over = 1.05) => Array.from({ length: 60 }, (_, i) => {
  const t = (i / 60) * Math.PI * 2 * over, r = (rotDeg * Math.PI) / 180, x = a * Math.cos(t), y = b * Math.sin(t);
  return { x: 400 + x * Math.cos(r) - y * Math.sin(r), y: 400 + x * Math.sin(r) + y * Math.cos(r) };
});
const polygonPts = (n, R, rotDeg = 0) => {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a1 = ((rotDeg + (k * 360) / n - 90) * Math.PI) / 180, a2 = ((rotDeg + ((k + 1) * 360) / n - 90) * Math.PI) / 180;
    for (let i = 0; i < 14; i++) { const t = i / 14; out.push({ x: 400 + R * ((1 - t) * Math.cos(a1) + t * Math.cos(a2)), y: 400 + R * ((1 - t) * Math.sin(a1) + t * Math.sin(a2)) }); }
  }
  out.push(out[0]);
  return out;
};

test('rough shapes snap into the clean shape they were aiming for', () => {
  assert.equal(recognizeShape(jitter(oval(120, 120, 0), 8)).kind, 'circle');
  const e = recognizeShape(jitter(oval(180, 90, 30), 8));
  assert.equal(e.kind, 'ellipse');
  assert.ok(Math.abs(e.rot - 30) < 4 && e.w > e.h * 1.5);
  const box = recognizeShape(jitter(polygonPts(4, 150, 45), 6));
  assert.equal(box.kind, 'rect');
  assert.equal(recognizeShape(jitter(polygonPts(3, 150), 6)).kind, 'triangle');
  const hex = recognizeShape(jitter(polygonPts(6, 150), 5));
  assert.equal(hex.kind, 'polygon');
  assert.equal(hex.sides, 6);
  assert.equal(recognizeShape(jitter(Array.from({ length: 40 }, (_, i) => ({ x: 100 + i * 10, y: 200 + i * 4 })), 5)).kind, 'line');
});

test('curves, hearts and scribbles are never forced into a shape', () => {
  const arc = Array.from({ length: 40 }, (_, i) => ({ x: 400 + 150 * Math.cos((i / 40) * 3), y: 400 + 150 * Math.sin((i / 40) * 3) }));
  assert.equal(recognizeShape(arc), null);
  const scribble = Array.from({ length: 80 }, (_, i) => ({ x: 400 + 150 * Math.sin(i * 1.7) * Math.cos(i * 0.31), y: 400 + 120 * Math.sin(i * 0.9 + 1) }));
  assert.equal(recognizeShape(scribble), null);
  const heart = Array.from({ length: 30 }, (_, i) => { const t = (i / 30) * Math.PI * 2; return { x: 400 + 160 * Math.sin(t) ** 3, y: 400 - (130 * Math.cos(t) - 50 * Math.cos(2 * t) - 20 * Math.cos(3 * t) - 10 * Math.cos(4 * t)) }; });
  assert.equal(recognizeShape(heart), null);
  assert.equal(recognizeShape([{ x: 0, y: 0 }, { x: 1, y: 1 }]), null);
});

test('the steady-hand stabilizer ignores small wobbles', () => {
  const st = makeStabilizer(20);
  assert.ok(st.push({ x: 0, y: 0 }));
  assert.equal(st.push({ x: 8, y: 5 }), null, 'a small wobble should not move the ink');
  const moved = st.push({ x: 50, y: 0 });
  assert.ok(moved && Math.abs(moved.x - 30) < 0.01, 'the ink trails the pointer by the string length');
  assert.equal(resample([{ x: 0, y: 0 }, { x: 10, y: 0 }], 11).length, 11);
});

test('every brush draws a clean pen stroke', () => {
  for (const br of BRUSHES) {
    const b = makeBlock('stroke', { brush: br.id, points: [[-0.5, 0, 0.5], [-0.2, -0.4, 1], [0.2, 0.3, 1.2], [0.5, 0, 0.6]], repeats: [makeRepeat('mirror')] });
    clean(renderSceneSVG(scene([b])), `brush ${br.id}`);
  }
});

import { EFFECTS } from '../js/model.js';

test('every layer effect renders on shapes, lines and pen strokes', () => {
  for (const [effect] of EFFECTS) {
    for (const type of ['heart', 'wave', 'stroke', 'tree']) {
      const svg = renderSceneSVG(scene([makeBlock(type, { effect, repeats: [makeRepeat('mirror')] })]));
      clean(svg, `${type} + ${effect}`);
      if (effect !== 'none') assert.match(svg, /<filter id=/, `${effect} should add a filter`);
    }
  }
  assert.equal(normalizeScene({ blocks: [{ type: 'circle', effect: 'explode' }] }).blocks[0].effect, 'none');
});

test('rough stars snap into stars, but boxes stay boxes', () => {
  const starPts = (n, R, ri) => {
    const out = [];
    for (let k = 0; k < n * 2; k++) {
      const a1 = (k * Math.PI) / n - Math.PI / 2, a2 = ((k + 1) * Math.PI) / n - Math.PI / 2;
      const r1 = k % 2 ? ri : R, r2 = k % 2 ? R : ri;
      for (let i = 0; i < 6; i++) { const t = i / 6; out.push({ x: 400 + r1 * Math.cos(a1) * (1 - t) + r2 * Math.cos(a2) * t, y: 400 + r1 * Math.sin(a1) * (1 - t) + r2 * Math.sin(a2) * t }); }
    }
    out.push(out[0]);
    return out;
  };
  const five = recognizeShape(jitter(starPts(5, 160, 65), 6));
  assert.equal(five.kind, 'star');
  assert.equal(five.points, 5);
  assert.equal(recognizeShape(jitter(starPts(6, 160, 80), 6)).points, 6);
  assert.equal(recognizeShape(jitter(polygonPts(4, 150, 45), 6)).kind, 'rect');
  assert.equal(recognizeShape(jitter(polygonPts(5, 150), 5)).kind, 'polygon');
});

import { harmonize, HARMONIES } from '../js/coloring.js';
import { CANVAS_SHAPES, resizeCanvas } from '../js/model.js';
import { hexToRgb, rgbToHsl } from '../js/color.js';

test('recoloring from one color keeps every light and dark in place', () => {
  const light = (c) => rgbToHsl(...hexToRgb(c))[2];
  for (const t of TEMPLATES) {
    const before = normalizeScene(t.build());
    for (const [kind] of HARMONIES) {
      const after = harmonize(before, '#3ee6c1', kind);
      clean(renderSceneSVG(after), `${t.id} ${kind}`);
      after.blocks.forEach((b, i) => {
        const o = before.blocks[i];
        if (b.type === 'face' || o.fillMode === 'none') return;
        assert.ok(Math.abs(light(b.fill) - Math.max(0.08, Math.min(0.97, light(o.fill)))) < 0.03, `${t.id}/${b.name} (${kind}) changed lightness`);
      });
    }
  }
  const mono = harmonize(getTemplate('flower').build(), '#ff4f87', 'mono');
  const hues = new Set(mono.blocks.filter((b) => b.fillMode !== 'none' && rgbToHsl(...hexToRgb(b.fill))[1] > 0.3).map((b) => Math.round(rgbToHsl(...hexToRgb(b.fill))[0] / 10)));
  assert.equal(hues.size, 1, 'monochrome should use a single hue');
});

test('every canvas shape keeps the drawing centered and survives saving', () => {
  for (const [id, , w, h] of CANVAS_SHAPES) {
    const s = resizeCanvas(normalizeScene(getTemplate('butterfly').build()), w, h);
    assert.equal(s.width, w); assert.equal(s.height, h);
    const body = s.blocks.find((b) => b.name === 'Body');
    assert.ok(Math.abs(body.x - w / 2) < 1 && Math.abs(body.y - (420 + (h - 800) / 2)) < 30, `${id}: drawing should stay centered`);
    clean(renderSceneSVG(s), `canvas ${id}`);
    const again = normalizeScene(JSON.parse(JSON.stringify(s)));
    assert.equal(again.width, w); assert.equal(again.height, h);
  }
  assert.equal(normalizeScene({ width: 99999, height: -5 }).width, 2400);
});
