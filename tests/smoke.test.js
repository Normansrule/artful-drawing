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
