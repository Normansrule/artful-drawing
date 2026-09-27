// Color helpers: hex <-> HSL, hue shifting, and curated palettes.
import { clamp } from './util.js';

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v));

/** Rotate a color around the color wheel by `deg` degrees. */
export function shiftHue(hex, deg) {
  if (!deg || !isHex(hex)) return hex;
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return rgbToHex(...hslToRgb(h + deg, s, l));
}

/** Curated palettes. Each is 5 colors that sit well together. */
export const PALETTES = {
  Candy: ['#ff5c8a', '#ffce3a', '#5ce1e6', '#7b61ff', '#ffffff'],
  Pastel: ['#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff', '#cdb4db'],
  Forest: ['#1d7a4a', '#2fae66', '#a7e08b', '#7a4b2a', '#ffd166'],
  Ocean: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
  Sunset: ['#ff7b00', '#ff5c8a', '#7b2cbf', '#240046', '#ffd166'],
  Autumn: ['#9c3f1a', '#e76f51', '#f4a261', '#e9c46a', '#264653'],
  Winter: ['#ffffff', '#dbeafe', '#93c5fd', '#3b82f6', '#1e3a8a'],
  Ink: ['#221f4f', '#4b4777', '#8e8ab5', '#d6d4ea', '#ffffff'],
};
