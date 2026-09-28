// artful drawing studio: everything interactive lives here.
// The drawing itself is plain JSON (see model.js) rendered by render.js.

import { SHAPES, CATEGORIES } from './shapes.js';
import { REPEATERS } from './repeaters.js';
import { makeBlock, makeRepeat, blankScene, normalizeScene } from './model.js';
import { renderSceneInner, renderSceneSVG, sceneStats } from './render.js';
import { playBloom, recordBloom, canRecordVideo } from './bloom.js';
import { spotlight, reducedMotion } from './fx.js';
import { RECIPES, getRecipe } from './recipes.js';
import { toColoringPage, paintBlock } from './coloring.js';
import { TEMPLATES, getTemplate } from './templates.js';
import { PALETTES } from './color.js';
import { encodeScene, decodeScene } from './share.js';
import { clone, esc, uid, clamp } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);
const canvas = $('#canvas');
const STORAGE_KEY = 'artful-drawing:scene:v1';
const WELCOMED_KEY = 'artful-drawing:welcomed';

const state = {
  scene: blankScene(),
  sel: null,
  guides: true,
  snap: false,
  palette: 'Candy',
  openSections: new Set(['place', 'shape', 'color', 'repeat']),
  reveal: null,      // set while a block is popping in
  pen: { on: false, sym: 'mirror', color: '#ff4f87', size: 8 },
  penPreview: null,  // the stroke being drawn right now
  guide: null,       // draw-along session
  bucket: false,     // paint-bucket tool
  trace: null,       // { url, opacity } photo to trace over (never saved or exported)
  stopBloom: null,   // set while the bloom animation plays
};

const blocks = () => state.scene.blocks;
const selected = () => blocks().find((b) => b.id === state.sel) || null;
const W = () => state.scene.width;
const H = () => state.scene.height;

// ---------- small DOM helper ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const el = (tag, { text, ...attrs } = {}) => h(tag, attrs, text);
let fieldCounter = 0;
const fid = () => `f${fieldCounter++}`;

// ---------- toast ----------
const toast = $('#toast');
let toastTimer;
function announce(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ---------- history (undo / redo) ----------
const undoStack = [], redoStack = [];
let committed = '';
let commitTimer = null;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, committed); } catch { /* private mode or storage full: drawing still works */ }
}
function commit(msg) {
  clearTimeout(commitTimer); commitTimer = null;
  const snap = JSON.stringify(state.scene);
  if (snap !== committed) {
    undoStack.push(committed);
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    committed = snap;
    persist();
  }
  updateHistoryButtons();
  if (msg) announce(msg);
}
function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(() => commit(), 450); }
function flushCommit() { if (commitTimer) commit(); }

function restore(snap) {
  state.scene = JSON.parse(snap);
  if (!selected()) state.sel = null;
  refreshAll();
  persist();
}
function undo() {
  flushCommit();
  if (!undoStack.length) return announce('Nothing to undo.');
  redoStack.push(committed); committed = undoStack.pop(); restore(committed); announce('Undone.');
}
function redo() {
  flushCommit();
  if (!redoStack.length) return announce('Nothing to redo.');
  undoStack.push(committed); committed = redoStack.pop(); restore(committed); announce('Redone.');
}
function updateHistoryButtons() {
  $('#btn-undo').disabled = !undoStack.length && !commitTimer;
  $('#btn-redo').disabled = !redoStack.length;
}

// ---------- drawing ----------
function draw() {
  if (state.stopBloom) stopBloom();
  canvas.setAttribute('viewBox', `0 0 ${W()} ${H()}`);
  const t0 = performance.now();
  canvas.innerHTML = renderSceneInner(viewScene(), { prefix: 's-', reveal: state.reveal }) + ghostMarkup() + traceMarkup();
  drawOverlay();
  updateStatus();
  updateMonitor(performance.now() - t0);
}

/** A photo laid over the canvas like a lightbox, for tracing with the pen. */
function traceMarkup() {
  const t = state.trace;
  return t ? `<image class="trace" href="${t.url}" x="0" y="0" width="${W()}" height="${H()}" preserveAspectRatio="xMidYMid meet" opacity="${t.opacity}" pointer-events="none"/>` : '';
}

/** The scene as shown: the real drawing plus any stroke the pen is drawing right now. */
function viewScene() {
  return state.penPreview ? { ...state.scene, blocks: [...blocks(), state.penPreview] } : state.scene;
}

/** Draw along: the parts not drawn yet, faint on top, like tracing paper. */
function ghostMarkup() {
  const g = state.guide;
  if (!g || g.finished) return '';
  const target = { ...g.target, background: { mode: 'solid', c1: 'none', c2: 'none', angle: 90 },
    blocks: g.target.blocks.map((b) => (g.done.has(b.name) ? { ...b, visible: false } : b)) };
  return `<g class="ghost" opacity="0.26" pointer-events="none" aria-hidden="true">${renderSceneInner(target, { prefix: 'gh-' })}</g>`;
}

// ---------- render monitor (blocks, shapes after repeats, draw time) ----------
const msHistory = [];
let statsKey = '', stats = { blocks: 0, shapes: 0 };
const fmt = new Intl.NumberFormat('en-US');
function updateMonitor(ms) {
  const key = committed + blocks().length;
  if (key !== statsKey || commitTimer) { stats = sceneStats(state.scene); statsKey = key; }
  msHistory.push(ms); if (msHistory.length > 30) msHistory.shift();
  $('#mon-blocks').textContent = fmt.format(stats.blocks);
  $('#mon-shapes').textContent = fmt.format(stats.shapes);
  $('#mon-ms').textContent = ms < 10 ? ms.toFixed(1) : Math.round(ms);
  const max = Math.max(16, ...msHistory);
  $('#mon-spark polyline').setAttribute('points', msHistory.map((v, i) => `${(i * 60) / 29},${(15 - (v / max) * 14).toFixed(1)}`).join(' '));
  $('#monitor').classList.toggle('is-slow', ms > 40);
}

// ---------- pop-in and bloom animations ----------
function popIn(index) {
  if (reducedMotion()) return;
  const set = new Set([].concat(index));
  const t0 = performance.now(), dur = 420;
  const easeBack = (t) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    state.reveal = p < 1 ? (bi, ci, n) => (!set.has(bi) ? 1 : easeBack(Math.min(1, Math.max(0, p * 1.4 - (n > 1 ? (ci / n) * 0.4 : 0))))) : null;
    canvas.innerHTML = renderSceneInner(state.scene, { prefix: 's-', reveal: state.reveal }) + ghostMarkup();
    drawOverlay();
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function stopBloom() {
  const stop = state.stopBloom;
  state.stopBloom = null;
  if (stop) stop();
  $('#btn-bloom').setAttribute('aria-pressed', 'false');
  canvas.classList.remove('is-blooming');
}

function bloom(pace = 1) {
  if (state.stopBloom) { stopBloom(); draw(); return; }
  if (!blocks().some((b) => b.visible)) return announce('Add a block first, then press Bloom.');
  flushCommit();
  $('#btn-bloom').setAttribute('aria-pressed', 'true');
  canvas.classList.add('is-blooming');
  state.stopBloom = playBloom(canvas, state.scene, {
    prefix: 's-', pace,
    onDone: () => { state.stopBloom = null; stopBloom(); draw(); },
  });
}

async function exportVideo() {
  if (!canRecordVideo()) return announce('This browser cannot record video. Try Chrome, Edge or Firefox.');
  flushCommit();
  const scene = clone(state.scene);
  try {
    announce('Recording the bloom… 0%');
    const blob = await recordBloom(scene, { onProgress: (p) => { toast.textContent = `Recording the bloom… ${Math.round(p * 100)}%`; toast.classList.add('show'); } });
    download(blob, fileBase() + (blob.type.includes('mp4') ? '.mp4' : '.webm'));
    announce('Bloom video downloaded.');
  } catch {
    announce('The video could not be recorded in this browser.');
  }
}

function drawOverlay() {
  const w = W(), hh = H(), ns = 'vector-effect="non-scaling-stroke"';
  let o = '<g id="overlay" pointer-events="none">';
  if (state.guides) {
    o += `<g stroke="#221f4f" stroke-opacity="0.18" ${ns}>` +
      [1, 2].map((i) => `<line x1="${(w * i) / 3}" y1="0" x2="${(w * i) / 3}" y2="${hh}" ${ns}/><line x1="0" y1="${(hh * i) / 3}" x2="${w}" y2="${(hh * i) / 3}" ${ns}/>`).join('') +
      `</g><g stroke="#ff4f87" stroke-opacity="0.45" stroke-dasharray="6 6" ${ns}><line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${hh}" ${ns}/><line x1="0" y1="${hh / 2}" x2="${w}" y2="${hh / 2}" ${ns}/></g>`;
  }
  const b = selected();
  if (b && b.visible) {
    const g = canvas.querySelector(`[data-block="${CSS.escape(b.id)}"]`);
    let bb = null;
    try { bb = g && g.getBBox(); } catch { bb = null; }
    if (bb && bb.width + bb.height > 0) {
      const p = 8, x = bb.x - p, y = bb.y - p, bw = bb.width + p * 2, bh = bb.height + p * 2;
      o += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="none" stroke="#fff" stroke-width="4" ${ns}/>` +
        `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="none" stroke="#221f4f" stroke-width="2" stroke-dasharray="7 5" ${ns}/>`;
    }
    for (const r of b.repeats) {
      const [cx, cy] = r.around === 'self' ? [b.x, b.y] : r.around === 'point' ? [r.cx, r.cy] : [w / 2, hh / 2];
      if (r.mode === 'mirror') {
        o += `<g stroke="#13877e" stroke-width="2" stroke-dasharray="3 5" ${ns}>`;
        if (r.axis !== 'h') o += `<line x1="${cx}" y1="0" x2="${cx}" y2="${hh}" ${ns}/>`;
        if (r.axis !== 'v') o += `<line x1="0" y1="${cy}" x2="${w}" y2="${cy}" ${ns}/>`;
        o += '</g>';
      } else if (r.mode === 'radial') {
        o += `<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="#13877e" stroke-width="2" ${ns}/><path d="M${cx - 16} ${cy}H${cx + 16}M${cx} ${cy - 16}V${cy + 16}" stroke="#13877e" stroke-width="2" ${ns}/>`;
      }
    }
    o += `<circle cx="${b.x}" cy="${b.y}" r="6" fill="#ff4f87" stroke="#fff" stroke-width="2" ${ns}/>`;
  }
  canvas.insertAdjacentHTML('beforeend', o + '</g>');
}

function updateStatus() {
  const b = selected();
  $('#stage-status').textContent = b
    ? `${b.name}: x ${Math.round(b.x)}, y ${Math.round(b.y)}, ${Math.round(b.w)}×${Math.round(b.h)}, ${Math.round(b.rot)}°`
    : 'Nothing selected. Press . to pick a block.';
}

function refreshAll() {
  draw();
  renderInspector();
  renderLayers();
  updateHistoryButtons();
}

let panelTimer;
function refreshPanelsSoon() {
  clearTimeout(panelTimer);
  panelTimer = setTimeout(() => { renderInspector(); renderLayers(); }, 120);
}

// ---------- selection and block actions ----------
function select(id) {
  state.sel = id;
  draw();
  renderInspector();
  renderLayers();
}

function addBlock(type) {
  const b = makeBlock(type);
  const crowd = blocks().filter((o) => Math.abs(o.x - b.x) < 30 && Math.abs(o.y - b.y) < 30).length;
  b.x += (crowd % 8) * 24; b.y += (crowd % 8) * 24;
  blocks().push(b);
  state.sel = b.id;
  refreshAll();
  popIn(blocks().length - 1);
  commit(`Added ${b.name}. Drag it, or use the arrow keys.`);
}

function duplicate(b) {
  const copy = { ...clone(b), id: uid(), name: `${b.name} copy`, x: b.x + 24, y: b.y + 24 };
  blocks().splice(blocks().indexOf(b) + 1, 0, copy);
  state.sel = copy.id;
  refreshAll();
  commit(`Duplicated ${b.name}.`);
}

function removeBlock(b) {
  const i = blocks().indexOf(b);
  blocks().splice(i, 1);
  blocks().forEach((o) => { if (o.clipTo === b.id) o.clipTo = ''; });
  const next = blocks()[Math.min(i, blocks().length - 1)];
  state.sel = next ? next.id : null;
  refreshAll();
  commit(`Deleted ${b.name}. Undo brings it back.`);
}

function moveLayer(b, dir) {
  const i = blocks().indexOf(b), j = i + dir;
  if (j < 0 || j >= blocks().length) return;
  [blocks()[i], blocks()[j]] = [blocks()[j], blocks()[i]];
  refreshAll();
  commit(dir > 0 ? `${b.name} moved forward.` : `${b.name} moved backward.`);
}

function cycleSelection(dir) {
  const list = blocks().filter((b) => b.visible);
  if (!list.length) return;
  const i = list.findIndex((b) => b.id === state.sel);
  const next = list[(i + dir + list.length) % list.length];
  select(next.id);
  announce(`Selected ${next.name}.`);
}

function toggleMirror(b) {
  const i = b.repeats.findIndex((r) => r.mode === 'mirror');
  if (i >= 0) b.repeats.splice(i, 1); else b.repeats.push(makeRepeat('mirror'));
  refreshAll();
  commit(i >= 0 ? 'Mirror removed.' : 'Mirror added. Move the block off-center to see both sides.');
}

function loadScene(scene, msg) {
  state.scene = normalizeScene(scene);
  state.sel = null;
  refreshAll();
  commit(msg);
}

// ---------- shelf ----------
const TILE_TWEAKS = {
  crystal: { w: 40, h: 90, repeats: [{ mode: 'radial', count: 6, around: 'self' }] },
  tree: { depth: 7, leaf: 0 },
  sunflower: { count: 120 },
};

function tileSVG(type) {
  const def = SHAPES[type];
  const b = makeBlock(type, { x: 50, y: 50, ...(TILE_TWEAKS[type] || {}) });
  const s = 74 / Math.max(b.w, b.h);
  b.w *= s; b.h *= s;
  if (b.strokeWidth > 0) b.strokeWidth = Math.max(b.strokeWidth * s, def.category === 'Lines' || type === 'crystal' ? 3.5 : 1.5);
  if (type === 'tree') b.strokeWidth = 7;
  const whiteish = (c) => /^#f[a-f0-9]f[a-f0-9]f[a-f0-9]$/i.test(c);
  if (whiteish(b.fill)) b.fill = '#b9b1ff';
  if (whiteish(b.stroke)) b.stroke = '#221f4f';
  if (document.documentElement.dataset.theme === 'night') {
    // Dark ink would vanish on night tiles: draw it in moonlight instead.
    if (b.stroke === '#221f4f') b.stroke = '#efeaff';
    if (b.fill === '#221f4f') b.fill = '#efeaff';
  }
  const scene = { ...blankScene(), width: 100, height: 100, background: { mode: 'solid', c1: 'none', c2: 'none', angle: 90 }, blocks: [b] };
  return renderSceneSVG(scene, { prefix: `tile-${type}-`, title: def.label }).replace('role="img"', 'aria-hidden="true"');
}

function renderShelf() {
  const panel = $('#panel-blocks');
  panel.replaceChildren();
  for (const cat of CATEGORIES) {
    const types = Object.keys(SHAPES).filter((t) => SHAPES[t].category === cat.id);
    const grid = h('div', { class: 'tile-grid' });
    for (const t of types) {
      grid.append(h('button', {
        class: 'tile', type: 'button', title: SHAPES[t].blurb,
        'aria-label': `Add ${SHAPES[t].label}. ${SHAPES[t].blurb}`,
        html: tileSVG(t) + `<span>${esc(SHAPES[t].label)}</span>`,
        onclick: () => addBlock(t),
      }));
    }
    panel.append(h('section', { class: 'shelf-group' }, h('h2', {}, cat.id), h('p', { class: 'note' }, cat.blurb), grid));
  }

  const tp = $('#panel-templates');
  tp.replaceChildren(h('section', { class: 'kept', id: 'kept' }), h('h2', { class: 'panel-sub' }, 'Starter pictures'), h('p', { class: 'note' }, 'Every picture here is made only of blocks. Open one, then click its parts to see how it works. Undo takes you back.'));
  const grid = h('div', { class: 'template-grid' });
  const blank = h('button', { class: 'template-card blank', type: 'button', onclick: () => loadScene(blankScene(), 'Blank canvas. Pick a block to begin.') });
  blank.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"></svg><strong>Blank canvas</strong><span>Start from nothing.</span>`;
  grid.append(blank);
  for (const t of TEMPLATES) {
    const card = h('button', {
      class: 'template-card', type: 'button',
      onclick: () => { loadScene(t.build(), `Opened ${t.name}. Undo brings back your previous picture.`); if (!reducedMotion()) bloom(1.6); },
    });
    card.innerHTML = renderSceneSVG(t.build(), { prefix: `tp-${t.id}-`, title: t.name }).replace('role="img"', 'aria-hidden="true"') +
      `<strong>${esc(t.name)}</strong><span>${esc(t.blurb)}</span>`;
    grid.append(card);
  }
  tp.append(grid);
  renderKept();
  spotlight(document.querySelectorAll('.tile, .template-card'));
}

let showTab = () => {};
function setupTabs() {
  const tabs = [$('#tab-blocks'), $('#tab-guide'), $('#tab-templates')];
  const show = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
  };
  showTab = (id) => show($('#' + id));
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        n.focus(); show(n);
      }
    });
  });
}

// ---------- inspector controls ----------
/**
 * Build one control bound to target[spec.key].
 * opts.after(): runs after each live change (default: redraw).
 * opts.structural: rebuild the inspector after the change (for fields that show/hide others).
 */
function control(target, spec, opts = {}) {
  const id = fid();
  const after = opts.after || draw;
  const done = () => { commit(); if (opts.structural) renderInspector(); };
  const hint = spec.hint ? h('p', { class: 'hint', id: id + '-h' }, spec.hint) : null;
  const described = spec.hint ? id + '-h' : null;

  if (spec.type === 'select') {
    const sel = h('select', { id, 'aria-describedby': described, onchange: () => { target[spec.key] = sel.value; after(); commit(); renderInspector(); } },
      spec.options.map(([v, l]) => h('option', { value: v, selected: String(target[spec.key]) === String(v) }, l)));
    return h('div', { class: 'field' }, h('label', { for: id }, spec.label), sel, hint);
  }
  if (spec.type === 'toggle') {
    const cb = h('input', { type: 'checkbox', id, checked: !!target[spec.key], 'aria-describedby': described, onchange: () => { target[spec.key] = cb.checked; after(); commit(); renderInspector(); } });
    return h('div', { class: 'field' }, h('label', { class: 'check', for: id }, cb, spec.label), hint);
  }
  if (spec.type === 'color') {
    const code = h('code', {}, target[spec.key]);
    const inp = h('input', {
      type: 'color', id, value: target[spec.key],
      oninput: () => { target[spec.key] = inp.value; code.textContent = inp.value; after(); },
      onchange: () => commit(),
    });
    return h('div', { class: 'field' }, h('label', { for: id }, spec.label), h('div', { class: 'color-row' }, inp, code));
  }
  if (spec.type === 'text') {
    const inp = h('input', { type: 'text', id, value: target[spec.key], oninput: () => { target[spec.key] = inp.value; renderLayers(); }, onchange: () => commit() });
    return h('div', { class: 'field' }, h('label', { for: id }, spec.label), inp);
  }
  if (spec.type === 'seed') {
    const num = h('input', { type: 'number', id, min: 1, max: 9999, step: 1, value: target[spec.key], 'aria-describedby': described });
    num.addEventListener('input', () => { if (num.value !== '') { target[spec.key] = Number(num.value); after(); } });
    num.addEventListener('change', () => commit());
    const dice = h('button', {
      type: 'button', class: 'btn btn-small', 'aria-label': `New random ${spec.label.toLowerCase()}`,
      onclick: () => { target[spec.key] = 1 + Math.floor(Math.random() * 9999); num.value = target[spec.key]; after(); commit(); },
    }, 'Reshuffle');
    return h('div', { class: 'field' }, h('label', { for: id }, spec.label), h('div', { class: 'seed-row' }, num, dice), hint);
  }
  // range (slider + exact number box)
  const numId = id + '-n';
  const slider = h('input', { type: 'range', id, min: spec.min, max: spec.max, step: spec.step ?? 1, value: target[spec.key], 'aria-describedby': described });
  const num = h('input', { type: 'number', id: numId, step: spec.step ?? 1, value: +Number(target[spec.key]).toFixed(3), 'aria-label': `${spec.label}, exact value` });
  slider.addEventListener('input', () => { target[spec.key] = Number(slider.value); num.value = slider.value; after(); });
  slider.addEventListener('change', done);
  num.addEventListener('input', () => { if (num.value !== '' && Number.isFinite(Number(num.value))) { target[spec.key] = Number(num.value); slider.value = num.value; after(); } });
  num.addEventListener('change', done);
  return h('div', { class: 'field' }, h('label', { for: id }, spec.label), h('div', { class: 'range-row' }, slider, num), hint);
}

function section(key, title, ...body) {
  const d = h('details', { class: 'section', open: state.openSections.has(key) });
  d.addEventListener('toggle', () => { if (d.open) state.openSections.add(key); else state.openSections.delete(key); });
  d.append(h('summary', {}, title), h('div', { class: 'section-body' }, ...body));
  return d;
}

function paletteRow(onPick, label) {
  const sel = h('select', { 'aria-label': 'Palette', onchange: () => { state.palette = sel.value; renderInspector(); } },
    Object.keys(PALETTES).map((n) => h('option', { value: n, selected: n === state.palette }, n)));
  const sw = h('div', { class: 'swatches' }, PALETTES[state.palette].map((c) => h('button', {
    type: 'button', class: 'swatch', style: `background:${c}`, title: c,
    'aria-label': `Use ${c}`, onclick: (e) => onPick(c, e),
  })));
  return h('div', { class: 'field' }, h('span', { class: 'label' }, label), h('div', { class: 'two-col' }, sel, h('span')), sw);
}

function renderInspector() {
  const root = $('#inspector');
  const b = selected();
  root.replaceChildren();
  fieldCounter = 0;
  if (!b) return renderCanvasSettings(root);
  const def = SHAPES[b.type];

  const name = h('input', { type: 'text', value: b.name, 'aria-label': 'Block name', oninput: () => { b.name = name.value; renderLayers(); updateStatus(); }, onchange: () => commit() });
  root.append(h('div', { class: 'insp-head' }, h('div', { class: 'kind' }, `${def.label} block`), name, h('p', {}, def.blurb)));

  // Position and size
  const rangeXY = { min: -200, max: W() + 200, step: 1 };
  root.append(section('place', 'Position and size',
    h('div', { class: 'two-col' },
      control(b, { key: 'x', label: 'Left–right', type: 'range', ...rangeXY }),
      control(b, { key: 'y', label: 'Up–down', type: 'range', ...rangeXY, max: H() + 200 })),
    h('div', { class: 'two-col' },
      control(b, { key: 'w', label: 'Width', type: 'range', min: 1, max: 1200, step: 1 }),
      control(b, { key: 'h', label: 'Height', type: 'range', min: 1, max: 1200, step: 1 })),
    control(b, { key: 'rot', label: 'Rotation (degrees)', type: 'range', min: -180, max: 180, step: 1 }),
    control(b, { key: 'flipX', label: 'Flip left to right', type: 'toggle' }),
  ));

  // Shape settings
  if (def.params.length) root.append(section('shape', 'Shape settings', def.params.map((p) => control(b, p))));

  // Color
  const colorBody = [
    control(b, { key: 'fillMode', label: 'Fill', type: 'select', options: [['solid', 'Solid color'], ['linear', 'Gradient'], ['radial', 'Glow (round gradient)'], ['none', 'No fill']] }),
  ];
  if (b.fillMode !== 'none') {
    colorBody.push(h('div', { class: 'two-col' },
      control(b, { key: 'fill', label: b.fillMode === 'solid' ? 'Fill color' : 'First color', type: 'color' }),
      b.fillMode !== 'solid' ? control(b, { key: 'fill2', label: 'Second color', type: 'color' }) : h('span')));
    if (b.fillMode === 'linear') colorBody.push(control(b, { key: 'gradAngle', label: 'Gradient direction', type: 'range', min: 0, max: 360, step: 1 }));
  }
  colorBody.push(
    paletteRow((c, e) => {
      if (e.altKey) b.stroke = c; else if (e.shiftKey) b.fill2 = c; else b.fill = c;
      refreshAll(); commit();
    }, 'Palette: click for fill, Shift+click for second color, Alt+click for outline'),
    h('div', { class: 'two-col' },
      control(b, { key: 'stroke', label: def.category === 'Lines' ? 'Line color' : 'Outline color', type: 'color' }),
      control(b, { key: 'strokeWidth', label: def.category === 'Lines' ? 'Line thickness' : 'Outline width', type: 'range', min: 0, max: 60, step: 0.5 })),
    control(b, { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01 }),
  );
  root.append(section('color', 'Color', colorBody));

  // Repeats
  const repBody = [h('p', { class: 'note' }, 'Repeats turn one block into many. Stack them: each one repeats everything above it.')];
  b.repeats.forEach((r, i) => {
    const rd = REPEATERS[r.mode];
    const onCenter = Math.hypot(b.x - W() / 2, b.y - H() / 2) < 20 && r.around === 'canvas' && (r.mode === 'mirror' || r.mode === 'radial');
    repBody.push(h('div', { class: 'repeat-card' },
      h('header', {},
        h('span', { class: 'order', 'aria-hidden': 'true' }, i + 1),
        h('strong', {}, rd.label),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move ${rd.label} up`, disabled: i === 0, onclick: () => { [b.repeats[i - 1], b.repeats[i]] = [b.repeats[i], b.repeats[i - 1]]; refreshAll(); commit(); } }, '↑'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move ${rd.label} down`, disabled: i === b.repeats.length - 1, onclick: () => { [b.repeats[i + 1], b.repeats[i]] = [b.repeats[i], b.repeats[i + 1]]; refreshAll(); commit(); } }, '↓'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove ${rd.label}`, onclick: () => { b.repeats.splice(i, 1); refreshAll(); commit(`${rd.label} removed.`); } }, 'Remove')),
      h('p', {}, rd.blurb),
      onCenter ? h('p', { class: 'warn' }, 'This block sits on the canvas center, so its copies land on top of it. Drag it off-center to see them spread out.') : null,
      rd.params.filter((p) => !p.show || p.show(r)).map((p) => control(r, p, { structural: p.type === 'select' || p.type === 'toggle' })),
    ));
  });
  const addSel = h('select', { 'aria-label': 'Repeat to add' }, Object.entries(REPEATERS).map(([k, v]) => h('option', { value: k }, v.label)));
  repBody.push(h('div', { class: 'add-repeat' }, addSel, h('button', {
    type: 'button', class: 'btn', onclick: () => {
      b.repeats.push(makeRepeat(addSel.value));
      state.openSections.add('repeat');
      refreshAll(); commit(`${REPEATERS[addSel.value].label} added.`);
    },
  }, 'Add repeat')));
  root.append(section('repeat', `Repeat${b.repeats.length ? ` (${b.repeats.length})` : ''}`, repBody));

  // Clip
  const others = blocks().filter((o) => o.id !== b.id);
  root.append(section('clip', 'Clip inside another block',
    h('p', { class: 'note' }, 'Only the part of this block that overlaps the chosen block will show, like painting through a stencil. Use it to put patterns inside eggs or shading inside shapes.'),
    control(b, { key: 'clipTo', label: 'Clip inside', type: 'select', options: [['', 'Nothing (show all of it)'], ...others.map((o) => [o.id, o.name])] }),
  ));

  // Actions
  root.append(h('div', { class: 'action-row' },
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => duplicate(b) }, 'Duplicate'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => moveLayer(b, 1) }, 'Bring forward'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => moveLayer(b, -1) }, 'Send backward'),
    h('button', { type: 'button', class: 'btn btn-small', 'aria-pressed': b.locked, onclick: () => { b.locked = !b.locked; refreshAll(); commit(b.locked ? `${b.name} locked. It can't be dragged.` : `${b.name} unlocked.`); } }, b.locked ? 'Unlock' : 'Lock'),
    h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => removeBlock(b) }, 'Delete'),
  ));
}

function renderCanvasSettings(root) {
  const bg = state.scene.background;
  if (!state.bgSeen) { state.openSections.add('bg'); state.bgSeen = true; }
  root.append(
    h('div', { class: 'insp-head' }, h('div', { class: 'kind' }, 'Nothing selected'), h('h2', {}, 'Canvas'),
      h('p', {}, 'Pick a block from the shelf, click something on the canvas, or open a starter picture. Here you can change the background.')),
    section('bg', 'Background',
      control(bg, { key: 'mode', label: 'Style', type: 'select', options: [['solid', 'Solid color'], ['linear', 'Gradient'], ['radial', 'Glow (round gradient)']] }),
      h('div', { class: 'two-col' },
        control(bg, { key: 'c1', label: bg.mode === 'solid' ? 'Color' : 'First color', type: 'color' }),
        bg.mode !== 'solid' ? control(bg, { key: 'c2', label: 'Second color', type: 'color' }) : h('span')),
      bg.mode === 'linear' ? control(bg, { key: 'angle', label: 'Gradient direction', type: 'range', min: 0, max: 360, step: 1 }) : null,
      paletteRow((c, e) => { if (e.shiftKey) bg.c2 = c; else bg.c1 = c; refreshAll(); commit(); }, 'Palette: click for first color, Shift+click for second'),
    ),
  );
}

// ---------- layers ----------
const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.4 6.4C3.7 8.2 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.6-1.6"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const ICON_UNLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';

function renderLayers() {
  const ol = $('#layers');
  ol.replaceChildren();
  if (!blocks().length) { ol.append(h('li', { class: 'note' }, 'No blocks yet.')); return; }
  [...blocks()].reverse().forEach((b) => {
    const li = h('li', { class: `layer${b.id === state.sel ? ' is-selected' : ''}${b.visible ? '' : ' is-hidden'}` },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${b.visible ? 'Hide' : 'Show'} ${b.name}`, 'aria-pressed': !b.visible, html: b.visible ? ICON_EYE : ICON_EYE_OFF, onclick: () => { b.visible = !b.visible; refreshAll(); commit(); } }),
      h('button', { type: 'button', class: 'layer-name', 'aria-current': b.id === state.sel ? 'true' : null, onclick: () => select(b.id) }, b.name),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${b.locked ? 'Unlock' : 'Lock'} ${b.name}`, 'aria-pressed': b.locked, html: b.locked ? ICON_LOCK : ICON_UNLOCK, onclick: () => { b.locked = !b.locked; refreshAll(); commit(); } }),
    );
    ol.append(li);
  });
}

// ---------- canvas pointer interaction ----------
let drag = null;

function toSvgPoint(e) {
  const m = canvas.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (state.stopBloom) { stopBloom(); draw(); }
  if (state.pen.on) { penStart(e); return; }
  if (state.bucket) { bucketAt(e); return; }
  const g = e.target.closest('[data-block]');
  if (!g) { if (state.sel) select(null); return; }
  const b = blocks().find((x) => x.id === g.dataset.block);
  if (!b) return;
  if (state.sel !== b.id) select(b.id);
  if (b.locked) { announce(`${b.name} is locked. Unlock it in Layers to move it.`); return; }
  const p = toSvgPoint(e);
  drag = { b, dx: b.x - p.x, dy: b.y - p.y, moved: false };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  if (penPts) { penMove(e); return; }
  if (!drag) return;
  const p = toSvgPoint(e);
  let x = p.x + drag.dx, y = p.y + drag.dy;
  if (state.snap) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
  if (x !== drag.b.x || y !== drag.b.y) { drag.b.x = x; drag.b.y = y; drag.moved = true; draw(); }
});

function endDrag() {
  if (penPts) { penEnd(); return; }
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  canvas.classList.remove('dragging');
  if (moved) { commit(); renderInspector(); }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('wheel', (e) => {
  const b = selected();
  if (!b || b.locked) return;
  e.preventDefault();
  const d = e.deltaY || e.deltaX;
  if (!d) return;
  if (e.shiftKey || e.altKey) b.rot = ((b.rot + (d > 0 ? 5 : -5) + 540) % 360) - 180;
  else { const f = d > 0 ? 0.95 : 1.05; b.w = clamp(b.w * f, 1, 4000); b.h = clamp(b.h * f, 1, 4000); }
  draw(); commitSoon(); refreshPanelsSoon();
}, { passive: false });

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) && t.type !== 'checkbox' && t.type !== 'range';
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key;
  if ($('#help-dialog').open) return;

  if (mod && key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (mod && key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
  if (typing) { if (key === 'Escape') t.blur(); return; }
  if (t.type === 'range' && key.startsWith('Arrow')) return; // let sliders use arrows
  if (key.startsWith('Arrow') && t.closest && t.closest('[role="tablist"]')) return; // tabs use arrows too

  const b = selected();
  if (key === '?') { e.preventDefault(); openHelp(); return; }
  if (!mod && !typing && key.toLowerCase() === 'p') { e.preventDefault(); togglePen(); return; }
  if (!mod && !typing && key.toLowerCase() === 'k') { e.preventDefault(); toggleBucket(); return; }
  if (key === 'Escape' && state.bucket) { toggleBucket(false); return; }
  if (key === 'Escape' && state.pen.on) { togglePen(false); return; }
  if (key === 'Escape') { if (state.stopBloom) { stopBloom(); draw(); return; } if (state.sel) { select(null); announce('Nothing selected.'); } return; }
  if (!mod && key.toLowerCase() === 'b') { e.preventDefault(); bloom(); return; }
  if (key === ',' || key === '<') { e.preventDefault(); cycleSelection(-1); return; }
  if (key === '.' || key === '>') { e.preventDefault(); cycleSelection(1); return; }
  if (!mod && key.toLowerCase() === 'g') { state.guides = !state.guides; $('#opt-guides').checked = state.guides; draw(); return; }
  if (!b) return;

  if (mod && key.toLowerCase() === 'd') { e.preventDefault(); duplicate(b); return; }
  if (mod || e.altKey) return;
  if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); removeBlock(b); return; }
  if (key === '[') { moveLayer(b, -1); return; }
  if (key === ']') { moveLayer(b, 1); return; }
  if (key.toLowerCase() === 'h') { b.visible = false; state.sel = null; refreshAll(); commit(`${b.name} hidden. Show it again from Layers.`); return; }
  if (key.toLowerCase() === 'm') { toggleMirror(b); return; }
  if (b.locked) return;

  const step = e.shiftKey ? 10 : 1;
  let changed = true;
  switch (key) {
    case 'ArrowLeft': b.x -= step; break;
    case 'ArrowRight': b.x += step; break;
    case 'ArrowUp': b.y -= step; break;
    case 'ArrowDown': b.y += step; break;
    case '+': case '=': b.w *= 1.1; b.h *= 1.1; break;
    case '-': case '_': b.w = Math.max(1, b.w / 1.1); b.h = Math.max(1, b.h / 1.1); break;
    case 'r': b.rot = ((b.rot + 15 + 540) % 360) - 180; break;
    case 'R': b.rot = ((b.rot - 15 + 540) % 360) - 180; break;
    case 'f': case 'F': b.flipX = !b.flipX; break;
    default: changed = false;
  }
  if (changed) { e.preventDefault(); draw(); commitSoon(); refreshPanelsSoon(); updateHistoryButtons(); }
});

// ---------- files, export, sharing ----------
function download(blob, filename) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const fileBase = () => 'artful-drawing-' + new Date().toISOString().slice(0, 10);

async function exportPNG(scale = 2) {
  const svg = renderSceneSVG(state.scene, { prefix: 'x-' });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = W() * scale; c.height = H() * scale;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((blob) => { download(blob, fileBase() + '.png'); announce('Picture downloaded.'); }, 'image/png');
  } catch {
    announce('The PNG could not be made in this browser. Try Download vector (SVG) instead.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function exportSVG() {
  download(new Blob([renderSceneSVG(state.scene, { prefix: 'x-' })], { type: 'image/svg+xml' }), fileBase() + '.svg');
  announce('Vector file downloaded. It opens in Inkscape, Illustrator, Figma and browsers.');
}

function saveProject() {
  flushCommit();
  download(new Blob([JSON.stringify(state.scene, null, 2)], { type: 'application/json' }), fileBase() + '.artful.json');
  announce('Project file saved. Open it later to keep editing.');
}

$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    loadScene(JSON.parse(await file.text()), `Opened ${file.name}.`);
  } catch {
    announce('That file is not a artful drawing project. Project files end in .json.');
  }
});

async function copyShareLink() {
  flushCommit();
  const code = await encodeScene(state.scene);
  const url = `${location.origin}${location.pathname}#scene=${code}`;
  try {
    await navigator.clipboard.writeText(url);
    announce('Share link copied. It opens this exact picture.');
  } catch {
    window.prompt('Copy this link to share your picture:', url);
  }
}

function shuffleColors() {
  const names = Object.keys(PALETTES).filter((n) => n !== state.palette);
  const name = names[Math.floor(Math.random() * names.length)];
  const pal = PALETTES[name], offset = Math.floor(Math.random() * pal.length), map = new Map();
  const pick = (c) => {
    if (!map.has(c)) map.set(c, pal[(map.size + offset) % pal.length]);
    return map.get(c);
  };
  for (const b of blocks()) {
    if (b.type === 'face') continue;
    if (b.fillMode !== 'none') b.fill = pick(b.fill);
    if (b.fillMode === 'linear' || b.fillMode === 'radial') b.fill2 = pick(b.fill2);
    if (SHAPES[b.type].category === 'Lines' || b.type === 'crystal') b.stroke = pick(b.stroke);
  }
  state.palette = name;
  refreshAll();
  commit(`Recolored with the ${name} palette. Undo to go back.`);
}

// ---------- help dialog ----------
function openHelp() { $('#help-dialog').showModal(); }

// ---------- wiring ----------
function wire() {
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-shuffle').addEventListener('click', shuffleColors);
  $('#btn-bloom').addEventListener('click', () => bloom());
  $('#btn-share').addEventListener('click', copyShareLink);
  $('#btn-help').addEventListener('click', openHelp);
  $('#opt-guides').addEventListener('change', (e) => { state.guides = e.target.checked; draw(); });
  $('#opt-snap').addEventListener('change', (e) => { state.snap = e.target.checked; });
  const menu = $('#save-menu');
  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    menu.open = false;
    if (act === 'png') exportPNG();
    if (act === 'keep') keepDrawing();
    if (act === 'svg') exportSVG();
    if (act === 'video') exportVideo();
    if (act === 'json') saveProject();
    if (act === 'open') $('#file-input').click();
    if (act === 'new') loadScene(blankScene(), 'Blank canvas. Undo brings back your previous picture.');
  });
  document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
  window.addEventListener('resize', () => draw());
  window.addEventListener('themechange', () => renderShelf());
}

// ---------- the pen: freehand strokes that become blocks ----------
let penPts = null;
const SYM = {
  none: [], mirror: [['mirror', {}]], spin4: [['radial', { count: 4 }]], spin6: [['radial', { count: 6 }]],
  kaleido6: [['radial', { count: 6, kaleido: true }]], kaleido8: [['radial', { count: 8, kaleido: true }]], kaleido12: [['radial', { count: 12, kaleido: true }]],
};

function togglePen(force) {
  state.pen.on = force ?? !state.pen.on;
  if (state.pen.on && state.bucket) toggleBucket(false, true);
  $('#btn-pen').setAttribute('aria-pressed', state.pen.on);
  canvas.classList.toggle('pen-on', state.pen.on);
  if (state.pen.on && state.sel) select(null);
  if (force === false && !state.pen.on) return;
  announce(state.pen.on ? 'Pen on. Drag on the canvas to draw. Every line follows the symmetry you pick. Press P or Esc when done.' : 'Pen off. Click a stroke to move or recolor it.');
}

/** Ramer-Douglas-Peucker: drop points that don't change the shape. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** Simplify a stroke; loops are split at their far point so both halves keep their shape. */
function simplifyStroke(pts, eps) {
  const a = pts[0];
  let far = 0, idx = 0;
  pts.forEach((p, i) => { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d > far) { far = d; idx = i; } });
  if (idx === 0 || idx === pts.length - 1) return simplify(pts, eps);
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

function penBlock(raw, final) {
  const pts = final ? simplifyStroke(raw, 1.2) : raw;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const first = raw[0], last = raw[raw.length - 1];
  const closed = final && raw.length > 10 && Math.hypot(last.x - first.x, last.y - first.y) < Math.max(20, 0.15 * Math.max(w, h));
  const { color, size, sym } = state.pen;
  return makeBlock('stroke', {
    name: closed ? 'Pen shape' : 'Pen stroke',
    x: r1(cx), y: r1(cy), w: r1(w), h: r1(h), closed, smooth: 0.6,
    points: pts.map((p) => [Math.round(((p.x - cx) / w) * 1000) / 1000, Math.round(((p.y - cy) / h) * 1000) / 1000]),
    fill: color, stroke: closed ? '#221f4f' : color, strokeWidth: closed ? Math.max(3, size * 0.5) : size,
    repeats: SYM[sym].map(([mode, o]) => makeRepeat(mode, o)),
  });
}
const r1 = (v) => Math.round(v * 10) / 10;

function penStart(e) {
  const p = toSvgPoint(e);
  penPts = [p];
  canvas.setPointerCapture(e.pointerId);
}
function penMove(e) {
  const p = toSvgPoint(e), q = penPts[penPts.length - 1];
  if (Math.hypot(p.x - q.x, p.y - q.y) < 2.5) return;
  penPts.push(p);
  state.penPreview = penBlock(penPts, false);
  draw();
}
function penEnd() {
  const pts = penPts;
  penPts = null; state.penPreview = null;
  if (pts.length < 3) { draw(); return; }
  const b = penBlock(pts, true);
  blocks().push(b);
  refreshAll();
  commit(b.closed ? 'Drew a closed shape. It filled with color.' : 'Drew a stroke. Undo removes it.');
}

// ---------- draw along ----------
function renderGuidePanel() {
  const panel = $('#panel-guide');
  panel.innerHTML = `<p class="panel-intro">Pick a picture and follow along, one step at a time. A faint copy of the finished picture shows where each part goes, like tracing paper.</p>`;
  const grid = document.createElement('div');
  grid.className = 'recipe-grid';
  for (const r of RECIPES) {
    const t = getTemplate(r.id);
    const card = el('button', { class: 'recipe-card', type: 'button', onclick: () => startGuide(r.id) });
    card.innerHTML = renderSceneSVG(t.build(), { prefix: `rc-${r.id}-`, title: r.name }).replace('role="img"', 'aria-hidden="true"') +
      `<span class="rc-name">${esc(r.name)}</span><span class="rc-meta">${esc(r.level)} · ${r.steps.length} steps · about ${r.minutes} min</span>`;
    grid.append(card);
  }
  panel.append(grid);
  panel.append(h('h2', { class: 'panel-sub' }, 'Color it in'), h('p', { class: 'panel-intro' }, 'Coloring pages: pick a color above the canvas, then click any part to fill it. Click the empty paper to color the background.'));
  const cgrid = h('div', { class: 'recipe-grid' });
  for (const t of TEMPLATES) {
    const card = h('button', { class: 'recipe-card', type: 'button', onclick: () => startColoring(t.id) });
    card.innerHTML = renderSceneSVG(toColoringPage(normalizeScene(t.build())), { prefix: `cp-${t.id}-`, title: t.name }).replace('role="img"', 'aria-hidden="true"') +
      `<span class="rc-name">${esc(t.name)}</span><span class="rc-meta">Coloring page</span>`;
    cgrid.append(card);
  }
  panel.append(cgrid);
}

function startGuide(id) {
  const r = getRecipe(id), t = getTemplate(id);
  const target = normalizeScene(t.build());
  togglePen(false); toggleBucket(false, true);
  state.guide = { r, target, step: 0, done: new Set(), stepDone: false, finished: false };
  loadScene({ ...blankScene(), background: clone(target.background), blocks: [] }, `Drawing along: ${r.name}. The faint picture shows where each part goes.`);
  renderGuide();
  $('#guide-do')?.focus();
}

function guideDo(all = false) {
  const g = state.guide;
  const steps = all ? g.r.steps.slice(g.step) : [g.r.steps[g.step]];
  const names = steps.flatMap((st) => st.blocks);
  names.forEach((n) => g.done.add(n));
  const current = new Map(blocks().map((b) => [b.id, b]));
  const tplIds = new Set(g.target.blocks.map((b) => b.id));
  const extras = blocks().filter((b) => !tplIds.has(b.id));
  state.scene.blocks = [...g.target.blocks.filter((b) => g.done.has(b.name)).map((b) => current.get(b.id) || clone(b)), ...extras];
  const fresh = state.scene.blocks.map((b, i) => (names.includes(b.name) && !current.has(b.id) ? i : -1)).filter((i) => i >= 0);
  if (all) { g.step = g.r.steps.length; g.finished = true; } else g.stepDone = true;
  state.sel = null;
  refreshAll();
  popIn(fresh);
  commit(all ? `Finished the ${g.r.name}.` : `Step ${g.step + 1} done: ${steps[0].title}.`);
  renderGuide();
}

function guideMove(dir) {
  const g = state.guide;
  g.step = Math.max(0, Math.min(g.r.steps.length, g.step + dir));
  g.stepDone = g.step < g.r.steps.length && g.r.steps[g.step].blocks.every((n) => g.done.has(n));
  g.finished = g.step >= g.r.steps.length;
  renderGuide(); draw();
}

function exitGuide() {
  state.guide = null;
  $('#guide').hidden = true;
  document.body.classList.remove('guiding');
  draw();
  announce('Stopped drawing along. Your picture stays; keep changing anything you like.');
}

function renderGuide() {
  const g = state.guide, card = $('#guide');
  document.body.classList.toggle('guiding', !!g);
  if (!g) { card.hidden = true; return; }
  card.hidden = false;
  const n = g.r.steps.length;
  $('#guide-dots').innerHTML = g.r.steps.map((st, i) => `<i class="${i < g.step || (i === g.step && g.stepDone) ? 'done' : i === g.step ? 'now' : ''}"></i>`).join('');
  const actions = $('#guide-actions');
  if (g.finished) {
    $('#guide-count').textContent = 'All done';
    $('#guide-title').textContent = `You drew ${g.r.drew}! 🎉`;
    $('#guide-text').textContent = 'Press Bloom to watch it grow, save it as a picture, or keep changing anything you like: every part is still a block you can click.';
    actions.innerHTML = '';
    actions.append(
      el('button', { class: 'btn btn-bloom', type: 'button', onclick: () => bloom(), text: '▶ Bloom it' }),
      el('button', { class: 'btn', type: 'button', onclick: () => exportPNG(), text: 'Save PNG' }),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: exitGuide, text: 'Done' }),
    );
    return;
  }
  const st = g.r.steps[g.step];
  $('#guide-count').textContent = `${g.r.name} · step ${g.step + 1} of ${n}`;
  $('#guide-title').textContent = st.title;
  $('#guide-text').textContent = st.text;
  actions.innerHTML = '';
  if (g.step > 0) actions.append(el('button', { class: 'btn', type: 'button', onclick: () => guideMove(-1), text: '← Back' }));
  if (!g.stepDone) actions.append(el('button', { class: 'btn btn-primary', id: 'guide-do', type: 'button', onclick: () => guideDo(), text: 'Do this step ✨' }));
  actions.append(el('button', { class: g.stepDone ? 'btn btn-primary' : 'btn', id: 'guide-next', type: 'button', onclick: () => guideMove(1), text: g.step === n - 1 ? 'Finish →' : 'Next →' }));
  if (!g.stepDone && g.step < n - 1) actions.append(el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => guideDo(true), text: 'Finish it for me' }));
  if (g.stepDone) $('#guide-next').focus();
}

// ---------- paint bucket and coloring pages ----------
const QUICK = ['#ff4f87', '#ff9a3c', '#ffce3a', '#58c76b', '#3ee6c1', '#4f8bff', '#8b6bff', '#8a5a2b', '#ffffff', '#221f4f'];

function toggleBucket(force, quiet) {
  state.bucket = force ?? !state.bucket;
  if (state.bucket && state.pen.on) togglePen(false);
  $('#btn-bucket').setAttribute('aria-pressed', state.bucket);
  canvas.classList.toggle('bucket-on', state.bucket);
  if (state.bucket && state.sel) select(null);
  if (!quiet) announce(state.bucket ? 'Paint bucket on. Pick a color, then click any part to color it. Press K or Esc when done.' : 'Paint bucket off.');
}

function bucketAt(e) {
  const g = e.target.closest('[data-block]');
  const b = g && blocks().find((x) => x.id === g.dataset.block);
  if (!b) {
    state.scene.background = { ...state.scene.background, mode: 'solid', c1: state.pen.color };
    refreshAll(); commit('Colored the background.');
    return;
  }
  if (b.locked) return announce(`${b.name} is locked.`);
  const what = paintBlock(b, state.pen.color);
  const i = blocks().indexOf(b);
  refreshAll(); popIn(i);
  commit(what === 'line' ? `Colored the lines of ${b.name}.` : `Colored ${b.name}.`);
}

function startColoring(id) {
  const t = getTemplate(id);
  if (state.guide) exitGuide();
  loadScene(toColoringPage(normalizeScene(t.build())), `Coloring page: ${t.name}. Pick a color, then click any part.`);
  toggleBucket(true, true);
}

function renderSwatches() {
  const box = $('#quick-swatches');
  box.replaceChildren(...QUICK.map((c) => h('button', {
    type: 'button', class: 'qs', style: `--c:${c}`, 'aria-label': `Use color ${c}`, title: c,
    onclick: () => { state.pen.color = c; $('#pen-color').value = c; box.querySelectorAll('.qs').forEach((q) => q.setAttribute('aria-pressed', q.title === c)); },
  })));
}

// ---------- tracing photo ----------
function loadTrace(file) {
  if (!file || !file.type.startsWith('image/')) return announce('That file is not a picture.');
  const reader = new FileReader();
  reader.onload = () => {
    state.trace = { url: reader.result, opacity: Number($('#trace-opacity').value) };
    $('#trace-opts').hidden = false;
    if (!state.pen.on) togglePen(true);
    draw();
    announce('Photo placed over the canvas. Draw over it with the pen; it is never saved or exported.');
  };
  reader.readAsDataURL(file);
}

// ---------- my drawings (kept in this browser) ----------
const KEEP_KEY = 'artful-drawing:gallery';
const readKept = () => { try { return JSON.parse(localStorage.getItem(KEEP_KEY)) || []; } catch { return []; } };
const writeKept = (list) => { try { localStorage.setItem(KEEP_KEY, JSON.stringify(list)); return true; } catch { return false; } };

function keepDrawing() {
  flushCommit();
  const list = readKept();
  const n = list.length + 1;
  const name = state.guide ? state.guide.r.name : `Drawing ${n}`;
  list.unshift({ id: uid(), name, date: new Date().toISOString(), scene: clone(state.scene) });
  if (!writeKept(list.slice(0, 30))) return announce('Your browser storage is full. Delete a drawing from My drawings first.');
  renderKept();
  announce(`Saved "${name}" to My drawings (Pictures tab).`);
}

function renderKept() {
  const box = $('#kept');
  if (!box) return;
  const list = readKept();
  box.replaceChildren(
    h('div', { class: 'kept-head' }, h('h2', {}, 'My drawings'), h('button', { class: 'btn btn-small', type: 'button', onclick: keepDrawing }, 'Save this drawing')),
    list.length ? '' : h('p', { class: 'note' }, 'Drawings you save appear here. They stay in this browser.'),
  );
  const grid = h('div', { class: 'template-grid' });
  for (const item of list) {
    const card = h('div', { class: 'template-card kept-card' });
    const open = h('button', { class: 'kept-open', type: 'button', 'aria-label': `Open ${item.name}`, onclick: () => loadScene(item.scene, `Opened ${item.name}. Undo brings back your previous picture.`) });
    open.innerHTML = renderSceneSVG(normalizeScene(item.scene), { prefix: `kp-${item.id}-` }).replace('role="img"', 'aria-hidden="true"') +
      `<strong>${esc(item.name)}</strong><span>${new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`;
    const del = h('button', { class: 'icon-btn kept-del', type: 'button', 'aria-label': `Delete ${item.name}`, title: 'Delete',
      onclick: () => { if (confirm(`Delete "${item.name}" from My drawings?`)) { writeKept(readKept().filter((x) => x.id !== item.id)); renderKept(); } } }, '✕');
    card.append(open, del);
    grid.append(card);
  }
  box.append(grid);
}

// ---------- welcome and quick starts ----------
function quickStart(kind) {
  if (kind === 'guide') { showTab('tab-guide'); announce('Pick a picture to draw along with.'); $('.recipe-card')?.focus(); }
  if (kind === 'pen') {
    loadScene({ ...blankScene(), background: { mode: 'radial', c1: '#2d2766', c2: '#0c0a24', angle: 90 }, blocks: [] }, 'A blank night canvas.');
    state.pen.sym = 'kaleido8'; $('#pen-sym').value = 'kaleido8';
    state.pen.color = '#ffce3a'; $('#pen-color').value = '#ffce3a';
    togglePen(true);
  }
  if (kind === 'color') { showTab('tab-guide'); startColoring('butterfly'); }
  if (kind === 'picture') { loadScene(getTemplate('butterfly').build(), 'Opened the butterfly. Click any part to change it.'); showTab('tab-templates'); }
  if (kind === 'blank') { loadScene(blankScene(), 'A blank canvas. Pick a shape from the shelf.'); showTab('tab-blocks'); }
}

function wireCreative() {
  $('#btn-pen').addEventListener('click', () => togglePen());
  $('#pen-sym').addEventListener('change', (e) => { state.pen.sym = e.target.value; if (!state.pen.on) togglePen(true); });
  $('#pen-color').addEventListener('input', (e) => { state.pen.color = e.target.value; });
  $('#pen-size').addEventListener('input', (e) => { state.pen.size = Number(e.target.value); });
  $('#guide-exit').addEventListener('click', exitGuide);
  $('#btn-bucket').addEventListener('click', () => toggleBucket());
  renderSwatches();
  $('#btn-trace').addEventListener('click', () => $('#trace-file').click());
  $('#trace-file').addEventListener('change', (e) => { loadTrace(e.target.files[0]); e.target.value = ''; });
  $('#trace-opacity').addEventListener('input', (e) => { if (state.trace) { state.trace.opacity = Number(e.target.value); draw(); } });
  $('#trace-remove').addEventListener('click', () => { state.trace = null; $('#trace-opts').hidden = true; draw(); announce('Tracing photo removed.'); });
  // Drop a photo anywhere on the canvas to trace it.
  const frame = $('#canvas-frame');
  frame.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) e.preventDefault(); });
  frame.addEventListener('drop', (e) => { const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); loadTrace(f); } });
  const dlg = $('#welcome');
  dlg.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => { dlg.close(); quickStart(b.dataset.start); }));
  dlg.addEventListener('close', () => { try { localStorage.setItem(WELCOMED_KEY, '1'); } catch { /* ignore */ } });
}

async function init() {
  let scene = null, msg = '';
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('scene')) {
    try { scene = await decodeScene(params.get('scene')); msg = 'Opened a shared picture.'; }
    catch { msg = 'That share link could not be opened. It may have been cut off when copied.'; }
  } else if ((params.get('guide') && getRecipe(params.get('guide'))) || params.get('color')) {
    scene = blankScene();
  } else if (params.get('template') && getTemplate(params.get('template'))) {
    const t = getTemplate(params.get('template'));
    scene = t.build(); msg = `Opened ${t.name}.`;
  }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (!scene) {
    try { const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('blockbloom:scene:v1'); if (saved) scene = JSON.parse(saved); } catch { scene = null; }
  }
  let noSaved = !scene;
  if (!scene) scene = getTemplate('butterfly').build();
  state.scene = normalizeScene(scene);
  committed = JSON.stringify(state.scene);
  persist();
  let firstVisit = false;
  if (noSaved) { try { firstVisit = !localStorage.getItem(WELCOMED_KEY); } catch { firstVisit = false; } }
  renderShelf();
  renderGuidePanel();
  setupTabs();
  wire();
  wireCreative();
  refreshAll();
  if (msg) announce(msg);
  if (params.get('guide') && getRecipe(params.get('guide'))) startGuide(params.get('guide'));
  else if (params.get('color') && getTemplate(params.get('color'))) startColoring(params.get('color'));
  else if (params.get('start')) quickStart(params.get('start'));
  else if (firstVisit && !params.get('scene') && !params.get('template')) $('#welcome').showModal();
  if (params.get('scene') || params.get('template')) { if (!reducedMotion()) bloom(1.3); }
}

// Links inside the site (for example from the landing page) may change only the hash.
window.addEventListener('hashchange', async () => {
  const params = new URLSearchParams(location.hash.slice(1));
  if (![...params.keys()].length) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (params.get('scene')) {
    try { loadScene(await decodeScene(params.get('scene')), 'Opened a shared picture.'); } catch { announce('That share link could not be opened.'); }
  } else if (params.get('template') && getTemplate(params.get('template'))) {
    const t = getTemplate(params.get('template'));
    loadScene(t.build(), `Opened ${t.name}. Undo brings back your previous picture.`);
    if (!reducedMotion()) bloom(1.3);
  } else if (params.get('guide') && getRecipe(params.get('guide'))) startGuide(params.get('guide'));
  else if (params.get('color') && getTemplate(params.get('color'))) startColoring(params.get('color'));
  else if (params.get('start')) quickStart(params.get('start'));
});

init();
