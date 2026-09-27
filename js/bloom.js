// Bloom: watch a picture assemble itself, block by block and copy by copy.
//
// Borrowed idea (from Remotion): an animation is a pure function of time.
// bloomReveal(scene, t) answers "how grown is each copy at time t?", so the
// same timeline drives the studio preview, the Learn page, the landing page
// story and the video export, frame for frame.

import { renderSceneInner, renderSceneSVG } from './render.js';
import { expandRepeats } from './repeaters.js';

export const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  // A gentle overshoot, like a sticker being pressed down.
  outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Timing for a scene: when each block starts and how its copies stagger. */
export function bloomPlan(scene, { pace = 1 } = {}) {
  const visible = scene.blocks.map((b, i) => [b, i]).filter(([b]) => b.visible !== false);
  const gap = Math.min(0.45, 5.5 / Math.max(1, visible.length)) / pace;
  const grow = 0.5 / pace;
  const starts = new Map(), spreads = new Map();
  visible.forEach(([b, i], k) => {
    starts.set(i, k * gap);
    const n = expandRepeats(b, scene).length;
    spreads.set(i, n > 1 ? Math.min(1.4, 0.25 + n * 0.02) / pace : 0);
  });
  const last = visible.length ? visible[visible.length - 1][1] : 0;
  const duration = (starts.get(last) || 0) + (spreads.get(last) || 0) + grow + 0.15;
  return { starts, spreads, grow, duration };
}

/** reveal(blockIndex, copyIndex, copyCount) for time t (seconds). */
export function bloomReveal(plan, t) {
  return (bi, ci, n) => {
    const start = plan.starts.get(bi);
    if (start == null) return 1;
    const offset = n > 1 ? (ci / (n - 1)) * plan.spreads.get(bi) : 0;
    const p = clamp01((t - start - offset) / plan.grow);
    return p >= 1 ? 1 : ease.outBack(p);
  };
}

/**
 * Animate a scene into an <svg> element. Returns a stop() function.
 * opts: prefix, pace, onFrame(t, duration), onDone()
 */
export function playBloom(svg, scene, { prefix = 'b-', pace = 1, onFrame, onDone } = {}) {
  const plan = bloomPlan(scene, { pace });
  let raf = 0, t0 = 0, stopped = false;
  const frame = (now) => {
    if (stopped) return;
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    svg.innerHTML = renderSceneInner(scene, { prefix, reveal: bloomReveal(plan, t) });
    onFrame?.(t, plan.duration);
    if (t < plan.duration) raf = requestAnimationFrame(frame);
    else { svg.innerHTML = renderSceneInner(scene, { prefix }); onDone?.(); }
  };
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || null;
}
export const canRecordVideo = () => !!pickMime() && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

function loadSVG(markup) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Record the bloom as a video file (WebM where supported).
 * Frames are rendered one at a time from the same pure timeline, then paced to real time.
 */
export async function recordBloom(scene, { size = 1080, fps = 30, hold = 1.2, pace = 1, onProgress } = {}) {
  const mime = pickMime();
  if (!mime) throw new Error('This browser cannot record video.');
  const plan = bloomPlan(scene, { pace });
  const total = plan.duration + hold;
  const frames = Math.ceil(total * fps);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = Math.round((size * scene.height) / scene.width);
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });

  // Draw the first frame before recording starts so the video never opens on black.
  const draw = async (t) => {
    const img = await loadSVG(renderSceneSVG(scene, { prefix: 'v-', reveal: bloomReveal(plan, t), width: canvas.width, height: canvas.height }));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  await draw(0);
  rec.start();
  const start = performance.now();
  for (let f = 0; f < frames; f++) {
    await draw(f / fps);
    onProgress?.(f / frames);
    const due = start + ((f + 1) * 1000) / fps;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  rec.stop();
  await done;
  return new Blob(chunks, { type: mime.split(';')[0] });
}
