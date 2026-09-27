// Night (default) or Paper theme. The <head> of each page sets the attribute
// before first paint; this module adds the toggle button and remembers the choice.

const KEY = 'artful-drawing:theme';
export const getTheme = () => document.documentElement.dataset.theme || 'night';

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: still switches for this visit */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#0b0920' : '#221f4f');
  const btn = document.querySelector('.theme-toggle');
  if (btn) {
    btn.textContent = theme === 'night' ? '☀' : '☾';
    btn.setAttribute('aria-label', theme === 'night' ? 'Switch to the light paper theme' : 'Switch to the night theme');
    btn.title = btn.getAttribute('aria-label');
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

export function mountThemeToggle() {
  const bar = document.querySelector('.top-actions');
  if (!bar || bar.querySelector('.theme-toggle')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn theme-toggle';
  btn.addEventListener('click', () => setTheme(getTheme() === 'night' ? 'paper' : 'night'));
  bar.prepend(btn);
  setTheme(getTheme());
}

mountThemeToggle();
