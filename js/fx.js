// Small motion primitives, written without a framework.
//
// The ideas come from open-source React kits (React Bits, Magic UI, Animate UI,
// Motion Primitives): spotlight cards, magnetic buttons, tilt, number tickers,
// blur-in text, scroll reveals, a reading progress bar and a table-of-contents
// scroll spy. Each one is a plain function you call on elements, and each one
// steps aside when the visitor asks their system for reduced motion.

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

/** Spotlight: a soft glow that follows the pointer inside a card (CSS reads --mx/--my). */
export function spotlight(els) {
  for (const el of els) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}

/** Tilt: cards lean toward the pointer a few degrees. */
export function tilt(els, max = 6) {
  if (reducedMotion() || !fine()) return;
  for (const el of els) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateY(-2px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
}

/** Magnetic: buttons drift a little toward the pointer. */
export function magnetic(els, strength = 0.25) {
  if (reducedMotion() || !fine()) return;
  for (const el of els) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
}

/** Number ticker: counts up to data-to when it scrolls into view. */
export function tickers(els) {
  const run = (el) => {
    const to = Number(el.dataset.to), fmt = new Intl.NumberFormat('en-US');
    if (reducedMotion()) { el.textContent = fmt.format(to); return; }
    const t0 = performance.now(), dur = 1400;
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - (1 - p) ** 4;
      el.textContent = fmt.format(Math.round(to * e));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  onVisible(els, run);
}

/** Blur-in text: split an element's words and let them drift into focus. */
export function blurIn(el, { delay = 0, stagger = 0.06 } = {}) {
  if (!el || reducedMotion()) return;
  const label = el.textContent;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.append(w); return; }
          const s = document.createElement('span');
          s.className = 'fx-word'; s.textContent = w; s.setAttribute('aria-hidden', 'true');
          frag.append(s);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);
  el.setAttribute('aria-label', label);
  // Gradient text can't paint through transformed children, so hand the gradient to each word.
  el.querySelectorAll('.fx-gradient-text').forEach((g) => {
    g.querySelectorAll('.fx-word').forEach((w) => w.classList.add('fx-gradient-text'));
    g.classList.remove('fx-gradient-text');
  });
  el.querySelectorAll('.fx-word').forEach((w, i) => { w.style.animationDelay = `${delay + i * stagger}s`; });
  el.classList.add('fx-blur-in');
}

/** Scroll reveal: elements fade and rise into place the first time they appear. */
export function reveal(els) {
  if (reducedMotion()) return;
  els = [...els];
  els.forEach((el) => el.classList.add('fx-reveal'));
  onVisible(els, (el) => el.classList.add('is-in'), { rootMargin: '0px 0px -8% 0px' });
}

/** Reading progress: a thin bar across the top of long pages. */
export function readingProgress() {
  const bar = document.createElement('div');
  bar.className = 'fx-progress'; bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  const update = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

/** Scroll spy: highlight the table-of-contents entry for the section on screen. */
export function scrollSpy(toc) {
  if (!toc || !('IntersectionObserver' in window)) return;
  const links = new Map([...toc.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  const heads = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.removeAttribute('aria-current'));
      links.get(e.target.id)?.setAttribute('aria-current', 'location');
    }
  }, { rootMargin: '0px 0px -70% 0px' });
  heads.forEach((h) => io.observe(h));
}

/** Run fn(el) once, the first time each element scrolls into view. */
export function onVisible(els, fn, opts = {}) {
  els = [...els];
  if (!('IntersectionObserver' in window)) { els.forEach(fn); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); }
  }, opts);
  els.forEach((el) => io.observe(el));
}

/** Call fn(el, visible) whenever an element enters or leaves the screen (for looping animations). */
export function whileVisible(el, fn) {
  if (!('IntersectionObserver' in window)) { fn(el, true); return; }
  new IntersectionObserver(([e]) => fn(el, e.isIntersecting)).observe(el);
}

/** The shared set used by the reading pages. */
export function enhanceReadingPage() {
  readingProgress();
  scrollSpy(document.querySelector('.toc'));
  reveal(document.querySelectorAll('.prose > h2, .demo, .callout, .ref-list > li, .playground'));
  spotlight(document.querySelectorAll('.ref-list > li, .playground'));
  blurIn(document.querySelector('.read-hero h1'));
}
