// Visual toys for the landing page. Plain Canvas 2D and CSS 3D, no libraries.
//
//   symmetryPainter  paint glowing strokes copied N ways around a center (mouse, touch or arrow keys)
//   ringGallery      starter pictures on a slowly turning 3D carousel you can drag
//   clickSparks      a burst of colored sparks wherever you click (React Bits "ClickSpark")
//   floatStickers    block stickers drifting in the hero with pointer parallax

import { reducedMotion } from './fx.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- symmetry painter
export function symmetryPainter(canvas, { onChange } = {}) {
  const ctx = canvas.getContext('2d');
  const st = { n: 8, mirror: true, fade: true, hue: 330, last: null, pen: null, auto: true, idleSince: 0, t: 0, visible: true };
  let w = 0, h = 0, dpr = 1;

  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const snapshot = w ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07051a'; ctx.fillRect(0, 0, w, h);
    if (snapshot) ctx.putImageData(snapshot, 0, 0);
  };

  // Draw one segment in every symmetric position, in two passes: a wide soft glow and a bright core.
  const segment = (a, b, speed) => {
    const cx = w / 2, cy = h / 2;
    const width = Math.max(1.2, Math.min(9, 10 - speed * 0.12));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.lineWidth = pass ? width * 0.45 : width * 2.8;
      ctx.strokeStyle = pass ? `hsla(${st.hue}, 100%, 80%, 0.95)` : `hsla(${st.hue}, 100%, 58%, 0.3)`;
      ctx.beginPath();
      for (let k = 0; k < st.n; k++) {
        const ang = (k * TAU) / st.n, c = Math.cos(ang), s = Math.sin(ang);
        for (const flip of st.mirror ? [1, -1] : [1]) {
          const p = (x, y) => { const X = (x - cx), Y = (y - cy) * flip; return [cx + X * c - Y * s, cy + X * s + Y * c]; };
          const [x1, y1] = p(a[0], a[1]), [x2, y2] = p(b[0], b[1]);
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
    st.hue = (st.hue + 1.3) % 360;
  };

  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    st.last = local(e); st.auto = false; st.idleSince = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!st.last) return;
    const p = local(e);
    const speed = Math.hypot(p[0] - st.last[0], p[1] - st.last[1]);
    if (speed > 0.5) { segment(st.last, p, speed); st.last = p; }
    st.idleSince = performance.now();
  });
  const up = () => { st.last = null; st.idleSince = performance.now(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // Keyboard painting: arrow keys move a pen (Shift for bigger steps), Space lifts it.
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 28 : 10;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (e.key === ' ') { st.pen = null; e.preventDefault(); return; }
    if (!d) return;
    e.preventDefault();
    st.auto = false; st.idleSince = performance.now();
    const from = st.pen || [w / 2 + 60, h / 2];
    const to = [Math.max(0, Math.min(w, from[0] + d[0])), Math.max(0, Math.min(h, from[1] + d[1]))];
    segment(from, to, step); st.pen = to;
  });

  // Autopilot: a rose curve drawn by an invisible hand until someone takes over.
  const autopilot = (dt) => {
    const R = Math.min(w, h) * 0.42;
    const k = 5 / 3, prev = st.t;
    st.t += dt * 0.55;
    const pt = (t) => {
      const r = R * (0.55 + 0.45 * Math.sin(k * t)) * (0.75 + 0.25 * Math.sin(t * 0.21));
      return [w / 2 + Math.cos(t * 0.9) * r, h / 2 + Math.sin(t * 1.1) * r * 0.9];
    };
    const a = pt(prev), b = pt(st.t);
    segment(a, b, Math.hypot(b[0] - a[0], b[1] - a[1]));
  };

  let raf = 0, prevNow = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prevNow) / 1000); prevNow = now;
    if (!st.visible || document.hidden) return;
    if (st.fade) { ctx.fillStyle = 'rgba(7, 5, 26, 0.035)'; ctx.fillRect(0, 0, w, h); }
    if (!st.auto && !st.last && now - st.idleSince > 6000) st.auto = true;
    if (st.auto) autopilot(dt);
  };

  resize();
  addEventListener('resize', resize);
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { st.visible = e.isIntersecting; }).observe(canvas);
  if (reducedMotion()) { st.auto = false; st.fade = false; for (let i = 0; i < 400; i++) autopilot(1 / 30); }
  else raf = requestAnimationFrame(loop);

  return {
    set(key, value) { st[key] = value; onChange?.(st); },
    get: () => ({ ...st }),
    clear() { ctx.fillStyle = '#07051a'; ctx.fillRect(0, 0, w, h); st.auto = false; st.idleSince = performance.now(); },
    toPNG: () => new Promise((res) => canvas.toBlob(res, 'image/png')),
    stop: () => cancelAnimationFrame(raf),
  };
}

// ---------------------------------------------------------------- 3D ring gallery
export function ringGallery(root, { speed = 7 } = {}) {
  const ring = root.querySelector('.ring');
  const cards = [...ring.children];
  const n = cards.length;
  let angle = 0, vel = 0, dragging = false, lastX = 0, hover = false;
  const layout = () => {
    const cw = cards[0].offsetWidth || 200;
    const radius = Math.round((cw / 2) / Math.tan(Math.PI / n) * 1.18);
    root.style.setProperty('--radius', `${radius}px`);
    cards.forEach((c, i) => { c.style.transform = `rotateY(${(i * 360) / n}deg) translateZ(${radius}px)`; });
  };
  const apply = () => { ring.style.transform = `translateZ(calc(var(--radius) * -1)) rotateY(${angle}deg)`; };
  layout(); apply();
  addEventListener('resize', layout);

  root.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; vel = 0; root.classList.add('is-dragging'); });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    angle += dx * 0.25; vel = dx * 0.25; apply();
  });
  addEventListener('pointerup', () => { dragging = false; root.classList.remove('is-dragging'); });
  root.addEventListener('pointerenter', () => { hover = true; });
  root.addEventListener('pointerleave', () => { hover = false; });
  // Keyboard: focusing a card turns the ring to face it.
  cards.forEach((c, i) => c.addEventListener('focus', () => { angle = -(i * 360) / n; vel = 0; apply(); }));
  // A click after a drag should not open a link.
  root.addEventListener('click', (e) => { if (Math.abs(vel) > 0.6) e.preventDefault(); }, true);

  if (reducedMotion()) return;
  let prev = performance.now(), visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (!visible || dragging) return;
    vel *= 0.94;
    angle += vel + (hover ? 0 : -speed * dt);
    apply();
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- click sparks
export function clickSparks({ colors = ['#ff4f87', '#ffce3a', '#3ee6c1', '#8b6bff', '#ffffff'] } = {}) {
  if (reducedMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'fx-sparks'; c.setAttribute('aria-hidden', 'true');
  document.body.append(c);
  const ctx = c.getContext('2d');
  const sparks = [];
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * d; c.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener('resize', size);
  let running = false;
  const loop = (now) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i], p = (now - s.t0) / 520;
      if (p >= 1) { sparks.splice(i, 1); continue; }
      const e = 1 - (1 - p) ** 3, len = 16 * (1 - p);
      const d0 = 6 + e * 46, x = s.x + Math.cos(s.a) * d0, y = s.y + Math.sin(s.a) * d0;
      ctx.strokeStyle = s.c; ctx.globalAlpha = 1 - p; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(s.a) * len, y + Math.sin(s.a) * len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (sparks.length) requestAnimationFrame(loop); else running = false;
  };
  addEventListener('pointerdown', (e) => {
    const t0 = performance.now(), n = 12, off = Math.random() * TAU;
    for (let i = 0; i < n; i++) sparks.push({ x: e.clientX, y: e.clientY, a: off + (i * TAU) / n, c: colors[i % colors.length], t0 });
    if (!running) { running = true; requestAnimationFrame(loop); }
  }, { passive: true });
}

// ---------------------------------------------------------------- floating stickers
export function floatStickers(host, stickers) {
  host.innerHTML = stickers.map((s, i) =>
    `<span class="sticker" style="left:${s.x}%;top:${s.y}%;--size:${s.size}px;--depth:${s.depth};--delay:${(i * -1.7).toFixed(1)}s;--spin:${s.spin}deg">${s.svg}</span>`).join('');
  if (reducedMotion()) return;
  let tx = 0, ty = 0, x = 0, y = 0;
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  const els = [...host.children];
  const loop = () => {
    requestAnimationFrame(loop);
    x += (tx - x) * 0.06; y += (ty - y) * 0.06;
    for (const el of els) { const d = Number(el.style.getPropertyValue('--depth')); el.style.translate = `${(-x * 60 * d).toFixed(1)}px ${(-y * 60 * d).toFixed(1)}px`; }
  };
  requestAnimationFrame(loop);
}
