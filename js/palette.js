// The command palette (Ctrl+K): type a few letters of anything the studio can do,
// press Enter. Every command also shows its keyboard shortcut, so people learn them.

/**
 * Score how well a query matches a label. Letters must appear in order; matches at the
 * start of words and runs of consecutive letters score higher. 0 means no match.
 * Pure function, so it is tested in Node.
 */
export function fuzzyScore(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t.includes(q)) return 1000 - t.indexOf(q) * 2 - (t.length - q.length) * 0.1 + (t.startsWith(q) ? 200 : 0);
  let score = 0, ti = 0, run = 0;
  for (const ch of q) {
    if (ch === ' ') { run = 0; continue; }
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    const wordStart = found === 0 || /[\s\-/(]/.test(t[found - 1]);
    run = found === ti ? run + 1 : 0;
    score += 1 + (wordStart ? 8 : 0) + run * 3 - Math.min(found - ti, 10) * 0.3;
    ti = found + 1;
  }
  return Math.max(0.01, score);
}

/** Rank commands for a query: best first, ties keep their original order. */
export function rankCommands(query, commands, limit = 60) {
  return commands
    .map((c, i) => ({ c, i, s: Math.max(fuzzyScore(query, c.label), (c.keywords ? fuzzyScore(query, c.keywords) * 0.8 : 0), fuzzyScore(query, `${c.group} ${c.label}`) * 0.9) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    // when some commands contain the words exactly, drop the loose letter-by-letter matches
    .filter((x, _, arr) => !(arr[0] && arr[0].s >= 500 && x.s < 100))
    .slice(0, limit)
    .map((x) => x.c);
}

/**
 * Build the palette dialog once. getCommands() is called each time it opens, so the
 * list always matches what is possible right now (for example, only offer "Group"
 * when parts are selected).
 * command: { label, group, run(), hint?: 'Ctrl+D', keywords?: 'extra search words' }
 */
export function createPalette({ h, getCommands }) {
  const input = h('input', {
    type: 'text', class: 'palette-input', placeholder: 'Type a command, a shape, a picture…',
    'aria-label': 'Search commands', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', autocomplete: 'off', spellcheck: 'false',
  });
  const list = h('ul', { class: 'palette-list', id: 'palette-list', role: 'listbox', 'aria-label': 'Commands' });
  const foot = h('p', { class: 'palette-foot' },
    h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' choose'), h('span', {}, h('kbd', {}, 'Enter'), ' run'), h('span', {}, h('kbd', {}, 'Esc'), ' close'));
  const dialog = h('dialog', { class: 'palette', 'aria-label': 'Command palette' }, h('div', { class: 'palette-box' }, input, list, foot));
  document.body.append(dialog);

  let all = [], shown = [], active = 0;
  const render = () => {
    shown = rankCommands(input.value, all);
    active = Math.min(active, Math.max(0, shown.length - 1));
    let lastGroup = null;
    const items = [];
    shown.forEach((c, i) => {
      if (!input.value.trim() && c.group !== lastGroup) { items.push(h('li', { class: 'palette-group', role: 'presentation' }, c.group)); lastGroup = c.group; }
      items.push(h('li', {
        id: `pal-${i}`, role: 'option', class: 'palette-item', 'aria-selected': String(i === active),
        onpointermove: () => { if (active !== i) { active = i; mark(); } },
        onclick: () => runAt(i),
      },
      h('span', { class: 'palette-label' }, c.label),
      input.value.trim() ? h('span', { class: 'palette-where' }, c.group) : null,
      c.hint ? h('kbd', { class: 'palette-hint' }, c.hint) : null));
    });
    if (!shown.length) items.push(h('li', { class: 'palette-empty' }, 'Nothing matches. Try “star”, “export”, “mirror” or “code”.'));
    list.replaceChildren(...items);
    mark();
  };
  const mark = () => {
    list.querySelectorAll('[role=option]').forEach((li) => li.setAttribute('aria-selected', String(li.id === `pal-${active}`)));
    const el = list.querySelector(`#pal-${active}`);
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  };
  const runAt = (i) => {
    const c = shown[i];
    if (!c) return;
    dialog.close();
    // let the dialog close before the command (some commands open other dialogs)
    setTimeout(() => c.run(), 0);
  };
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, shown.length); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + shown.length) % Math.max(1, shown.length); mark(); }
    else if (e.key === 'PageDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 8); mark(); }
    else if (e.key === 'PageUp') { e.preventDefault(); active = Math.max(0, active - 8); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(active); }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  return {
    open(prefill = '') {
      all = getCommands();
      input.value = prefill; active = 0;
      render();
      if (!dialog.open) dialog.showModal();
      input.focus(); input.select();
    },
    get isOpen() { return dialog.open; },
  };
}
