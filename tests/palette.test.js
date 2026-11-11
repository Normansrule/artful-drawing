// Tests for the command palette's search (js/palette.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, rankCommands } from '../js/palette.js';

const cmds = ['Add star', 'Add straight line', 'Export PNG image', 'Export SVG (sharp at any size)', 'Code example: Rainbow burst', 'Undo', 'Theme: Light']
  .map((label) => ({ label, group: 'Test', run() {} }));
const top = (q) => rankCommands(q, cmds).map((c) => c.label);

test('exact words beat scattered letters', () => {
  assert.equal(top('export')[0], 'Export PNG image');
  assert.ok(!top('export').includes('Code example: Rainbow burst'));
  assert.equal(top('star')[0], 'Add star');
});

test('initials and partial words still find things', () => {
  assert.equal(top('exsvg')[0], 'Export SVG (sharp at any size)');
  assert.equal(top('thl')[0], 'Theme: Light');
  assert.equal(fuzzyScore('zzz', 'Undo'), 0);
  assert.equal(top('').length, cmds.length);
});

import { readFileSync } from 'node:fs';
test('every desktop menu item runs a command the studio really has', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const studio = readFileSync(new URL('../js/studio.js', import.meta.url), 'utf8');
  const used = [...main.matchAll(/command\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(used.length > 10);
  for (const label of used) {
    if (label === 'Command palette') continue; // handled by window.artfulCommand itself
    const quoted = [`'${label}'`, `\`${label}\``].some((q) => studio.includes(q));
    const themed = /^Theme: /.test(label) && studio.includes('`Theme: ${label}`');
    assert.ok(quoted || themed || label.startsWith('Theme: '), `menu uses "${label}" but no palette command has that name`);
  }
});

test('the desktop app packs every file the pages load', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const files = pkg.build.files.join(' ');
  for (const need of ['*.html', 'js/', 'css/', 'vendor/', 'favicon.svg', 'electron/']) assert.ok(files.includes(need), need);
  assert.equal(pkg.main, 'electron/main.cjs');
});
