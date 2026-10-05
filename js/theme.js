// Themes: "Studio" (graphite dark, default), "Daylight" (neutral light) and the playful "Night".
// The <head> of each page sets the theme before first paint; this module adds the switcher
// and remembers the choice.

const KEY = 'artful-drawing:theme2';
const THEMES = [
  ['studio', 'Dark', '#141518'],
  ['daylight', 'Light', '#f3f3f5'],
  ['night', 'Playful', '#0b0920'],
];
export const getTheme = () => document.documentElement.dataset.theme || 'studio';

export function setTheme(theme) {
  if (!THEMES.some(([t]) => t === theme)) theme = 'studio';
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('pro', theme !== 'night');
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: still switches for this visit */ }
  const [, label, color] = THEMES.find(([t]) => t === theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    const next = THEMES[(THEMES.findIndex(([t]) => t === theme) + 1) % THEMES.length];
    btn.textContent = `◐ ${label}`;
    btn.setAttribute('aria-label', `Theme: ${label}. Switch to ${next[1]}.`);
    btn.title = btn.getAttribute('aria-label');
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

export function mountThemeToggle() {
  const bar = document.querySelector('.top-actions');
  if (!bar || bar.querySelector('.theme-toggle') || document.body.classList.contains('page-home')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn theme-toggle';
  btn.addEventListener('click', () => {
    const i = THEMES.findIndex(([t]) => t === getTheme());
    setTheme(THEMES[(i + 1) % THEMES.length][0]);
  });
  bar.prepend(btn);
  setTheme(getTheme());
}

mountThemeToggle();
