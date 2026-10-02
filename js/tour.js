// A one-minute tour: a spotlight walks through the studio, one area at a time.

const STEPS = [
  ['.tool-rail', 'Tools', 'Select (V), Pen (P), Eraser (E), Color picker (I) and Fill (K). Each tool shows its own options in the bar above the canvas.'],
  ['#options-bar', 'Tool options', 'Brush, color, size, symmetry and the helpers that tidy your drawing live here. Hold still at the end of a pen stroke to snap it into a clean shape.'],
  ['.tabs', 'The shelf', 'Shapes to drop in, step-by-step Draw along guides and coloring pages, finished Pictures to remix, and the Helper.'],
  ['#tab-helper', 'The Helper', 'Like an art teacher: it suggests small improvements with one-click fixes. Hover a fix to preview it.'],
  ['#inspector', 'Settings', 'Click any part of your drawing to change its color, size, effect and repeats here. Layers and History are below.'],
  ['#btn-bloom', 'Bloom', 'Watch your picture build itself, then save it as a picture, a sticker or a video from the Save menu.'],
];

export function startTour(start = 0) {
  document.querySelector('.tour')?.remove();
  const layer = document.createElement('div');
  layer.className = 'tour';
  layer.innerHTML = `<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <span class="tour-count"></span><h2 id="tour-title"></h2><p></p>
    <div class="tour-actions"><button type="button" class="btn btn-small" data-go="-1">← Back</button><button type="button" class="btn btn-primary btn-small" data-go="1">Next →</button><button type="button" class="btn btn-small btn-quiet" data-go="end">Skip</button></div></div>`;
  document.body.append(layer);
  const spot = layer.querySelector('.tour-spot'), card = layer.querySelector('.tour-card');
  let i = start;
  const show = () => {
    const [sel, title, text] = STEPS[i];
    const el = document.querySelector(sel);
    const r = el?.getBoundingClientRect() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const pad = 8;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    card.querySelector('.tour-count').textContent = `${i + 1} of ${STEPS.length}`;
    card.querySelector('h2').textContent = title;
    card.querySelector('p').textContent = text;
    card.querySelector('[data-go="-1"]').disabled = i === 0;
    card.querySelector('[data-go="1"]').textContent = i === STEPS.length - 1 ? 'Start drawing' : 'Next →';
    // Place the card beside the highlighted area, inside the window.
    const cw = Math.min(340, innerWidth - 24), ch = card.offsetHeight || 180;
    let x = r.left + r.width + 18, y = r.top;
    if (x + cw > innerWidth - 12) x = r.left - cw - 18;
    if (x < 12) { x = Math.max(12, Math.min(innerWidth - cw - 12, r.left)); y = r.top + r.height + 18; }
    if (y + ch > innerHeight - 12) y = Math.max(12, r.top - ch - 18);
    Object.assign(card.style, { left: `${x}px`, top: `${Math.max(12, y)}px`, width: `${cw}px` });
    card.querySelector('[data-go="1"]').focus();
  };
  const end = () => { layer.remove(); removeEventListener('resize', show); document.removeEventListener('keydown', keys, true); };
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
    if (e.key === 'ArrowRight') { e.stopPropagation(); go(1); }
    if (e.key === 'ArrowLeft') { e.stopPropagation(); go(-1); }
  };
  const go = (d) => { i += d; if (i >= STEPS.length) return end(); i = Math.max(0, i); show(); };
  layer.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]')?.dataset.go;
    if (g === 'end') end(); else if (g) go(Number(g));
  });
  addEventListener('resize', show);
  document.addEventListener('keydown', keys, true);
  show();
}
