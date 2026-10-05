// artful drawing studio: everything interactive lives here.
// The drawing itself is plain JSON (see model.js) rendered by render.js.

import { SHAPES, CATEGORIES } from './shapes.js';
import { REPEATERS } from './repeaters.js';
import { makeBlock, makeRepeat, blankScene, normalizeScene, EFFECTS, CANVAS_SHAPES, resizeCanvas, moveBlock } from './model.js';
import { pickPrompt } from './prompts.js';
import { renderSceneInner, renderSceneSVG, sceneStats } from './render.js';
import { playBloom, recordBloom, canRecordVideo } from './bloom.js';
import { spotlight, reducedMotion } from './fx.js';
import { RECIPES, getRecipe } from './recipes.js';
import { toColoringPage, paintBlock, harmonize, HARMONIES } from './coloring.js';
import { makeStabilizer, speedPressure, recognizeShape } from './assist.js';
import { critique } from './critique.js';
import { canShade, isShaded, addShading } from './shading.js';
import { startTour } from './tour.js';
import { STAMPS, makeStamp } from './stamps.js';
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
  tool: 'select',   // select | pen | eraser | fill | picker
  prevTool: 'select',
  view: { x: 0, y: 0, z: 1 }, // zoom and pan (the drawing itself never changes)
  recent: [],        // recently used colors
  spaceDown: false,
  multi: new Set(),   // extra selected parts (Shift+click or drag a box)
  marquee: null,
  pen: { on: false, sym: 'mirror', color: '#ff4f87', size: 8, brush: 'brush', steady: 0.35, snap: true, fillLoops: true },
  eraser: { on: false, scope: 'mine' },
  stamp: { kind: 'star', jitter: 0.6, rainbow: true, outline: false },
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
let committed = '', committedLabel = 'Opened';
let commitTimer = null;
const labelOf = (msg) => {
  if (!msg) return 'Adjusted';
  const m = String(msg).split(/(?<=\.)\s/)[0].replace(/\.$/, '');
  return m.length > 46 ? m.slice(0, 44) + '…' : m;
};

function persist() {
  try { localStorage.setItem(STORAGE_KEY, committed); } catch { /* private mode or storage full: drawing still works */ }
}
function commit(msg, label) {
  clearTimeout(commitTimer); commitTimer = null;
  const snap = JSON.stringify(state.scene);
  if (snap !== committed) {
    undoStack.push({ snap: committed, label: committedLabel });
    committedLabel = label || labelOf(msg);
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
function undo(quiet = false) {
  flushCommit();
  if (!undoStack.length) return announce('Nothing to undo.');
  redoStack.push({ snap: committed, label: committedLabel });
  const e = undoStack.pop(); committed = e.snap; committedLabel = e.label;
  restore(committed); if (!quiet) announce(`Undid: ${redoStack[redoStack.length - 1].label}.`);
}
function redo(quiet = false) {
  flushCommit();
  if (!redoStack.length) return announce('Nothing to redo.');
  undoStack.push({ snap: committed, label: committedLabel });
  const e = redoStack.pop(); committed = e.snap; committedLabel = e.label;
  restore(committed); if (!quiet) announce(`Redid: ${committedLabel}.`);
}
function updateHistoryButtons() {
  $('#btn-undo').disabled = !undoStack.length && !commitTimer;
  $('#btn-redo').disabled = !redoStack.length;
  renderHistory();
  helperSoon();
}

// ---------- the Helper: friendly tips with one-click fixes ----------
let ideaIndex = Math.floor(Math.random() * 1000);
function ideaCard() {
  const [idea, start] = pickPrompt(ideaIndex);
  const card = h('section', { class: 'idea-card', 'aria-live': 'polite' },
    h('span', { class: 'idea-label' }, 'Need an idea?'),
    h('strong', {}, idea),
    h('p', {}, start),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => { ideaIndex++; card.replaceWith(ideaCard()); } }, 'Another idea'));
  return card;
}
let helperTimer = 0;
function helperSoon() { clearTimeout(helperTimer); helperTimer = setTimeout(renderHelper, 350); }
function measuredBoxes() {
  const m = new Map();
  for (const b of blocks()) { const bb = b.visible ? bboxOf(b) : null; if (bb) m.set(b.id, { x: bb.x, y: bb.y, width: bb.width, height: bb.height }); }
  return m;
}
function renderHelper() {
  const panel = $('#panel-helper');
  if (!panel || state.stopBloom || penPts) return;
  const boxes = measuredBoxes();
  const all = critique(state.scene, boxes);
  const tips = all.filter((t) => t.kind === 'tip'), good = all.filter((t) => t.kind === 'good');
  const badge = $('#helper-badge');
  badge.textContent = tips.length; badge.hidden = !tips.length;
  if (panel.hidden) return;
  const preview = (tip) => {
    try { canvas.innerHTML = renderSceneInner(normalizeScene(tip.fix(state.scene, boxes)), { prefix: 'pv-' }); } catch { draw(); }
  };
  panel.replaceChildren(
    ideaCard(),
    h('div', { class: 'helper-head' },
      h('h2', {}, tips.length ? `Suggestions (${tips.length})` : 'No suggestions'),
      h('p', { class: 'note' }, tips.length
        ? 'Like an art teacher looking over your shoulder. Hover a fix to preview it; every fix is one step you can undo. You stay the artist.'
        : 'No suggestions right now. Keep drawing: the Helper checks again after every change.')),
    ...tips.map((t) => h('article', { class: 'tip-card' },
      h('h3', {}, t.title),
      h('p', {}, t.why),
      h('div', { class: 'tip-actions' },
        t.fix ? h('button', {
          type: 'button', class: 'btn btn-primary btn-small',
          onpointerenter: () => preview(t), onfocus: () => preview(t), onpointerleave: () => draw(), onblur: () => draw(),
          onclick: () => {
            const next = normalizeScene(t.fix(state.scene, boxes));
            state.scene.background = next.background; state.scene.blocks = next.blocks;
            refreshAll();
            commit(`Helper: ${t.fixLabel}. Undo if you liked it better before.`, `Helper: ${t.fixLabel}`);
          },
        }, t.fixLabel || 'Apply fix') : null,
        t.ids?.length ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
          selectMany(blocks().filter((b) => t.ids.includes(b.id)));
          canvas.classList.remove('snapped'); void canvas.getBoundingClientRect(); canvas.classList.add('snapped');
        } }, 'Show me') : null,
        t.learn ? h('a', { class: 'tip-learn', href: t.learn, target: '_blank', rel: 'noopener' }, 'Why?') : null,
      ))),
    good.length ? h('section', { class: 'helper-good' }, h('h3', {}, 'What’s working'),
      h('ul', {}, ...good.map((g) => h('li', {}, h('strong', {}, g.title), ' ', g.why)))) : null,
  );
}

/** The History panel: every step you took; click one to go back (or forward) to it. */
function renderHistory() {
  const list = $('#history-list');
  if (!list) return;
  const past = undoStack.slice(-40).map((e, i, arr) => ({ label: e.label, back: arr.length - i }));
  const future = [...redoStack].reverse().map((e, i) => ({ label: e.label, fwd: i + 1 }));
  list.replaceChildren(
    ...past.map((e) => h('li', {}, h('button', { type: 'button', onclick: () => { for (let k = 0; k < e.back; k++) undo(true); announce(`Went back to: ${committedLabel}.`); } }, e.label))),
    h('li', { class: 'now' }, h('button', { type: 'button', 'aria-current': 'step' }, committedLabel)),
    ...future.map((e) => h('li', { class: 'future' }, h('button', { type: 'button', onclick: () => { for (let k = 0; k < e.fwd; k++) redo(true); announce(`Went forward to: ${committedLabel}.`); } }, e.label))),
  );
  list.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
}

// ---------- drawing ----------
function draw() {
  if (state.stopBloom) stopBloom();
  const v = state.view;
  canvas.style.aspectRatio = `${W()} / ${H()}`;
  canvas.setAttribute('viewBox', `${r1(v.x)} ${r1(v.y)} ${r1(W() / v.z)} ${r1(H() / v.z)}`);
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

/** While the pen is out, show the lines every stroke will be mirrored or spun around. */
function symmetryGuides(w, hh, ns) {
  const cx = w / 2, cy = hh / 2, R = Math.hypot(w, hh);
  const sym = state.pen.sym, n = Number(sym.replace(/\D/g, '')) || 1;
  let lines = [];
  if (sym === 'mirror') lines = [[cx, 0, cx, hh]];
  else if (sym.startsWith('spin')) lines = Array.from({ length: n }, (_, k) => { const a = (k * 2 * Math.PI) / n - Math.PI / 2; return [cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  else lines = Array.from({ length: n }, (_, k) => { const a = (k * Math.PI) / n - Math.PI / 2; return [cx - Math.cos(a) * R, cy - Math.sin(a) * R, cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  return `<g stroke="#8b6bff" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="3 7" ${ns}>` +
    lines.map(([x1, y1, x2, y2]) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" ${ns}/>`).join('') + '</g>';
}

function drawOverlay() {
  const w = W(), hh = H(), ns = 'vector-effect="non-scaling-stroke"';
  let o = '<g id="overlay" pointer-events="none">';
  if (state.guides) {
    o += `<g stroke="#221f4f" stroke-opacity="0.18" ${ns}>` +
      [1, 2].map((i) => `<line x1="${(w * i) / 3}" y1="0" x2="${(w * i) / 3}" y2="${hh}" ${ns}/><line x1="0" y1="${(hh * i) / 3}" x2="${w}" y2="${(hh * i) / 3}" ${ns}/>`).join('') +
      `</g><g stroke="#ff4f87" stroke-opacity="0.45" stroke-dasharray="6 6" ${ns}><line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${hh}" ${ns}/><line x1="0" y1="${hh / 2}" x2="${w}" y2="${hh / 2}" ${ns}/></g>`;
  }
  if (state.tool === 'pen' && state.pen.sym !== 'none') o += symmetryGuides(w, hh, ns);
  for (const gb of groupBlocks()) {
    if (gb.id === state.sel || !gb.visible) continue;
    const bb = bboxOf(gb);
    if (bb) o += `<rect x="${bb.x - 6}" y="${bb.y - 6}" width="${bb.width + 12}" height="${bb.height + 12}" fill="none" stroke="#8b6bff" stroke-width="2" stroke-dasharray="4 4" ${ns}/>`;
  }
  for (const l of state.smartLines || []) {
    o += `<line x1="${r1(l[0])}" y1="${r1(l[1])}" x2="${r1(l[2])}" y2="${r1(l[3])}" stroke="#ff2d95" stroke-width="1.5" ${ns}/>` +
      `<circle cx="${r1(l[0])}" cy="${r1(l[1])}" r="3" fill="#ff2d95" ${ns}/><circle cx="${r1(l[2])}" cy="${r1(l[3])}" r="3" fill="#ff2d95" ${ns}/>`;
  }
  if (state.marquee) {
    const m = state.marquee, x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
    o += `<rect x="${x}" y="${y}" width="${Math.abs(m.x1 - m.x0)}" height="${Math.abs(m.y1 - m.y0)}" fill="rgba(139,107,255,0.12)" stroke="#8b6bff" stroke-width="1.5" stroke-dasharray="5 4" ${ns}/>`;
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
  const b = selected(), n = groupBlocks().length;
  $('#stage-status').textContent = n > 1 ? `${n} parts selected. Drag or use the arrow keys to move them together.` : b
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
function select(id, keepGroup = false) {
  if (!keepGroup) state.multi.clear();
  state.sel = id;
  draw();
  renderInspector();
  renderLayers();
}

/** Everything selected: the main part plus any Shift+clicked or box-selected parts. */
function groupBlocks() {
  const ids = new Set([state.sel, ...state.multi].filter(Boolean));
  return blocks().filter((b) => ids.has(b.id));
}
function toggleInGroup(b) {
  if (!state.sel) { select(b.id); return; }
  if (b.id === state.sel) { const next = [...state.multi][0] || null; state.multi.delete(next); state.sel = next; }
  else if (state.multi.has(b.id)) state.multi.delete(b.id);
  else state.multi.add(b.id);
  draw(); renderInspector(); renderLayers();
}
function selectMany(list) {
  state.multi.clear();
  if (!list.length) { select(null); return; }
  state.sel = list[list.length - 1].id;
  list.slice(0, -1).forEach((b) => state.multi.add(b.id));
  draw(); renderInspector(); renderLayers();
}
function bboxOf(b) {
  const g = canvas.querySelector(`[data-block="${CSS.escape(b.id)}"]`);
  try { const bb = g && g.getBBox(); return bb && bb.width + bb.height > 0 ? bb : null; } catch { return null; }
}
function groupSelection() {
  const list = groupBlocks();
  if (list.length < 2) return announce('Select two or more parts first (Shift+click, or drag a box), then press Ctrl+G.');
  const gid = uid();
  list.forEach((b) => { b.group = gid; });
  renderLayers(); renderInspector();
  commit(`Grouped ${list.length} parts. Click any of them to move them all; Alt+click picks one.`, `Grouped ${list.length} parts`);
}
function ungroupSelection() {
  const list = groupBlocks().filter((b) => b.group);
  if (!list.length) return announce('Nothing grouped is selected.');
  const gids = new Set(list.map((b) => b.group));
  blocks().forEach((b) => { if (gids.has(b.group)) b.group = ''; });
  renderLayers(); renderInspector();
  commit('Ungrouped. Each part moves on its own again.', 'Ungrouped');
}
function shadeSelected() {
  const b = selected();
  if (!canShade(b)) return announce('Shading works on filled shapes like circles, hearts, eggs and blobs.');
  if (isShaded(state.scene, b)) return announce(`${b.name} already has shading.`);
  const next = addShading(state.scene, b.id);
  state.scene.blocks = next.blocks;
  refreshAll();
  commit(`Added shading to ${b.name}: a shadow, a highlight and a crisp outline, grouped with it. Undo removes it.`, `Shaded ${b.name}`);
}

/** Line parts up with each other, like Align in a design app. */
function alignGroup(how) {
  const items = groupBlocks().map((b) => ({ b, bb: bboxOf(b) })).filter((x) => x.bb && !x.b.locked);
  if (items.length < 2) return;
  const minX = Math.min(...items.map((x) => x.bb.x)), maxX = Math.max(...items.map((x) => x.bb.x + x.bb.width));
  const minY = Math.min(...items.map((x) => x.bb.y)), maxY = Math.max(...items.map((x) => x.bb.y + x.bb.height));
  for (const { b, bb } of items) {
    if (how === 'left') b.x += minX - bb.x;
    if (how === 'right') b.x += maxX - (bb.x + bb.width);
    if (how === 'center') b.x += (minX + maxX) / 2 - (bb.x + bb.width / 2);
    if (how === 'top') b.y += minY - bb.y;
    if (how === 'bottom') b.y += maxY - (bb.y + bb.height);
    if (how === 'middle') b.y += (minY + maxY) / 2 - (bb.y + bb.height / 2);
  }
  if (how === 'spread-x' || how === 'spread-y') {
    const ax = how === 'spread-x';
    items.sort((p, q) => (ax ? p.bb.x - q.bb.x : p.bb.y - q.bb.y));
    const first = items[0], last = items[items.length - 1];
    const start = ax ? first.bb.x + first.bb.width / 2 : first.bb.y + first.bb.height / 2;
    const end = ax ? last.bb.x + last.bb.width / 2 : last.bb.y + last.bb.height / 2;
    items.forEach(({ b, bb }, i) => {
      const target = start + ((end - start) * i) / (items.length - 1);
      if (ax) b.x += target - (bb.x + bb.width / 2); else b.y += target - (bb.y + bb.height / 2);
    });
  }
  refreshAll();
  commit(`Aligned ${items.length} parts.`);
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
  text: { text: 'Aa', strokeWidth: 4, w: 200, h: 150 },
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
  if (['night', 'studio'].includes(document.documentElement.dataset.theme)) {
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
  const tabs = [$('#tab-blocks'), $('#tab-guide'), $('#tab-templates'), $('#tab-helper')];
  const show = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    if (tab.id === 'tab-helper') renderHelper();
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
    const inp = spec.multiline
      ? h('textarea', { id, rows: 2, oninput: () => { target[spec.key] = inp.value; draw(); commitSoon(); }, onchange: () => commit('Changed the words.', 'Changed the words') })
      : h('input', { type: 'text', id, value: target[spec.key], oninput: () => { target[spec.key] = inp.value; renderLayers(); }, onchange: () => commit() });
    if (spec.multiline) inp.value = target[spec.key] ?? '';
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
  renderInspectorBase();
  const n = groupBlocks().length;
  if (n < 2) return;
  const bar = (how, label, title) => h('button', { type: 'button', class: 'btn btn-small', title, onclick: () => alignGroup(how) }, label);
  $('#inspector').prepend(h('section', { class: 'group-banner', 'aria-label': 'Selected parts' },
    h('strong', {}, `${n} parts selected`),
    h('p', {}, 'Drag or use the arrow keys to move them together. Delete, duplicate and the layer keys work on all of them. The settings below are for the last one you picked.'),
    h('div', { class: 'align-row', role: 'group', 'aria-label': 'Align' },
      bar('left', '⇤', 'Align left edges'), bar('center', '↔', 'Center horizontally'), bar('right', '⇥', 'Align right edges'),
      bar('top', '⤒', 'Align top edges'), bar('middle', '↕', 'Center vertically'), bar('bottom', '⤓', 'Align bottom edges'),
      bar('spread-x', '⋯', 'Space evenly left to right'), bar('spread-y', '⋮', 'Space evenly top to bottom')),
    h('div', { class: 'align-row' },
      h('button', { type: 'button', class: 'btn btn-small', onclick: groupSelection, title: 'Ctrl+G' }, 'Group'),
      groupBlocks().some((x) => x.group) ? h('button', { type: 'button', class: 'btn btn-small', onclick: ungroupSelection, title: 'Ctrl+Shift+G' }, 'Ungroup') : null),
  ));
}

function renderInspectorBase() {
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
    control(b, { key: 'effect', label: 'Effect', type: 'select', options: EFFECTS }),
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
    canShade(b) && !isShaded(state.scene, b) ? h('button', { type: 'button', class: 'btn btn-small', onclick: shadeSelected, title: 'Add a shadow, a highlight and a crisp outline' }, 'Add shading') : null,
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => duplicate(b) }, 'Duplicate'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => moveLayer(b, 1) }, 'Bring forward'),
    h('button', { type: 'button', class: 'btn btn-small', onclick: () => moveLayer(b, -1) }, 'Send backward'),
    h('button', { type: 'button', class: 'btn btn-small', 'aria-pressed': b.locked, onclick: () => { b.locked = !b.locked; refreshAll(); commit(b.locked ? `${b.name} locked. It can't be dragged.` : `${b.name} unlocked.`); } }, b.locked ? 'Unlock' : 'Lock'),
    h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => removeBlock(b) }, 'Delete'),
  ));
}

function renderCanvasSettings(root) {
  const bg = state.scene.background;
  if (!state.bgSeen) { state.openSections.add('bg'); state.openSections.add('size'); state.bgSeen = true; }
  root.append(
    h('div', { class: 'insp-head' }, h('div', { class: 'kind' }, 'Nothing selected'), h('h2', {}, 'Canvas'),
      h('p', {}, 'Pick a block from the shelf, click something on the canvas, or open a starter picture. Here you can change the background.')),
    section('size', 'Canvas shape',
      (() => {
        const cur = CANVAS_SHAPES.find(([, , cw, ch]) => cw === W() && ch === H());
        const id = fid();
        const sel = h('select', { id, onchange: () => {
          const shape = CANVAS_SHAPES.find(([k]) => k === sel.value);
          if (!shape) return;
          resizeCanvas(state.scene, shape[2], shape[3]);
          state.view = { x: 0, y: 0, z: 1 }; $('#zoom-level').textContent = '100%';
          refreshAll(); commit(`Canvas is now ${shape[1].toLowerCase()}. Your drawing stays centered.`);
        } }, CANVAS_SHAPES.map(([k, label, cw, ch]) => h('option', { value: k, selected: cur && cur[0] === k }, `${label} · ${cw}×${ch}`)),
        cur ? null : h('option', { value: '', selected: true }, `Custom · ${W()}×${H()}`));
        return h('div', { class: 'field' }, h('label', { for: id }, 'Shape'), sel,
          h('p', { class: 'note' }, 'Posters and cards suit portrait; phone wallpapers suit 9:16. Your drawing stays centered.'));
      })(),
    ),
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
    const li = h('li', { class: `layer${b.id === state.sel || state.multi.has(b.id) ? ' is-selected' : ''}${b.visible ? '' : ' is-hidden'}`, draggable: 'true', 'data-id': b.id, title: 'Drag to change the order. Alt+Up / Alt+Down also work.' },
      h('span', { class: 'layer-grip', 'aria-hidden': 'true' }, '⠿'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${b.visible ? 'Hide' : 'Show'} ${b.name}`, 'aria-pressed': !b.visible, html: b.visible ? ICON_EYE : ICON_EYE_OFF, onclick: () => { b.visible = !b.visible; refreshAll(); commit(); } }),
      h('button', { type: 'button', class: 'layer-name', 'aria-current': b.id === state.sel ? 'true' : null,
        onclick: (e) => (e.shiftKey ? toggleInGroup(b) : select(b.id)),
        onkeydown: (e) => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault(); e.stopPropagation();
          const i = blocks().indexOf(b);
          moveBlock(state.scene, b.id, e.key === 'ArrowUp' ? i + 1 : i - 1);
          refreshAll(); commit(`Moved ${b.name} ${e.key === 'ArrowUp' ? 'up' : 'down'}.`, `Reordered ${b.name}`);
          $(`#layers [data-id="${CSS.escape(b.id)}"] .layer-name`)?.focus();
        } }, b.name, b.group ? h('span', { class: 'layer-chain', title: 'Grouped' }, 'G') : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${b.locked ? 'Unlock' : 'Lock'} ${b.name}`, 'aria-pressed': b.locked, html: b.locked ? ICON_LOCK : ICON_UNLOCK, onclick: () => { b.locked = !b.locked; refreshAll(); commit(); } }),
    );
    li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('is-dragging'); });
    li.addEventListener('dragend', () => li.classList.remove('is-dragging'));
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      const r = li.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
      li.classList.toggle('drop-above', above); li.classList.toggle('drop-below', !above);
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-above', 'drop-below'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const above = li.classList.contains('drop-above');
      li.classList.remove('drop-above', 'drop-below');
      const id = e.dataTransfer.getData('text/plain');
      if (!id || id === b.id) return;
      const moving = blocks().find((x) => x.id === id);
      const list = blocks();
      list.splice(list.indexOf(moving), 1);
      const target = list.indexOf(b);
      list.splice(above ? target + 1 : target, 0, moving); // the list shows the top first, so "above" means drawn later
      refreshAll();
      commit(`Moved ${moving.name} ${above ? 'in front of' : 'behind'} ${b.name}.`, `Reordered ${moving.name}`);
    });
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

// ---------- touch: two fingers zoom and pan; with a stylus, fingers never draw (palm rejection) ----------
const touches = new Map();
let pinch = null;
function cancelActive() {
  if (penPts) { penPts = null; state.penPreview = null; snap = null; clearTimeout(holdTimer); }
  if (stamping) { const g = stamping.group; state.scene.blocks = blocks().filter((x) => x.group !== g); stamping = null; }
  if (filling) { if (filling.b) Object.assign(filling.b, filling.before); else Object.assign(state.scene.background, filling.before); filling = null; }
  if (erasing) erasing = null;
  if (drag) drag = null;
  state.marquee = null;
  draw();
}
function pinchState() {
  const [a, b] = [...touches.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'pen') state.sawPen = true;
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { cancelActive(); pinch = { ...pinchState(), z: state.view.z }; return; }
    if (touches.size > 2) return;
    if (state.sawPen) { if (state.view.z > 1) panStart(e); return; } // stylus in use: a resting palm or finger never draws
  }
  if (state.stopBloom) { stopBloom(); draw(); }
  if (e.button === 1 || state.spaceDown) { panStart(e); return; }
  if (e.button !== 0) return;
  if (state.tool === 'picker' || (e.altKey && (state.tool === 'pen' || state.tool === 'fill'))) { pickAt(e); return; }
  if (state.pen.on) { penStart(e); return; }
  if (state.bucket) { fillStart(e); return; }
  if (state.tool === 'stamp') { stampStart(e); return; }
  if (state.eraser.on) { eraseStart(e); return; }
  const g = e.target.closest('[data-block]');
  const p = toSvgPoint(e);
  if (!g) { // empty paper: drag a box to select several parts
    if (!e.shiftKey && state.sel) select(null);
    state.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  const b = blocks().find((x) => x.id === g.dataset.block);
  if (!b) return;
  if (e.shiftKey) { toggleInGroup(b); return; }
  let inGroup = groupBlocks().some((x) => x.id === b.id) && groupBlocks().length > 1;
  if (!inGroup && b.group && !e.altKey) { // a grouped part: pick up the whole group (Alt+click picks just this part)
    const members = blocks().filter((x) => x.group === b.group);
    selectMany([...members.filter((x) => x.id !== b.id), b]);
    inGroup = members.length > 1;
  }
  if (!inGroup && state.sel !== b.id) select(b.id);
  if (b.locked) { announce(`${b.name} is locked. Unlock it in Layers to move it.`); return; }
  const items = (inGroup ? groupBlocks() : [b]).filter((x) => !x.locked).map((x) => ({ b: x, dx: x.x - p.x, dy: x.y - p.y }));
  drag = { b, items, moved: false, guides: items.length === 1 ? smartTargets(b) : null };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const now = pinchState(), r = canvas.getBoundingClientRect(), k = (W() / state.view.z) / r.width;
      panBy(-(now.mx - pinch.mx) * k, -(now.my - pinch.my) * k);
      const p = toSvgPoint({ clientX: now.mx, clientY: now.my });
      setZoom(pinch.z * (now.d / pinch.d), p.x, p.y);
      pinch.mx = now.mx; pinch.my = now.my;
      return;
    }
  }
  moveBrushCursor(e);
  if (panning) { panMove(e); return; }
  if (penPts) { penMove(e); return; }
  if (erasing) { eraseAt(e); return; }
  if (stamping) { stampMove(e); return; }
  if (filling) { fillMove(e); return; }
  if (state.marquee) { const q = toSvgPoint(e); state.marquee.x1 = q.x; state.marquee.y1 = q.y; draw(); return; }
  if (!drag) return;
  const p = toSvgPoint(e);
  let moved = false;
  state.smartLines = [];
  for (const it of drag.items) {
    let x = p.x + it.dx, y = p.y + it.dy;
    if (state.snap) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
    if (drag.guides && !e.altKey) ({ x, y } = smartSnap(drag.guides, x, y));
    if (x !== it.b.x || y !== it.b.y) { it.b.x = x; it.b.y = y; moved = true; }
  }
  if (moved) { drag.moved = true; draw(); }
});

function endTouch(e) {
  touches.delete(e.pointerId);
  if (pinch && touches.size < 2) { pinch = null; return true; }
  return false;
}
canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch' && endTouch(e)) e.stopImmediatePropagation(); }, true);
canvas.addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') endTouch(e); }, true);

function endDrag() {
  if (panning) { panning = null; canvas.classList.remove('is-panning'); return; }
  if (penPts) { penEnd(); return; }
  if (erasing) { eraseEnd(); return; }
  if (stamping) { stampEnd(); return; }
  if (filling) { fillEnd(); return; }
  if (state.marquee) { endMarquee(); return; }
  if (!drag) return;
  const moved = drag.moved, count = drag.items.length;
  drag = null;
  if (state.smartLines?.length) { state.smartLines = []; draw(); }
  canvas.classList.remove('dragging');
  if (moved) { commit(null, count > 1 ? `Moved ${count} parts` : 'Moved'); renderInspector(); }
}
function endMarquee() {
  const m = state.marquee;
  state.marquee = null;
  const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
  if (x1 - x0 < 4 && y1 - y0 < 4) { draw(); return; }
  const hits = blocks().filter((b) => {
    if (!b.visible || b.locked) return false;
    const bb = bboxOf(b);
    return bb && bb.x < x1 && bb.x + bb.width > x0 && bb.y < y1 && bb.y + bb.height > y0;
  });
  if (m.add) hits.unshift(...groupBlocks().filter((b) => !hits.includes(b)));
  selectMany(hits);
  if (hits.length) announce(hits.length === 1 ? `Selected ${hits[0].name}.` : `Selected ${hits.length} parts.`);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) { // pinch or Ctrl+scroll: zoom around the pointer
    e.preventDefault();
    const p = toSvgPoint(e);
    setZoom(state.view.z * Math.exp(-e.deltaY * 0.0025), p.x, p.y);
    return;
  }
  const b = selected();
  if (state.view.z > 1 && (!b || state.tool !== 'select')) { // zoomed in: scroll to look around
    e.preventDefault();
    const k = (W() / state.view.z) / canvas.getBoundingClientRect().width;
    panBy(e.deltaX * k, e.deltaY * k);
    return;
  }
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
  if (mod && (key === '=' || key === '+')) { e.preventDefault(); zoomStep(1.25); return; }
  if (mod && (key === '-' || key === '_')) { e.preventDefault(); zoomStep(0.8); return; }
  if (mod && key === '0') { e.preventDefault(); setZoom(1); return; }
  if (typing) { if (key === 'Escape') t.blur(); return; }
  if (t.type === 'range' && key.startsWith('Arrow')) return; // let sliders use arrows
  if (key.startsWith('Arrow') && t.closest && t.closest('[role="tablist"]')) return; // tabs use arrows too

  const b = selected();
  if (key === '?') { e.preventDefault(); openHelp(); return; }
  if (!mod && !typing && key.toLowerCase() === 'p') { e.preventDefault(); togglePen(); return; }
  if (!mod && !typing && key.toLowerCase() === 'k') { e.preventDefault(); toggleBucket(); return; }
  if (!mod && !typing && key.toLowerCase() === 'v') { e.preventDefault(); setTool('select'); return; }
  if (!mod && !typing && key.toLowerCase() === 's') { e.preventDefault(); setTool(state.tool === 'stamp' ? 'select' : 'stamp'); return; }
  if (!mod && !typing && key.toLowerCase() === 'i') { e.preventDefault(); setTool(state.tool === 'picker' ? state.prevTool : 'picker'); return; }
  if (!mod && !typing && key.toLowerCase() === 'e') { e.preventDefault(); setTool(state.tool === 'eraser' ? 'select' : 'eraser'); return; }
  if (key === 'Escape' && state.tool !== 'select') { setTool('select'); return; }
  if (key === 'Escape') { if (state.stopBloom) { stopBloom(); draw(); return; } if (state.sel) { select(null); announce('Nothing selected.'); } return; }
  if (!mod && key.toLowerCase() === 'b') { e.preventDefault(); bloom(); return; }
  if (key === ',' || key === '<') { e.preventDefault(); cycleSelection(-1); return; }
  if (key === '.' || key === '>') { e.preventDefault(); cycleSelection(1); return; }
  if (!mod && key.toLowerCase() === 'g') { state.guides = !state.guides; $('#opt-guides').checked = state.guides; draw(); return; }
  if (mod && key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
  if (mod && key.toLowerCase() === 'a') { e.preventDefault(); selectMany(blocks().filter((x) => x.visible && !x.locked)); announce(`Selected all ${groupBlocks().length} parts.`); return; }
  if (!b) return;
  const group = groupBlocks();
  if (group.length > 1) {
    if (mod && key.toLowerCase() === 'd') {
      e.preventDefault();
      const copies = group.map((x) => ({ ...clone(x), id: uid(), name: `${x.name} copy`, x: x.x + 24, y: x.y + 24 }));
      blocks().push(...copies); refreshAll(); selectMany(copies); commit(`Duplicated ${copies.length} parts.`);
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      const ids = new Set(group.map((x) => x.id));
      state.scene.blocks = blocks().filter((x) => !ids.has(x.id));
      blocks().forEach((o) => { if (ids.has(o.clipTo)) o.clipTo = ''; });
      select(null); refreshAll(); commit(`Deleted ${ids.size} parts. Undo brings them back.`);
      return;
    }
    if (mod || e.altKey) return;
    const step = e.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[key]) {
      e.preventDefault();
      group.filter((x) => !x.locked).forEach((x) => { x.x += moves[key][0]; x.y += moves[key][1]; });
      draw(); commitSoon(); updateHistoryButtons();
    }
    return;
  }

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

async function exportPNG(scale = 2, transparent = false) {
  const scene = transparent ? { ...state.scene, background: { mode: 'solid', c1: 'none', c2: 'none', angle: 90 } } : state.scene;
  const svg = renderSceneSVG(scene, { prefix: 'x-' });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = W() * scale; c.height = H() * scale;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((blob) => { download(blob, fileBase() + (transparent ? '-sticker' : '') + '.png'); announce(transparent ? 'Sticker downloaded: a PNG with a see-through background.' : 'Picture downloaded.'); }, 'image/png');
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
    if (act === 'sticker') exportPNG(2, true);
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

const r1 = (v) => Math.round(v * 10) / 10;

// ---------- tools: select, pen, eraser, fill (like the tool bar in a paint program) ----------
const TOOLS = {
  select: ['Select', 'Select tool. Click a part to change it; drag to move it.'],
  pen: ['Pen', 'Pen. Drag to draw. Hold still at the end of a stroke to snap it into a clean shape. Press V or Esc for the Select tool.'],
  eraser: ['Eraser', 'Eraser. Rub over lines and shapes to remove them. Undo brings them back.'],
  fill: ['Fill', 'Paint bucket. Pick a color, then click any part to color it. Click the paper to color the background.'],
  stamp: ['Stamp', 'Stamp. Click to stamp, or drag to scatter a trail. Size and color come from the bar above; Rainbow varies the colors.'],
  picker: ['Color picker', 'Color picker. Click any part to borrow its color. Tip: hold Alt while using the Pen or Fill to pick a color in one click.'],
};
function setTool(t, quiet = false) {
  if (t === 'picker' && state.tool !== 'picker') state.prevTool = state.tool;
  state.tool = t;
  state.pen.on = t === 'pen'; state.bucket = t === 'fill'; state.eraser.on = t === 'eraser';
  document.querySelectorAll('.tool-rail [data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t));
  $('#options-bar').dataset.tool = t;
  $('#tool-name').textContent = TOOLS[t][0];
  canvas.classList.toggle('pen-on', t === 'pen');
  canvas.classList.toggle('bucket-on', t === 'fill');
  canvas.classList.toggle('eraser-on', t === 'eraser');
  canvas.classList.toggle('picker-on', t === 'picker');
  canvas.classList.toggle('stamp-on', t === 'stamp');
  $('#brush-cursor').hidden = true;
  draw();
  if (t !== 'select' && state.sel) select(null);
  if (!quiet) announce(TOOLS[t][1]);
}
function togglePen(force) { setTool((force ?? state.tool !== 'pen') ? 'pen' : 'select', force === false); }
function toggleBucket(force, quiet) { setTool((force ?? state.tool !== 'fill') ? 'fill' : 'select', !!quiet || force === false); }

// ---------- pen, with a steady hand, brush pressure and shape snapping ----------
let stab = null, pressure = null, snap = null, holdTimer = 0, lastMove = null;

function repeatsForPen() { return SYM[state.pen.sym].map(([mode, o]) => makeRepeat(mode, o)); }
function penStyle(closed) {
  const { color, size, fillLoops } = state.pen;
  return closed
    ? (fillLoops ? { fill: color, fillMode: 'solid', stroke: '#221f4f', strokeWidth: Math.max(3, size * 0.5) } : { fillMode: 'none', stroke: color, strokeWidth: size })
    : { fill: color, stroke: color, strokeWidth: size };
}

function penBlock(raw, final) {
  const pts = final ? simplifyStroke(raw, 1.1) : raw;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const first = raw[0], last = raw[raw.length - 1];
  const closed = final && raw.length > 10 && Math.hypot(last.x - first.x, last.y - first.y) < Math.max(20, 0.15 * Math.max(w, h));
  return makeBlock('stroke', {
    name: closed ? 'Pen shape' : 'Pen stroke', penMade: true,
    x: r1(cx), y: r1(cy), w: r1(w), h: r1(h), closed, smooth: 0.6, brush: state.pen.brush, seed: Math.floor(Math.random() * 999),
    points: pts.map((p) => [Math.round(((p.x - cx) / w) * 1000) / 1000, Math.round(((p.y - cy) / h) * 1000) / 1000, Math.round((p.p ?? 1) * 100) / 100]),
    ...penStyle(closed),
    repeats: repeatsForPen(),
  });
}

/** Turn a recognized shape into a clean block, in the pen's color and symmetry. */
function snapBlock(rec) {
  const name = { star: 'Star', circle: 'Circle', ellipse: 'Oval', rect: 'Rectangle', triangle: 'Triangle', polygon: 'Polygon', shape: 'Shape', line: 'Straight line' }[rec.kind];
  const common = { name: `${name} (drawn)`, penMade: true, repeats: repeatsForPen() };
  if (rec.kind === 'circle' || rec.kind === 'ellipse') return makeBlock('circle', { ...common, x: r1(rec.cx), y: r1(rec.cy), w: r1(rec.w), h: r1(rec.h), rot: r1(rec.rot), ...penStyle(true) });
  if (rec.kind === 'rect') return makeBlock('rect', { ...common, x: r1(rec.cx), y: r1(rec.cy), w: r1(rec.w), h: r1(rec.h), rot: r1(rec.rot), radius: 0, ...penStyle(true) });
  if (rec.kind === 'star') return makeBlock('star', { ...common, points: rec.points, inner: Math.round(rec.inner * 100) / 100, x: r1(rec.cx), y: r1(rec.cy), w: r1(rec.r * 2), h: r1(rec.r * 2), rot: r1(rec.rot), ...penStyle(true) });
  if (rec.kind === 'polygon') return makeBlock('polygon', { ...common, sides: rec.sides, x: r1(rec.cx), y: r1(rec.cy), w: r1(rec.r * 2), h: r1(rec.r * 2), rot: r1(rec.rot), ...penStyle(true) });
  // triangle, irregular shape, line: straight edges through the corners you drew
  const closed = rec.kind !== 'line';
  const b = penBlock(rec.points.map((p) => ({ ...p, p: 1 })), false);
  Object.assign(b, { ...common, smooth: 0, closed, brush: closed ? b.brush : 'ink', ...penStyle(closed) });
  return b;
}

function penStart(e) {
  const p = toSvgPoint(e);
  stab = makeStabilizer(state.pen.steady * 28);
  pressure = e.pointerType === 'pen' && e.pressure > 0 ? Math.min(1.3, e.pressure * 1.5) : 1;
  snap = null; lastMove = { ...p, t: performance.now() };
  penPts = [{ ...stab.push(p), p: pressure }];
  canvas.setPointerCapture(e.pointerId);
}

function penMove(e) {
  const raw = toSvgPoint(e), now = performance.now();
  // Moving again after a snap means "no thanks": go back to the hand-drawn line.
  if (snap && Math.hypot(raw.x - snap.at.x, raw.y - snap.at.y) > 8) { snap = null; canvas.classList.remove('snapped'); }
  const speed = lastMove ? Math.hypot(raw.x - lastMove.x, raw.y - lastMove.y) / Math.max(1, now - lastMove.t) * 16 : 0;
  lastMove = { ...raw, t: now };
  pressure = e.pointerType === 'pen' && e.pressure > 0 ? Math.min(1.3, e.pressure * 1.5) : speedPressure(pressure, speed);
  const p = stab.push(raw);
  if (p && Math.hypot(p.x - penPts[penPts.length - 1].x, p.y - penPts[penPts.length - 1].y) >= 2) penPts.push({ ...p, p: pressure });
  if (!snap) { state.penPreview = penBlock(penPts, false); draw(); }
  clearTimeout(holdTimer);
  if (state.pen.snap) holdTimer = setTimeout(() => trySnap(raw), 480);
}

function trySnap(at) {
  if (!penPts || snap) return;
  const rec = recognizeShape(penPts);
  if (!rec) return;
  snap = { rec, at, block: snapBlock(rec) };
  state.penPreview = snap.block;
  canvas.classList.remove('snapped'); void canvas.getBoundingClientRect(); canvas.classList.add('snapped');
  draw();
  announce(`Snapped to a ${snap.block.name.replace(' (drawn)', '').toLowerCase()}. Let go to keep it, or keep moving to cancel.`);
}

function penEnd() {
  clearTimeout(holdTimer);
  const pts = penPts, snapped = snap;
  penPts = null; state.penPreview = null; snap = null;
  canvas.classList.remove('snapped');
  if (!pts || pts.length < 2) { draw(); return; }
  if (lastMove) pts.push({ x: lastMove.x, y: lastMove.y, p: pts[pts.length - 1].p }); // the stabilizer lags: finish where the pointer let go
  const hand = penBlock(pts, true);
  blocks().push(hand);
  refreshAll();
  addRecent(state.pen.color);
  commit(hand.closed ? 'Drew a closed shape.' : 'Drew a line.');
  if (snapped) {
    // Two steps on purpose: Undo swaps the clean shape back to your hand-drawn line.
    blocks().splice(blocks().indexOf(hand), 1, snapped.block);
    refreshAll();
    popIn(blocks().length - 1);
    commit(`Snapped into a clean ${snapped.block.name.replace(' (drawn)', '').toLowerCase()}. Undo to keep your own line.`);
  }
}

// ---------- smart guides: parts snap into line with each other while you drag ----------
function smartTargets(b) {
  const bb = bboxOf(b);
  if (!bb) return null;
  const xs = [[0, 0, H()], [W() / 2, 0, H()], [W(), 0, H()]], ys = [[0, 0, W()], [H() / 2, 0, W()], [H(), 0, W()]];
  for (const o of blocks()) {
    if (o.id === b.id || !o.visible) continue;
    const ob = bboxOf(o);
    if (!ob || ob.width > W() * 0.95 || ob.width * ob.height > W() * H() * 0.7) continue; // skip backdrops
    for (const x of [ob.x, ob.x + ob.width / 2, ob.x + ob.width]) xs.push([x, ob.y, ob.y + ob.height]);
    for (const y of [ob.y, ob.y + ob.height / 2, ob.y + ob.height]) ys.push([y, ob.x, ob.x + ob.width]);
  }
  return { ox: bb.x - b.x, oy: bb.y - b.y, w: bb.width, h: bb.height, xs, ys };
}
function smartSnap(g, x, y) {
  const thr = 7 / state.view.z;
  const bestOf = (edges, targets) => {
    let best = null;
    for (const [e, off] of edges) for (const t of targets) { const d = t[0] - e; if (Math.abs(d) < thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t, off }; }
    return best;
  };
  const left = x + g.ox, top = y + g.oy;
  const bx = bestOf([[left, 0], [left + g.w / 2, g.w / 2], [left + g.w, g.w]], g.xs);
  const by = bestOf([[top, 0], [top + g.h / 2, g.h / 2], [top + g.h, g.h]], g.ys);
  if (bx) x += bx.d;
  if (by) y += by.d;
  const L = x + g.ox, T = y + g.oy;
  if (bx) state.smartLines.push([bx.t[0], Math.min(bx.t[1], T), bx.t[0], Math.max(bx.t[2], T + g.h)]);
  if (by) state.smartLines.push([Math.min(by.t[1], L), by.t[0], Math.max(by.t[2], L + g.w), by.t[0]]);
  return { x, y };
}

// ---------- zoom and pan (view only: exports always use the whole canvas) ----------
let panning = null;
function clampView() {
  const v = state.view, vw = W() / v.z, vh = H() / v.z;
  v.x = clamp(v.x, 0, W() - vw); v.y = clamp(v.y, 0, H() - vh);
}
function setZoom(z, cx = state.view.x + W() / state.view.z / 2, cy = state.view.y + H() / state.view.z / 2) {
  const v = state.view, old = v.z;
  v.z = clamp(z, 1, 8);
  const fx = (cx - v.x) / (W() / old), fy = (cy - v.y) / (H() / old);
  v.x = cx - fx * (W() / v.z); v.y = cy - fy * (H() / v.z);
  clampView();
  $('#zoom-level').textContent = `${Math.round(v.z * 100)}%`;
  canvas.classList.toggle('is-zoomed', v.z > 1);
  draw();
}
const zoomStep = (f) => setZoom(state.view.z * f);
function panBy(dx, dy) { state.view.x += dx; state.view.y += dy; clampView(); draw(); }
function panStart(e) {
  e.preventDefault();
  panning = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y, k: (W() / state.view.z) / canvas.getBoundingClientRect().width };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('is-panning');
}
function panMove(e) {
  state.view.x = panning.vx - (e.clientX - panning.x) * panning.k;
  state.view.y = panning.vy - (e.clientY - panning.y) * panning.k;
  clampView(); draw();
}

// ---------- color picker and recent colors ----------
function addRecent(c) {
  if (!/^#[0-9a-f]{6}$/i.test(c)) return;
  state.recent = [c, ...state.recent.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 6);
  const box = $('#recent-swatches');
  box.replaceChildren(...state.recent.map((col) => h('button', {
    type: 'button', class: 'qs', style: `--c:${col}`, 'aria-label': `Recent color ${col}`, title: `Recent: ${col}`,
    onclick: () => useColor(col),
  })));
  box.hidden = !state.recent.length;
}
function useColor(c) {
  state.pen.color = c; $('#pen-color').value = c;
  document.querySelectorAll('#quick-swatches .qs').forEach((q) => q.setAttribute('aria-pressed', q.title === c));
}
function pickAt(e) {
  const g = e.target.closest('[data-block]');
  const b = g && blocks().find((x) => x.id === g.dataset.block);
  let c;
  if (!b) c = state.scene.background.c1;
  else if (b.fillMode === 'none' || b.type === 'stroke' && !b.closed || SHAPES[b.type]?.category === 'Lines') c = b.stroke;
  else c = b.fill;
  if (!/^#[0-9a-f]{6}$/i.test(c)) return;
  useColor(c); addRecent(c);
  announce(`Picked ${c}${b ? ` from ${b.name}` : ' from the background'}.`);
  if (state.tool === 'picker') setTool(state.prevTool === 'picker' ? 'pen' : state.prevTool, true);
}

// ---------- brush-size cursor ----------
function moveBrushCursor(e) {
  const cur = $('#brush-cursor');
  if (state.tool !== 'pen' && state.tool !== 'eraser' && state.tool !== 'stamp') { cur.hidden = true; return; }
  const fr = $('#canvas-frame').getBoundingClientRect(), cr = canvas.getBoundingClientRect();
  const d = Math.max(4, (state.tool === 'stamp' ? state.pen.size * 4 : state.pen.size) * (cr.width / (W() / state.view.z)));
  cur.hidden = false;
  cur.style.width = cur.style.height = `${d}px`;
  cur.style.transform = `translate(${e.clientX - fr.left - d / 2}px, ${e.clientY - fr.top - d / 2}px)`;
  cur.classList.toggle('is-eraser', state.tool === 'eraser');
}

// ---------- stamp tool ----------
let stamping = null;
let stampSeed = Date.now() % 100000;
const stampRnd = () => { stampSeed = (stampSeed * 16807) % 2147483647; return stampSeed / 2147483647; };
function stampAt(p) {
  const size = state.pen.size * 4;
  const b = makeStamp(state.stamp.kind, p.x, p.y, stampRnd, { size, color: state.pen.color, jitter: state.stamp.jitter, rainbow: state.stamp.rainbow, outline: state.stamp.outline });
  b.group = stamping.group;
  if (state.pen.sym !== 'none') b.repeats = [...(b.repeats || []), ...repeatsForPen()];
  blocks().push(b);
  stamping.count++; stamping.last = p;
}
function stampStart(e) {
  const p = toSvgPoint(e);
  stamping = { group: uid(), count: 0, last: null };
  canvas.setPointerCapture(e.pointerId);
  stampAt(p); draw();
}
function stampMove(e) {
  const p = toSvgPoint(e), gap = state.pen.size * 4 * 1.15;
  if (Math.hypot(p.x - stamping.last.x, p.y - stamping.last.y) < gap) return;
  stampAt(p); draw();
}
function stampEnd() {
  const { count } = stamping;
  const name = (STAMPS.find((x) => x[0] === state.stamp.kind) || STAMPS[0])[1].toLowerCase();
  if (count === 1) blocks()[blocks().length - 1].group = '';
  stamping = null;
  addRecent(state.pen.color);
  refreshAll();
  commit(count === 1 ? `Stamped one of the ${name}.` : `Stamped ${count} ${name}, grouped together.`, count === 1 ? 'Stamped' : `Stamped ${count} ${name}`);
}

// ---------- fill: click for a solid color, drag to blend a gradient ----------
let filling = null;
function fillStart(e) {
  const g = e.target.closest('[data-block]');
  const b = g && blocks().find((x) => x.id === g.dataset.block);
  filling = { e, b, start: toSvgPoint(e), dragged: false, before: b ? { fillMode: b.fillMode, fill: b.fill, fill2: b.fill2, gradAngle: b.gradAngle } : { ...state.scene.background } };
  canvas.setPointerCapture(e.pointerId);
}
function fillMove(e) {
  const p = toSvgPoint(e), f = filling;
  const dx = p.x - f.start.x, dy = p.y - f.start.y;
  if (!f.dragged && Math.hypot(dx, dy) < 14) return;
  f.dragged = true;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (f.b) {
    if (f.b.locked) return;
    angle -= f.b.rot || 0;
    Object.assign(f.b, { fillMode: 'linear', fill: state.pen.color, fill2: f.before.fillMode === 'none' ? '#ffffff' : f.before.fill, gradAngle: Math.round(((angle % 360) + 360) % 360) });
  } else {
    Object.assign(state.scene.background, { mode: 'linear', c1: state.pen.color, c2: f.before.c1, angle: Math.round(((angle % 360) + 360) % 360) });
  }
  draw();
}
function fillEnd() {
  const f = filling;
  filling = null;
  if (!f.dragged) { bucketAt(f.e); return; }
  addRecent(state.pen.color);
  refreshAll();
  commit(f.b ? `Blended ${f.b.name} from ${state.pen.color}.` : 'Blended the background.', f.b ? `Gradient on ${f.b.name}` : 'Gradient background');
}

// ---------- eraser: rub over pen lines and shapes to remove them ----------
let erasing = null;
function eraseStart(e) { erasing = new Set(); canvas.setPointerCapture(e.pointerId); eraseAt(e); }
function eraseAt(e) {
  const size = state.pen.size;
  const r = Math.max(4, size) * (canvas.getBoundingClientRect().width / W()) / 2;
  let hit = false;
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const el = document.elementFromPoint(e.clientX + dx, e.clientY + dy)?.closest('#canvas [data-block]');
    const b = el && blocks().find((x) => x.id === el.dataset.block);
    if (!b || b.locked || erasing.has(b.id)) continue;
    if (state.eraser.scope === 'mine' && !b.penMade) continue;
    erasing.add(b.id);
    blocks().splice(blocks().indexOf(b), 1);
    blocks().forEach((o) => { if (o.clipTo === b.id) o.clipTo = ''; });
    hit = true;
  }
  if (hit) draw();
}
function eraseEnd() {
  const n = erasing.size;
  erasing = null;
  if (n) { refreshAll(); commit(`Erased ${n} ${n === 1 ? 'part' : 'parts'}. Undo brings ${n === 1 ? 'it' : 'them'} back.`); }
  else if (state.eraser.scope === 'mine') announce('The eraser only removes what you drew with the pen. Switch it to "Everything" to erase picture parts too.');
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
    $('#guide-title').textContent = `You drew ${g.r.drew}.`;
    $('#guide-text').textContent = 'Press Bloom to watch it grow, save it as a picture, or keep changing anything you like: every part is still a block you can click.';
    actions.innerHTML = '';
    actions.append(
      el('button', { class: 'btn btn-bloom', type: 'button', onclick: () => bloom(), text: 'Play bloom' }),
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
  if (!g.stepDone) actions.append(el('button', { class: 'btn btn-primary', id: 'guide-do', type: 'button', onclick: () => guideDo(), text: 'Do this step' }));
  actions.append(el('button', { class: g.stepDone ? 'btn btn-primary' : 'btn', id: 'guide-next', type: 'button', onclick: () => guideMove(1), text: g.step === n - 1 ? 'Finish →' : 'Next →' }));
  if (!g.stepDone && g.step < n - 1) actions.append(el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => guideDo(true), text: 'Finish it for me' }));
  if (g.stepDone) $('#guide-next').focus();
}

// ---------- paint bucket and coloring pages ----------
const QUICK = ['#ff4f87', '#ff9a3c', '#ffce3a', '#58c76b', '#3ee6c1', '#4f8bff', '#8b6bff', '#8a5a2b', '#ffffff', '#221f4f'];


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
  addRecent(state.pen.color);
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
  document.querySelectorAll('.tool-rail [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#pen-brush').addEventListener('change', (e) => { state.pen.brush = e.target.value; });
  $('#pen-steady').addEventListener('input', (e) => { state.pen.steady = Number(e.target.value); });
  $('#pen-snap').addEventListener('change', (e) => { state.pen.snap = e.target.checked; });
  $('#pen-fill').addEventListener('change', (e) => { state.pen.fillLoops = e.target.checked; });
  $('#eraser-scope').addEventListener('change', (e) => { state.eraser.scope = e.target.value; });
  $('#stamp-kind').replaceChildren(...STAMPS.map(([k, label]) => h('option', { value: k }, label)));
  $('#stamp-kind').addEventListener('change', (e) => { state.stamp.kind = e.target.value; });
  $('#stamp-jitter').addEventListener('input', (e) => { state.stamp.jitter = Number(e.target.value); });
  $('#stamp-rainbow').addEventListener('change', (e) => { state.stamp.rainbow = e.target.checked; });
  $('#stamp-outline').addEventListener('change', (e) => { state.stamp.outline = e.target.checked; });
  setTool('select', true);
  const hsel = $('#harmony');
  hsel.replaceChildren(...HARMONIES.map(([k, label]) => h('option', { value: k }, label)));
  $('#btn-harmony').addEventListener('click', () => {
    const next = harmonize(state.scene, state.pen.color, hsel.value);
    state.scene.background = next.background; state.scene.blocks = next.blocks;
    refreshAll();
    commit(`Recolored everything around ${state.pen.color}, keeping its lights and darks. Undo to go back.`);
  });
  $('#btn-tour')?.addEventListener('click', () => { $('#help-dialog')?.close?.(); startTour(); });
  $('#zoom-in').addEventListener('click', () => zoomStep(1.25));
  $('#zoom-out').addEventListener('click', () => zoomStep(0.8));
  $('#zoom-level').addEventListener('click', () => setZoom(1));
  canvas.addEventListener('pointerleave', () => { $('#brush-cursor').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !state.spaceDown && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) && state.view.z > 1) {
      e.preventDefault(); state.spaceDown = true; canvas.classList.add('can-pan');
    }
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { state.spaceDown = false; canvas.classList.remove('can-pan'); } });
  $('#pen-sym').addEventListener('change', (e) => { state.pen.sym = e.target.value; draw(); });
  $('#pen-color').addEventListener('input', (e) => { state.pen.color = e.target.value; });
  $('#pen-size').addEventListener('input', (e) => { state.pen.size = Number(e.target.value); });
  $('#guide-exit').addEventListener('click', exitGuide);
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
  $('#welcome-tour')?.addEventListener('click', () => { dlg.close(); startTour(); });
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
