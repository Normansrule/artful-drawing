// Tests for the drawing instruction language (js/instructions.js).
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runInstructions, toBlocks, EXAMPLES, BUILTINS, extractDefines, mergeIntoLibrary,
  removeFromLibrary, STARTER_LIBRARY,
} from '../js/instructions.js';
import { blankScene, normalizeScene } from '../js/model.js';
import { renderSceneSVG } from '../js/render.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const drawScene = (src, opts) => {
  const r = runInstructions(src, opts);
  const scene = blankScene();
  scene.blocks = toBlocks(r, scene);
  if (r.background) scene.background = { ...scene.background, ...r.background };
  return { r, scene: normalizeScene(JSON.parse(JSON.stringify(scene))) };
};

test('every example runs without errors and renders cleanly', () => {
  for (const [name, src] of EXAMPLES) {
    const { r, scene } = drawScene(src);
    assert.deepEqual(r.errors, [], name);
    assert.ok(scene.blocks.length > 0, `${name} draws something`);
    const svg = renderSceneSVG(scene);
    assert.ok(!svg.includes('NaN'), `${name} has no NaN`);
  }
});

test('every built-in instruction example runs on its own', () => {
  for (const b of BUILTINS) {
    if (['stop', 'if', 'define', 'pop'].includes(b.name)) continue;
    const r = runInstructions(`set len 50\nset i 3\n${b.example}`);
    assert.deepEqual(r.errors, [], b.name);
  }
});

test('the pen moves and turns like a turtle (0 0 is the middle, up is 0°)', () => {
  let t = runInstructions('move 100').turtle;
  assert.ok(near(t.x, 0) && near(t.y, 100));
  t = runInstructions('turn 90 move 50').turtle;
  assert.ok(near(t.x, 50) && near(t.y, 0));
  t = runInstructions('repeat 4 [ move 100 turn 90 ]').turtle;
  assert.ok(near(t.x, 0) && near(t.y, 0) && near(((t.dir % 360) + 360) % 360, 0));
  t = runInstructions('goto -200 100').turtle;
  assert.deepEqual([t.x, t.y], [-200, 100]);
  t = runInstructions('push move 80 turn 33 pop').turtle;
  assert.deepEqual([t.x, t.y, t.dir], [0, 0, 0]);
});

test('a minus sign is read the way people mean it', () => {
  assert.equal(runInstructions('goto 0 -250').turtle.y, -250);
  assert.equal(runInstructions('move 10 - 4').turtle.y, 6);
  assert.equal(runInstructions('set len 4\nmove len-1').turtle.y, 3);
  assert.match(runInstructions('move 10 -5').errors[0].message, /space on both sides/);
});

test('your own instructions take inputs, call themselves, and stop', () => {
  const r = runInstructions(`
    define spiral len [
      if len < 5 [ stop ]
      move len
      turn 90
      spiral len - 5
    ]
    spiral 100`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.defined, ['spiral']);
  const pts = r.items[0].points;
  assert.equal(pts.length, 21); // the start plus 20 lines: 100, 95, … 5
});

test('instructions can be used above where they are defined', () => {
  const r = runInstructions('square 50\ndefine square len [ repeat 4 [ move len turn 90 ] ]');
  // used before its define has run: a clear message, not a crash
  assert.match(r.errors[0].message, /define first/);
});

test('mistakes come back as friendly messages with line numbers', () => {
  const cases = [
    ['mvoe 10', /Did you mean move/],
    ['repeat 3 [ move 10', /never closed/],
    ['define move [ ]', /already a built-in/],
    ['color pnk', /Did you mean pink/],
    ['define f n [ f n + 1 ]\nf 1', /levels deep/],
    ['repeat 5 [ move 10 ] ]', /without a matching/],
    ['write "hi 10', /closing quote/],
    ['move 10 / 0', /divide by zero/],
    ['pop', /needs a push/],
    ['repeat 3 [\n  move 10\n  jump\n]', /Expected a number/],
  ];
  for (const [src, re] of cases) {
    const r = runInstructions(src);
    assert.equal(r.errors.length, 1, src);
    assert.match(r.errors[0].message, re, src);
    assert.ok(r.errors[0].line == null || r.errors[0].line >= 1);
  }
  assert.equal(runInstructions('repeat 3 [\n  move 10\n  jump\n]').errors[0].line, 4);
});

test('runaway programs stop safely', () => {
  const r = runInstructions('repeat 100000 [ repeat 100000 [ move 1 ] ]');
  assert.match(r.errors[0].message, /steps|points/);
  const deep = runInstructions('define f [ f ]\nf');
  assert.match(deep.errors[0].message, /levels deep/);
});

test('the same seed always draws the same picture', () => {
  const src = 'seed 9\nrepeat 20 [ goto random(-300, 300) random(-300, 300) dot 5 ]';
  assert.deepEqual(runInstructions(src).items, runInstructions(src).items);
  assert.notDeepEqual(runInstructions(src).items, runInstructions(src.replace('seed 9', 'seed 10')).items);
});

test('lines of one style become one block with pen lifts, so code drawings stay light', () => {
  const { scene } = drawScene('penup\nrepeat 50 [ goto i * 10 - 250 0 pendown move 40 penup ]');
  assert.equal(scene.blocks.length, 1);
  const b = scene.blocks[0];
  assert.equal(b.type, 'stroke');
  assert.equal(b.points.filter((p) => p === null).length, 49);
  const svg = renderSceneSVG(scene);
  assert.equal((svg.match(/M/g) || []).length >= 50, true);
});

test('shapes become real, editable shape blocks in the right place', () => {
  const { scene } = drawScene('fill gold\npenup\ngoto 100 100\nstar 50 6\nturn 90\npetal 20 80');
  const [star, petal] = scene.blocks;
  assert.equal(star.type, 'star');
  assert.equal(star.points, 6);
  assert.deepEqual([star.x, star.y, star.w], [500, 300, 100]);
  assert.equal(petal.type, 'petal');
  assert.deepEqual([petal.x, petal.y, petal.rot], [540, 300, 90]); // grows 40 to the right of the pen
  assert.equal(star.group, petal.group);
});

test('symmetry becomes a repeat on the block', () => {
  const { scene } = drawScene('symmetry spin 8\nmove 100\nsymmetry mirror\njump 20\ncircle 10');
  assert.equal(scene.blocks[0].repeats[0].mode, 'radial');
  assert.equal(scene.blocks[0].repeats[0].count, 8);
  assert.equal(scene.blocks[1].repeats[0].mode, 'mirror');
});

test('My instructions: save, replace by name, remove, and use in any drawing', () => {
  const src = 'color red\n// a square\ndefine sq n [ repeat 4 [ move n turn 90 ] ]\nsq 50\ndefine broken [ move 3\n';
  const defs = extractDefines(src);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].name, 'sq');
  assert.deepEqual(defs[0].params, ['n']);
  assert.ok(defs[0].text.startsWith('// a square'));
  let lib = mergeIntoLibrary(STARTER_LIBRARY, defs);
  assert.deepEqual(extractDefines(lib).map((d) => d.name), ['ngon', 'flower', 'sq']);
  lib = mergeIntoLibrary(lib, extractDefines('define sq n [ move n ]'));
  assert.equal(extractDefines(lib).filter((d) => d.name === 'sq').length, 1);
  lib = removeFromLibrary(lib, 'flower');
  assert.deepEqual(extractDefines(lib).map((d) => d.name), ['ngon', 'sq']);
  const r = runInstructions('ngon 5 100\nsq 20', { library: lib });
  assert.deepEqual(r.errors, []);
  const bad = runInstructions('move 1', { library: 'define oops [ move ]' });
  assert.equal(bad.errors[0].inLibrary, true);
});

import { readFileSync } from 'node:fs';
test('every code example in the manual runs cleanly', () => {
  const html = readFileSync(new URL('../manual.html', import.meta.url), 'utf8');
  const unescape = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const demos = [...html.matchAll(/<pre class="code-demo"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => unescape(m[1]));
  assert.ok(demos.length >= 8);
  for (const src of demos) {
    const { r, scene } = drawScene(src);
    assert.deepEqual(r.errors, [], src.split('\n')[0]);
    assert.ok(scene.blocks.length > 0);
  }
});

test('the home page code card is a real, working program', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const card = html.match(/<pre class="code-card"[^>]*>([\s\S]*?)<\/pre>/)[1].replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
  assert.deepEqual(runInstructions(card).errors, []);
  const link = decodeURIComponent(html.match(/studio\.html#code=([^"]+)"/)[1]);
  assert.deepEqual(runInstructions(link).errors, []);
});
