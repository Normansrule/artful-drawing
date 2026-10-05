// artful drawing landing page.
// Every picture on this page is drawn live by the same engine as the studio.

import { SHAPES } from './shapes.js';
import { REPEATERS, expandRepeats } from './repeaters.js';
import { TEMPLATES, getTemplate } from './templates.js';
import { makeBlock as B, blankScene } from './model.js';
import { renderSceneInner, renderSceneSVG, sceneStats } from './render.js';
import { playBloom, ease } from './bloom.js';
import { startFluid } from './fluid.js';
import { spotlight, tilt, magnetic, tickers, reveal, whileVisible, reducedMotion, blurIn } from './fx.js';
import { esc } from './util.js';
import { symmetryPainter, ringGallery, clickSparks, floatStickers } from './toys.js';

const $ = (s, r = document) => r.querySelector(s);
const fmt = new Intl.NumberFormat('en-US');
const R = (mode, o = {}) => ({ mode, ...o });
const S = (blocks, background) => ({ ...blankScene(), background: background || { mode: 'solid', c1: '#ffffff', c2: '#ffffff', angle: 90 }, blocks });
const night = { mode: 'radial', c1: '#2d2766', c2: '#100d2b', angle: 90 };
const gsap = window.gsap;
const motion = !reducedMotion();

// ---------- GitHub link: work it out from the Pages address ----------
{
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (m) $('#gh-link').href = `https://github.com/${m[1]}/${repo && !repo.endsWith('.html') ? repo : `${m[1]}.github.io`}`;
}

// ---------- counts in the stats row come from the real registries ----------
$('#stat-blocks').dataset.to = Object.keys(SHAPES).length;
$('#stat-repeats').dataset.to = Object.keys(REPEATERS).length;
$('#stat-pictures').dataset.to = TEMPLATES.length;

// ---------- hero: ink simulation ----------
let fluid = null;
if (motion) {
  try { fluid = startFluid($('#fluid')); } catch (e) { console.warn('Fluid simulation unavailable:', e); }
}
if (!fluid) $('#fluid').remove();

// ---------- hero: live pictures that bloom, one after another ----------
const HERO_IDS = ['butterfly', 'ghost', 'snowflake', 'christmas-tree', 'mandala', 'flower', 'cat', 'easter-eggs'];
const heroSvg = $('#hero-svg');
let heroIdx = 0, heroTimer = 0, heroStop = null;
function showHero() {
  const t = getTemplate(HERO_IDS[heroIdx % HERO_IDS.length]);
  const scene = t.build();
  const st = sceneStats(scene);
  $('#hero-art-title').textContent = t.name;
  $('#hero-link').href = `studio.html#template=${t.id}`;
  $('#hero-link').setAttribute('aria-label', `Open the ${t.name} picture in the studio`);
  const modes = [...new Set(scene.blocks.flatMap((b) => b.repeats.map((r) => REPEATERS[r.mode].label)))];
  $('#hero-tags').innerHTML = modes.map((m) => `<span>${esc(m)}</span>`).join('');
  const blocksEl = $('#hero-blocks'), shapesEl = $('#hero-shapes');
  if (!motion) {
    heroSvg.innerHTML = renderSceneInner(scene, { prefix: 'h-' });
    blocksEl.textContent = st.blocks; shapesEl.textContent = fmt.format(st.shapes);
    return;
  }
  heroStop?.();
  heroStop = playBloom(heroSvg, scene, {
    prefix: 'h-', pace: 1.15,
    onFrame: (time, dur) => {
      const p = Math.min(1, time / dur);
      blocksEl.textContent = Math.round(st.blocks * Math.min(1, p * 1.15));
      shapesEl.textContent = fmt.format(Math.round(st.shapes * ease.outCubic(p)));
    },
    onDone: () => {
      heroStop = null;
      blocksEl.textContent = st.blocks; shapesEl.textContent = fmt.format(st.shapes);
      heroTimer = setTimeout(() => { heroIdx++; showHero(); }, 2600);
    },
  });
  fluid?.splat(0.75, 0.55, (Math.random() - 0.5) * 800, 700);
}
showHero();
// Hovering pauses the rotation so people can look.
$('.hero-art').addEventListener('pointerenter', () => clearTimeout(heroTimer));
$('.hero-art').addEventListener('pointerleave', () => { if (!heroStop) { clearTimeout(heroTimer); heroTimer = setTimeout(() => { heroIdx++; showHero(); }, 1500); } });

// ---------- marquee of starter pictures ----------
function fillMarquee(el, list, key) {
  const cards = list.map((t) => `<a class="pic-card" href="studio.html#template=${t.id}">${renderSceneSVG(t.build(), { prefix: `m${key}-${t.id}-`, title: t.name }).replace('role="img"', 'aria-hidden="true"')}<span>${esc(t.name)}</span></a>`).join('');
  // The list appears twice so the loop is seamless; the copy is hidden from assistive tech and the tab order.
  el.innerHTML = cards + `<div style="display:contents" aria-hidden="true">${cards.replaceAll('<a class="pic-card"', '<a tabindex="-1" class="pic-card"')}</div>`;
}
fillMarquee($('#marquee-a'), TEMPLATES.slice(0, 7), 'a');
fillMarquee($('#marquee-b'), [...TEMPLATES.slice(7), ...TEMPLATES.slice(0, 2)], 'b');

// ---------- scroll story: build the butterfly ----------
const story = getTemplate('butterfly').build();
const storySvg = $('#story-svg');
const steps = [...document.querySelectorAll('#story-steps li')];
const idx = Object.fromEntries(story.blocks.map((b, i) => [b.name, i]));
const counts = story.blocks.map((b) => expandRepeats(b, story).length);
// When each block (or each copy) grows, in "step units" from 0 to 5.
const windows = new Map([
  [idx['Upper spots'], [2, 2.8]], [idx['Lower spots'], [2.4, 2.95]],
  [idx.Body, [3, 3.35]], [idx.Antennae, [3.2, 3.55]], [idx['Antenna tips'], [3.35, 3.65]], [idx.Head, [3.45, 3.75]], [idx.Face, [3.65, 3.95]],
  [idx.Sparkles, [4, 4.9]],
]);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function storyReveal(p) {
  return (bi, ci, n) => {
    if (bi === idx.Wings) return ease.outBack(clamp01((p - (ci === 0 ? 0.05 : 1.05)) / 0.7));
    const w = windows.get(bi);
    if (!w) return 1;
    const span = w[1] - w[0], grow = Math.min(0.35, span);
    const start = w[0] + (n > 1 ? (ci / (n - 1)) * (span - grow) : 0);
    return ease.outBack(clamp01((p - start) / grow));
  };
}
let lastP = -1;
function renderStory(p) {
  if (Math.abs(p - lastP) < 0.002) return;
  lastP = p;
  const reveal = storyReveal(p);
  storySvg.innerHTML = renderSceneInner(story, { prefix: 'st-', reveal });
  const step = Math.min(4, Math.floor(p));
  steps.forEach((li, i) => { li.classList.toggle('is-active', i === step); li.classList.toggle('is-done', i < step || p >= 5); });
  $('#story-caption').textContent = `Step ${step + 1} of 5`;
  $('#story-rail').style.transform = `scaleX(${p / 5})`;
  let shapes = 0;
  story.blocks.forEach((b, bi) => { for (let c = 0; c < counts[bi]; c++) if (reveal(bi, c, counts[bi]) > 0.01) shapes++; });
  $('#story-shapes').textContent = fmt.format(shapes);
}
const storySection = $('#story');
const stacked = () => matchMedia('(max-width: 980px)').matches;
if (gsap && window.ScrollTrigger && motion) {
  gsap.registerPlugin(ScrollTrigger);
  const proxy = { p: 0 };
  gsap.to(proxy, {
    p: 5, ease: 'none',
    scrollTrigger: { trigger: storySection, start: 'top top', end: 'bottom bottom', scrub: 0.6 },
    onUpdate: () => renderStory(stacked() ? 5 : proxy.p),
  });
  renderStory(stacked() ? 5 : 0);
} else {
  // No GSAP (or reduced motion): plain scroll position, no smoothing.
  const onScroll = () => {
    if (stacked()) return renderStory(5);
    const r = storySection.getBoundingClientRect();
    renderStory(clamp01(-r.top / (r.height - innerHeight)) * 5);
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
}

// ---------- bento: each card is a tiny looping animation ----------
const BENTO = [
  {
    tag: 'Repeat', title: 'Mirror', text: 'Draw half. Get the whole. Butterflies, faces, beetles.', cls: 'wide',
    scene: (t) => S([
      B('wing', { x: 548, y: 400, w: 290, h: 330, rot: -6 + Math.sin(t * 3) * 10, fillMode: 'linear', fill: '#ff7eb6', fill2: '#7b61ff', gradAngle: 50, stroke: '#221f4f', strokeWidth: 7, repeats: [R('mirror')] }),
      B('circle', { y: 420, w: 42, h: 240, fill: '#221f4f' }),
    ], { mode: 'linear', c1: '#dff3ff', c2: '#fde2f3', angle: 180 }),
  },
  {
    tag: 'Repeat', title: 'Spin around', text: 'Copies around a center. Flowers, mandalas, wheels.',
    scene: (t) => S([
      B('petal', { y: 255, w: 100, h: 270, fill: '#ff5c8a', repeats: [R('radial', { count: 1 + (Math.floor(t * 2.2) % 14), hueStep: 26 })] }),
      B('circle', { w: 110, h: 110, fill: '#ffffff' }),
    ], night),
  },
  {
    tag: 'Repeat', title: 'Golden spiral', text: 'Turn 137.5° each time, like sunflower seeds.', cls: 'tall',
    scene: (t) => S([B('circle', { w: 18, h: 18, fill: '#ff5c8a', repeats: [R('spiral', { count: 20 + Math.floor((t * 90) % 480), angle: 137.5, spacing: 16.5, scaleStep: 1.002, hueStep: 0.9 })] })], { mode: 'solid', c1: '#130f2e', c2: '#130f2e', angle: 90 }),
  },
  {
    tag: 'Repeat', title: 'Step and repeat', text: 'Each copy moves, turns and shrinks a little more.',
    scene: (t) => S([B('rect', { w: 560, h: 560, fillMode: 'none', stroke: '#ffce3a', strokeWidth: 7, radius: 0.12, repeats: [R('step', { count: 24, dx: 0, dy: 0, rot: 6 + Math.sin(t * 1.3) * 6, scale: 0.9, hueStep: 9 })] })], night),
  },
  {
    tag: 'Repeat', title: 'Grid', text: 'Rows and columns. Wallpaper, tiles, textiles.',
    scene: (t) => {
      const brick = Math.floor(t / 1.6) % 2 === 1; // brick rows shift half a step, so start a quarter step left to stay centered
      return S([B('heart', { x: brick ? 120 : 160, y: 160, w: 100, h: 92, fill: '#ff4f87', repeats: [R('grid', { cols: 4, rows: 4, gapX: 160, gapY: 160, stagger: brick, hueStep: Math.round(8 + Math.sin(t) * 8) })] })], { mode: 'solid', c1: '#fff0f5', c2: '#fff0f5', angle: 90 });
    },
  },
  {
    tag: 'Repeat', title: 'Scatter', text: 'Controlled randomness. Same seed, same sprinkle.',
    scene: (t) => S([B('star', { w: 38, h: 38, fill: '#fff6c9', points: 4, inner: 0.35, repeats: [R('scatter', { count: 70, spreadX: 380, spreadY: 380, seed: 1 + Math.floor(t * 1.2), sizeVar: 0.7, rotVar: 25, hueVar: 40 })] })], night),
  },
  {
    tag: 'Algorithm', title: 'Fractal tree', text: 'One rule: every branch splits into smaller branches. Here the wind is a slider.', cls: 'wide',
    scene: (t) => S([B('tree', { y: 430, w: 520, h: 640, depth: 8, randomness: 0.2, leaf: 9, bend: Math.sin(t * 1.4) * 9, seed: 4 })], { mode: 'linear', c1: '#e9f6ff', c2: '#fffbea', angle: 180 }),
  },
  {
    tag: 'Algorithm', title: 'Snowflake arm', text: 'Side branches on side branches, spun six times. Real snow crystals grow the same way.', cls: 'wide',
    scene: (t) => S([B('crystal', { w: 250, h: 620, strokeWidth: 12, depth: 3, angle: 60 + Math.sin(t * 0.9) * 18, ratio: 0.5 + Math.sin(t * 0.6) * 0.12, repeats: [R('radial', { count: 6 })] })], night),
  },
];
const bento = $('#bento');
bento.innerHTML = BENTO.map((c, i) => `<article class="bento-card ${c.cls || ''}">
  <div class="copy"><span class="tag">${esc(c.tag)}</span><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>
  <div class="view"><svg viewBox="0 0 800 800" role="img" aria-label="${esc(c.title)} example, animated" data-bento="${i}"></svg></div>
</article>`).join('');
const live = new Set();
bento.querySelectorAll('svg[data-bento]').forEach((svg) => {
  const c = BENTO[svg.dataset.bento];
  svg.innerHTML = renderSceneInner(c.scene(1.2), { prefix: `bn${svg.dataset.bento}-` });
  if (motion) whileVisible(svg, (el, on) => (on ? live.add(el) : live.delete(el)));
});
if (motion) {
  let last = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (now - last < 1000 / 24 || document.hidden) return; // 24 frames per second is plenty
    last = now;
    const t = now / 1000;
    for (const svg of live) svg.innerHTML = renderSceneInner(BENTO[svg.dataset.bento].scene(t), { prefix: `bn${svg.dataset.bento}-` });
  };
  requestAnimationFrame(loop);
}

// ---------- keyboard demo ----------
const heart = { x: 520, y: 400, w: 200, h: 180, rot: 0, mirror: false };
const keysSvg = $('#keys-svg');
function drawKeys() {
  const scene = S([
    B('rect', { x: 400, y: 400, w: 4, h: 800, fill: '#ff4f87', opacity: 0.35 }),
    B('heart', { x: heart.x, y: heart.y, w: heart.w, h: heart.h, rot: heart.rot, fillMode: 'linear', fill: '#ff4f87', fill2: '#ffce3a', gradAngle: 160, stroke: '#221f4f', strokeWidth: 6, repeats: heart.mirror ? [R('mirror')] : [] }),
  ], { mode: 'linear', c1: '#f6f7fd', c2: '#e7ecff', angle: 180 });
  keysSvg.innerHTML = renderSceneInner(scene, { prefix: 'k-' });
  $('#keys-readout').textContent = `x ${heart.x}, y ${heart.y}, ${heart.rot}°${heart.mirror ? ', mirrored' : ''}`;
}
const ACTIONS = {
  ArrowLeft: ['moved left 30 pixels', () => { heart.x = Math.max(120, heart.x - 30); }],
  ArrowRight: ['moved right 30 pixels', () => { heart.x = Math.min(680, heart.x + 30); }],
  ArrowUp: ['moved up 30 pixels', () => { heart.y = Math.max(120, heart.y - 30); }],
  ArrowDown: ['moved down 30 pixels', () => { heart.y = Math.min(680, heart.y + 30); }],
  r: ['rotated 15°', () => { heart.rot = ((heart.rot + 15 + 180) % 360) - 180; }],
  m: ['toggled the mirror', () => { heart.mirror = !heart.mirror; }],
  '+': ['grew 10%', () => { heart.w = Math.min(380, Math.round(heart.w * 1.1)); heart.h = Math.min(342, Math.round(heart.h * 1.1)); }],
  '-': ['shrank 10%', () => { heart.w = Math.max(60, Math.round(heart.w / 1.1)); heart.h = Math.max(54, Math.round(heart.h / 1.1)); }],
};
function press(key, byUser) {
  const cap = document.querySelector(`.keycap[data-key="${CSS.escape(key)}"]`);
  const [label, fn] = ACTIONS[key];
  fn(); drawKeys();
  cap?.classList.add('is-pressed');
  setTimeout(() => cap?.classList.remove('is-pressed'), 160);
  $('#key-log').innerHTML = `<b>${esc(cap?.textContent.trim() || key)}</b> ${byUser ? 'You' : 'Demo'}: ${label}.`;
}
let demoTimer = 0, demoOn = motion, demoStep = 0;
const SCRIPT = ['m', 'ArrowRight', 'ArrowRight', 'r', 'r', 'ArrowUp', '+', '+', 'r', 'ArrowDown', '-', '-', 'ArrowLeft', 'ArrowLeft', 'r', 'r', 'r', 'm'];
function demo() {
  if (!demoOn) return;
  press(SCRIPT[demoStep++ % SCRIPT.length], false);
  demoTimer = setTimeout(demo, 850);
}
document.querySelectorAll('.keycap').forEach((cap) => cap.addEventListener('click', () => {
  demoOn = false; clearTimeout(demoTimer);
  press(cap.dataset.key, true);
}));
drawKeys();
if (motion) whileVisible(keysSvg, (el, on) => { clearTimeout(demoTimer); if (on && demoOn) demoTimer = setTimeout(demo, 600); });

// ---------- floating block stickers in the hero ----------
{
  const sticker = (type, o) => {
    const b = B(type, { x: 50, y: 50, w: 80, h: 80, ...o });
    return renderSceneSVG({ ...blankScene(), width: 100, height: 100, background: { mode: 'solid', c1: 'none', c2: 'none', angle: 90 }, blocks: [b] }, { prefix: `sk-${type}-${Math.round(o.x || 0)}-` }).replace('role="img"', 'aria-hidden="true"');
  };
  floatStickers($('#stickers'), [
    { x: 2, y: 91, size: 70, depth: 1.2, spin: 10, svg: sticker('heart', { fillMode: 'linear', fill: '#ff4f87', fill2: '#ff9a3c', gradAngle: 160 }) },
    { x: 43, y: 11, size: 54, depth: 0.6, spin: -14, svg: sticker('star', { fill: '#ffce3a', inner: 0.45 }) },
    { x: 49, y: 50, size: 46, depth: 1.6, spin: 18, svg: sticker('petal', { fillMode: 'linear', fill: '#8b6bff', fill2: '#ff7eb6', w: 44, h: 86 }) },
    { x: 55, y: 84, size: 62, depth: 0.9, spin: -8, svg: sticker('moon', { fill: '#fff1a8', thickness: 0.45, rot: -20 }) },
    { x: 92, y: 9, size: 58, depth: 1.1, spin: 12, svg: sticker('polygon', { fillMode: 'linear', fill: '#3ee6c1', fill2: '#1a8fd6', sides: 6 }) },
    { x: 95, y: 66, size: 52, depth: 1.4, spin: -16, svg: sticker('drop', { fillMode: 'radial', fill: '#8fe9ff', fill2: '#1a8fd6', w: 58, h: 82 }) },
    { x: 26, y: 92, size: 44, depth: 0.7, spin: 20, svg: sticker('ring', { fill: '#ff4f87', thickness: 0.3 }) },
  ]);
}

// ---------- symmetry painter ----------
{
  const painter = symmetryPainter($('#paint'));
  const seg = $('#paint-n');
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    painter.set('n', Number(b.dataset.n));
    seg.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', o === b));
  }));
  const toggle = (id, key) => $(id).addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', on); painter.set(key, on);
  });
  toggle('#paint-mirror', 'mirror');
  toggle('#paint-fade', 'fade');
  $('#paint-clear').addEventListener('click', () => painter.clear());
  $('#paint-save').addEventListener('click', async () => {
    const blob = await painter.toPNG();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'artful-drawing-symmetry.png';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

// ---------- 3D ring gallery ----------
{
  const ring = $('#ring');
  ring.innerHTML = TEMPLATES.map((t) => `<a class="ring-card" href="studio.html#template=${t.id}" draggable="false">${renderSceneSVG(t.build(), { prefix: `r-${t.id}-`, title: t.name }).replace('role="img"', 'aria-hidden="true"')}<span>${esc(t.name)}</span><small>${esc(t.blurb)}</small></a>`).join('');
  ringGallery($('#ring-stage'));
}

// Click sparks are part of the playful look; the professional home page leaves them out.

// ---------- motion primitives ----------
spotlight(document.querySelectorAll('.bento-card, .pic-card, .duo a, .way'));
tickers(document.querySelectorAll('.ticker'));
reveal(document.querySelectorAll('.home-section h2, .home-section .sub, .stat, .duo a, .kicker'));

// GSAP intro for the hero; the plain fx.js version if GSAP didn't load.
if (motion && gsap && window.SplitText) {
  gsap.registerPlugin(SplitText);
  // Keep the intro on the wall clock even when a slow device drops frames,
  // so the headline never sits half-blurred.
  gsap.ticker.lagSmoothing(0);
  const h1 = $('#hero-title');
  const split = SplitText.create(h1, { type: 'words', aria: 'auto' });
  split.words.forEach((w) => { if (w.closest('.accent')) w.classList.add('fx-gradient-text'); });
  $('.accent', h1)?.classList.remove('fx-gradient-text');
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.eyebrow', { y: 16, opacity: 0, duration: 0.6 })
    .from(split.words, { yPercent: 60, opacity: 0, filter: 'blur(12px)', duration: 0.9, stagger: 0.07 }, '-=0.3')
    .from('.hero .lede, .hero-ctas, .hero-note', { y: 20, opacity: 0, duration: 0.7, stagger: 0.1 }, '-=0.5')
    .from('.hero-art', { y: 40, opacity: 0, scale: 0.96, duration: 1 }, '-=0.9');
  gsap.utils.toArray('.bento-card').forEach((card, i) => {
    gsap.from(card, { y: 50, opacity: 0, duration: 0.8, delay: (i % 4) * 0.08, ease: 'power3.out', scrollTrigger: { trigger: card, start: 'top 90%', once: true } });
  });
} else if (motion) {
  blurIn($('#hero-title'));
  reveal(document.querySelectorAll('.bento-card'));
}
