// Drawing assists: the software helps, you do the drawing.
//
//   makeStabilizer   "Steady hand": a lazy-string brush that ignores small wobbles
//   speedPressure    fake pen pressure from speed, for mouse and trackpad users
//   recognizeShape   hold still at the end of a stroke and a rough circle, oval,
//                    rectangle, triangle, polygon or line snaps into a clean one
//
// Everything here is pure math on {x, y} points, so it is tested in Node.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Lazy-string stabilizer. The ink follows the pointer on a string of length `radius`:
 * wobbles smaller than the string never reach the paper.
 */
export function makeStabilizer(radius) {
  let pen = null;
  return {
    push(p) {
      if (!pen || radius <= 0) { pen = { ...p }; return { ...pen }; }
      const d = dist(pen, p);
      if (d <= radius) return null;
      const k = (d - radius) / d;
      pen = { ...p, x: pen.x + (p.x - pen.x) * k, y: pen.y + (p.y - pen.y) * k };
      return { ...pen };
    },
    reset() { pen = null; },
  };
}

/** Faster strokes are thinner, like a real brush. Returns 0.35 to 1.2, smoothed. */
export function speedPressure(prev, speed) {
  const target = Math.max(0.35, Math.min(1.2, 1.25 - speed / 38));
  return prev == null ? target : prev + (target - prev) * 0.35;
}

function pathLength(pts, closed) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return closed ? L + dist(pts[pts.length - 1], pts[0]) : L;
}

/** n points evenly spaced along the stroke. */
export function resample(pts, n, closed = false) {
  const src = closed ? [...pts, pts[0]] : pts;
  const L = pathLength(src, false);
  if (L === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const step = L / (closed ? n : n - 1);
  const out = [{ x: src[0].x, y: src[0].y }];
  let acc = 0;
  for (let i = 1; i < src.length && out.length < n; i++) {
    let a = src[i - 1];
    const b = src[i];
    let seg = dist(a, b);
    while (acc + seg >= step && out.length < n) {
      const t = (step - acc) / seg;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(q);
      a = q; seg = dist(a, b); acc = 0;
    }
    acc += seg;
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  let max = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len ? Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len : dist(pts[i], a);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const angleAt = (a, b, c) => {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

/** Corners of a closed stroke: simplify, then drop nearly straight vertices. */
function corners(ring, perimeter) {
  // Split the loop at the point farthest from the start, simplify both halves.
  let far = 0, idx = 0;
  ring.forEach((p, i) => { const d = dist(p, ring[0]); if (d > far) { far = d; idx = i; } });
  const eps = perimeter * 0.035;
  let v = [...rdp([...ring.slice(0, idx + 1)], eps).slice(0, -1), ...rdp([...ring.slice(idx), ring[0]], eps).slice(0, -1)];
  // Remove vertices whose corner is almost straight, or that sit too close to a neighbor.
  let changed = true;
  while (changed && v.length > 3) {
    changed = false;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i - 1 + v.length) % v.length], b = v[i], c = v[(i + 1) % v.length];
      if (angleAt(a, b, c) > 145 || dist(a, b) < perimeter * 0.05) { v.splice(i, 1); changed = true; break; }
    }
  }
  return v;
}

function pca(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n, cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0, yy = 0, xy = 0;
  for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  xx /= n; yy /= n; xy /= n;
  const mid = (xx + yy) / 2, r = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  return { cx, cy, l1: mid + r, l2: Math.max(0, mid - r), angle: 0.5 * Math.atan2(2 * xy, xx - yy) };
}

const deg = (r) => (r * 180) / Math.PI;
const normRot = (d) => ((((d + 90) % 180) + 180) % 180) - 90; // -90..90

/**
 * Stars: corners that alternate between far (tips) and near (valleys) from the center.
 * Looks at sharp turns in the raw stroke, since stars have too many corners for the polygon test.
 */
function asStar(raw) {
  const ring = resample(raw, 120, true);
  const n = ring.length;
  const cx = ring.reduce((s, p) => s + p.x, 0) / n, cy = ring.reduce((s, p) => s + p.y, 0) / n;
  const r = ring.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const mean = r.reduce((s, x) => s + x, 0) / n;
  // Local maxima of distance from the center = tips.
  const win = 6, tips = [];
  for (let i = 0; i < n; i++) {
    let isMax = r[i] > mean * 1.12;
    for (let k = -win; k <= win && isMax; k++) if (k && r[(i + k + n) % n] > r[i]) isMax = false;
    if (isMax && !tips.some((t) => Math.abs(t - i) < win || n - Math.abs(t - i) < win)) tips.push(i);
  }
  if (tips.length < 5 || tips.length > 8) return null; // four "tips" is just a box
  const outer = tips.reduce((s, i) => s + r[i], 0) / tips.length;
  const inner = Math.min(...r);
  const ratio = inner / outer;
  if (ratio > 0.62) return null; // too round: a polygon, not a star
  // Tips should be evenly spaced and roughly equally long.
  const tipCv = Math.sqrt(tips.reduce((s, i) => s + (r[i] - outer) ** 2, 0) / tips.length) / outer;
  if (tipCv > 0.2) return null;
  const angles = tips.map((i) => Math.atan2(ring[i].y - cy, ring[i].x - cx)).sort((a, b) => a - b);
  const gaps = angles.map((a, i) => ((i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI) - a));
  const ideal = (2 * Math.PI) / tips.length;
  if (gaps.some((g) => Math.abs(g - ideal) > ideal * 0.45)) return null;
  const step = 360 / tips.length;
  let rot = ((((angles[0] * 180) / Math.PI + 90) % step) + step) % step;
  if (rot > step / 2) rot -= step;
  return { kind: 'star', cx, cy, r: outer, points: tips.length, inner: Math.max(0.2, Math.min(0.8, ratio)), rot };
}

/**
 * Guess the clean shape a rough stroke was aiming for.
 * Returns null for scribbles (the stroke is kept as drawn).
 *   { kind: 'line', points: [a, b] }
 *   { kind: 'circle' | 'ellipse' | 'rect', cx, cy, w, h, rot }
 *   { kind: 'polygon', cx, cy, r, sides, rot }            (regular: pentagon to octagon)
 *   { kind: 'triangle' | 'shape', points: [...] }          (straight-edged, corners kept)
 */
export function recognizeShape(raw) {
  if (!raw || raw.length < 5) return null;
  const L = pathLength(raw, false);
  const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diag < 12) return null;
  const gap = dist(raw[0], raw[raw.length - 1]);

  // Open strokes: only straight lines are snapped.
  if (gap > Math.max(24, diag * 0.22)) {
    return gap / L > 0.93 ? { kind: 'line', points: [{ ...raw[0] }, { ...raw[raw.length - 1] }] } : null;
  }

  const ring = resample(raw, 72, true);
  const perimeter = pathLength(ring, true);
  // Ellipse fit (principal axes). For points spread evenly around an ellipse, variance = axis² / 2.
  const e = pca(ring);
  const a = Math.sqrt(2 * e.l1), b = Math.sqrt(2 * e.l2);
  const ca = Math.cos(e.angle), sa = Math.sin(e.angle);
  const ellErr = ring.reduce((s, p) => {
    const dx = p.x - e.cx, dy = p.y - e.cy;
    const u = (dx * ca + dy * sa) / (a || 1), v = (-dx * sa + dy * ca) / (b || 1);
    return s + Math.abs(Math.hypot(u, v) - 1);
  }, 0) / ring.length;

  const v = corners(ring, perimeter);
  const star = asStar(raw);
  if (star) return star;
  let polyErr = Infinity;
  if (v.length >= 3 && v.length <= 8) {
    polyErr = ring.reduce((s, p) => {
      let m = Infinity;
      for (let i = 0; i < v.length; i++) m = Math.min(m, segDist(p, v[i], v[(i + 1) % v.length]));
      return s + m;
    }, 0) / ring.length / (perimeter / (2 * Math.PI));
  }

  recognizeShape.last = { ellErr, polyErr, corners: v.length };
  // Few corners: a polygon is likely. Many corners: only if it fits much better than a round shape,
  // because a wobbly circle also has lots of little "corners".
  const polygonWins = polyErr < 0.07 && (v.length <= 4 ? (polyErr < ellErr * 0.9 || polyErr < 0.045) : polyErr < 0.032 && polyErr < ellErr * 0.8);
  if (!polygonWins) {
    if (ellErr > 0.09) return null; // hearts, clouds and scribbles stay exactly as drawn
    const round = b / a > 0.86;
    const r = (a + b) / 2;
    return round
      ? { kind: 'circle', cx: e.cx, cy: e.cy, w: 2 * r, h: 2 * r, rot: 0 }
      : { kind: 'ellipse', cx: e.cx, cy: e.cy, w: 2 * a, h: 2 * b, rot: normRot(deg(e.angle)) };
  }

  const cx = v.reduce((s, p) => s + p.x, 0) / v.length, cy = v.reduce((s, p) => s + p.y, 0) / v.length;
  if (v.length === 3) return { kind: 'triangle', points: v.map((p) => ({ x: p.x, y: p.y })) };
  if (v.length === 4) {
    // Square it up: take the direction of the first edge, measure the box in that frame.
    let ang = Math.atan2(v[1].y - v[0].y, v[1].x - v[0].x);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    const local = v.map((p) => ({ x: (p.x - cx) * c - (p.y - cy) * s, y: (p.x - cx) * s + (p.y - cy) * c }));
    let w = 2 * local.reduce((m, p) => m + Math.abs(p.x), 0) / 4, h = 2 * local.reduce((m, p) => m + Math.abs(p.y), 0) / 4;
    let rot = normRot(deg(ang));
    if (rot > 45) { rot -= 90; [w, h] = [h, w]; } else if (rot < -45) { rot += 90; [w, h] = [h, w]; }
    if (Math.abs(rot) < 4) rot = 0; // nearly level? make it level
    return { kind: 'rect', cx, cy, w, h, rot };
  }
  // Five to eight corners: regular polygon if the corners sit on a circle, else keep them.
  const rs = v.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const mean = rs.reduce((s, r) => s + r, 0) / rs.length;
  const cv = Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / rs.length) / mean;
  if (cv < 0.14) {
    const first = Math.atan2(v[0].y - cy, v[0].x - cx);
    const step = 360 / v.length;
    let rot = (((deg(first) + 90) % step) + step) % step;
    if (rot > step / 2) rot -= step;
    return { kind: 'polygon', cx, cy, r: mean, sides: v.length, rot };
  }
  return { kind: 'shape', points: v.map((p) => ({ x: p.x, y: p.y })) };
}
