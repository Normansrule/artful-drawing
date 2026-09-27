// Small helpers shared by the engine and the studio.

/** Round to 2 decimals so the generated SVG stays small and readable. */
export const r2 = (v) => Math.round(v * 100) / 100;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Seeded pseudo-random number generator (mulberry32).
 * The same seed always gives the same sequence, so "random" drawings
 * can be saved, shared, and reproduced exactly.
 */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
export const uid = () =>
  'b' + (counter++).toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const clone = (o) => JSON.parse(JSON.stringify(o));
