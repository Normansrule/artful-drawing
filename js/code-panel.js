// The Code tab: write drawing instructions, see a live preview, add the result as
// ordinary blocks. Your own instructions (made with `define`) can be saved to a
// personal library that works in every drawing.

import {
  runInstructions, toBlocks, BUILTINS, FUNCTIONS, COLOR_NAMES, EXAMPLES,
  extractDefines, mergeIntoLibrary, removeFromLibrary, STARTER_LIBRARY, InstrError,
} from './instructions.js';

const CODE_KEY = 'artful-drawing:code:v1';
const LIB_KEY = 'artful-drawing:my-instructions:v1';

const load = (k, fallback) => { try { const v = localStorage.getItem(k); return v == null ? fallback : v; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: keep going */ } };

/**
 * @param {object} api  what the studio lends us
 *   h(tag, attrs, ...kids)          element helper
 *   scene()                          the current scene
 *   setPreview(blocks|null, bg, turtle) show (or clear) a live preview on the canvas
 *   add(blocks, background, label, replace)  put blocks into the drawing (one undo step)
 *   announce(msg)                    toast + screen reader message
 */
export function setupCodePanel(panel, api) {
  const { h } = api;
  let library = load(LIB_KEY, STARTER_LIBRARY);
  let last = null, timer = 0, live = true;

  const gutter = h('pre', { class: 'code-gutter', 'aria-hidden': 'true' });
  const editor = h('textarea', {
    class: 'code-editor', id: 'code-editor', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
    wrap: 'off', 'aria-describedby': 'code-status', 'aria-label': 'Drawing instructions',
  });
  editor.value = load(CODE_KEY, EXAMPLES[2][1]);
  const status = h('p', { class: 'code-status', id: 'code-status', role: 'status', 'aria-live': 'polite' });

  const examples = h('select', { class: 'code-examples', 'aria-label': 'Open an example' },
    h('option', { value: '' }, 'Open an example…'),
    ...EXAMPLES.map(([name], i) => h('option', { value: String(i) }, name)));
  examples.addEventListener('change', () => {
    const i = Number(examples.value);
    if (examples.value === '') return;
    editor.value = EXAMPLES[i][1];
    examples.value = '';
    changed(true);
    api.announce(`Opened the ${EXAMPLES[i][0]} example. Change any number and watch the preview.`);
  });

  const liveBox = h('input', { type: 'checkbox', id: 'code-live', checked: true });
  liveBox.addEventListener('change', () => { live = liveBox.checked; if (live) run(); else api.setPreview(null); });

  const btnAdd = h('button', { type: 'button', class: 'btn btn-primary', title: 'Add the result to your drawing as blocks (Ctrl+Enter)', onclick: () => commit(false) }, 'Add to drawing');
  const btnReplace = h('button', { type: 'button', class: 'btn', title: 'Clear the drawing first, then add the result', onclick: () => commit(true) }, 'Replace drawing');
  const btnSave = h('button', { type: 'button', class: 'btn btn-small', onclick: saveDefines }, 'Save to My instructions');

  const libList = h('ul', { class: 'lib-list' });
  const libEditor = h('textarea', { class: 'code-editor code-editor-lib', spellcheck: 'false', wrap: 'off', 'aria-label': 'My instructions (works in every drawing)' });
  libEditor.value = library;
  libEditor.addEventListener('input', () => { library = libEditor.value; save(LIB_KEY, library); renderLibrary(); schedule(); });

  // ---- editor behaviour
  const updateGutter = (errLine) => {
    const n = editor.value.split('\n').length;
    gutter.replaceChildren(...Array.from({ length: n }, (_, k) => h('span', { class: k + 1 === errLine ? 'err' : '' }, String(k + 1))));
    gutter.scrollTop = editor.scrollTop;
  };
  editor.addEventListener('scroll', () => { gutter.scrollTop = editor.scrollTop; });
  editor.addEventListener('input', () => changed());
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); commit(false); return; }
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      // Tab indents. Press Esc first to leave the editor with Tab.
      e.preventDefault();
      editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
      changed();
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      // keep the indent of the line above, and indent after a [
      const pos = editor.selectionStart, before = editor.value.slice(0, pos);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const indent = line.match(/^\s*/)[0] + (/\[\s*$/.test(line) ? '  ' : '');
      e.preventDefault();
      editor.setRangeText('\n' + indent, pos, editor.selectionEnd, 'end');
      changed();
    }
  });

  function changed(now = false) {
    save(CODE_KEY, editor.value);
    updateGutter(0);
    if (now) run(); else schedule();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 260); }

  function run() {
    const t0 = performance.now();
    last = runInstructions(editor.value, { library });
    let blocks = null, err = last.errors[0];
    if (!err) {
      try { blocks = toBlocks(last, api.scene()); } catch (e) { if (!(e instanceof InstrError)) throw e; err = { message: e.message, line: null }; }
    } else if (last.items.length) {
      try { blocks = toBlocks(last, api.scene()); } catch { blocks = null; }
    }
    last.blocks = blocks;
    if (live && !panel.hidden) api.setPreview(blocks, last.background, last.turtle);
    updateGutter(err && !err.inLibrary ? err.line : 0);
    const ms = Math.round(performance.now() - t0);
    status.classList.toggle('bad', !!err);
    if (err) {
      status.replaceChildren(
        h('strong', {}, err.inLibrary ? 'In My instructions' : err.line ? `Line ${err.line}` : 'Stopped'), ' ', err.message,
        last.items.length ? h('span', { class: 'muted' }, ' The preview shows what was drawn before that.') : '');
    } else {
      const n = blocks ? blocks.length : 0;
      const own = new Set(extractDefines(editor.value).map((d) => d.name));
      const mine = last.defined.filter((name) => own.has(name));
      status.replaceChildren(
        n ? `Ready: ${n} part${n === 1 ? '' : 's'}` : 'Nothing drawn yet. Try: move 100',
        h('span', { class: 'muted' }, ` · ${last.steps.toLocaleString('en-US')} steps · ${ms} ms`),
        mine.length ? h('span', { class: 'muted' }, ` · you made: ${mine.join(', ')}`) : '');
    }
    btnAdd.disabled = !blocks || !blocks.length;
    btnReplace.disabled = btnAdd.disabled;
    btnSave.disabled = !extractDefines(editor.value).length;
  }

  function commit(replace) {
    run();
    if (!last.blocks || !last.blocks.length) { api.announce('Nothing to add yet. Fix the message under the editor first.'); return; }
    api.add(last.blocks, last.background, replace);
  }

  function saveDefines() {
    const defs = extractDefines(editor.value);
    if (!defs.length) { api.announce('There is no define in the editor to save. Write one like: define square len [ … ]'); return; }
    library = mergeIntoLibrary(library, defs);
    libEditor.value = library;
    save(LIB_KEY, library);
    renderLibrary();
    api.announce(`Saved ${defs.map((d) => d.name).join(', ')} to My instructions. They now work in every drawing.`);
  }

  function renderLibrary() {
    const defs = extractDefines(library);
    libList.replaceChildren(...(defs.length ? defs.map((d) => h('li', {},
      h('button', {
        type: 'button', class: 'lib-name', title: 'Insert at the cursor',
        onclick: () => insert(`${d.name}${d.params.map((p) => ` ${guessValue(p)}`).join('')}`),
      }, h('code', {}, d.name), d.params.length ? h('span', { class: 'muted' }, ' ' + d.params.join(' ')) : ''),
      h('button', {
        type: 'button', class: 'icon-btn lib-del', 'aria-label': `Remove ${d.name} from My instructions`, title: 'Remove',
        onclick: () => {
          library = removeFromLibrary(library, d.name); libEditor.value = library; save(LIB_KEY, library);
          renderLibrary(); schedule(); api.announce(`Removed ${d.name}.`);
        },
      }, '×'),
    )) : [h('li', { class: 'muted' }, 'Nothing saved yet.')]));
  }

  function insert(text) {
    editor.focus();
    const pos = editor.selectionStart;
    const before = editor.value.slice(0, pos);
    const needsNewline = before && !before.endsWith('\n');
    editor.setRangeText((needsNewline ? '\n' : '') + text + '\n', pos, editor.selectionEnd, 'end');
    changed(true);
  }

  // ---- reference: every instruction, grouped, click to insert
  const groups = [...new Set(BUILTINS.map((b) => b.group))];
  const reference = h('div', { class: 'code-ref' },
    ...groups.map((g) => h('details', { class: 'code-ref-group', open: g === 'Move' },
      h('summary', {}, g),
      h('dl', {}, ...BUILTINS.filter((b) => b.group === g).flatMap((b) => [
        h('dt', {}, h('button', { type: 'button', class: 'ref-insert', title: `Insert: ${b.example}`, onclick: () => insert(b.example) }, h('code', {}, b.example))),
        h('dd', {}, b.help, b.aliases.length ? h('span', { class: 'muted' }, ` Also: ${b.aliases.join(', ')}.`) : ''),
      ])))),
    h('details', { class: 'code-ref-group' },
      h('summary', {}, 'Math and colors'),
      h('dl', {}, ...Object.entries(FUNCTIONS).flatMap(([, f]) => [h('dt', {}, h('code', {}, f.help.split(':')[0])), h('dd', {}, f.help.includes(':') ? f.help.split(':').slice(1).join(':').trim() : '')])),
      h('p', { class: 'note' }, 'Math works anywhere a number goes: ', h('code', {}, '+ - * / %'), ', brackets, and comparisons ', h('code', {}, '< > <= >= = !='), ' for if. Angles are in degrees.'),
      h('p', { class: 'note' }, 'Color names: ', ...Object.keys(COLOR_NAMES).flatMap((n, i) => [i ? ', ' : '', h('span', { class: 'swatch-name' }, h('i', { style: `background:${COLOR_NAMES[n]}` }), n)]), '.')),
  );

  panel.replaceChildren(
    h('div', { class: 'code-head' },
      h('h2', {}, 'Code'),
      h('p', { class: 'note' }, 'Draw by writing instructions for a pen. Make your own instructions with ', h('code', {}, 'define'), ', and they work just like the built-in ones. ',
        h('a', { href: 'manual.html#code', target: '_blank', rel: 'noopener' }, 'Read the guide'))),
    h('div', { class: 'code-bar' }, examples,
      h('label', { class: 'check', for: 'code-live' }, liveBox, ' Live preview'),
      h('button', { type: 'button', class: 'icon-btn', title: 'Wider editor', 'aria-label': 'Wider editor', 'aria-pressed': 'false', onclick: (e) => {
        const on = document.body.classList.toggle('code-wide');
        e.currentTarget.setAttribute('aria-pressed', on);
        window.dispatchEvent(new Event('resize'));
      } }, '⇔')),
    h('div', { class: 'code-wrap' }, gutter, editor),
    status,
    h('div', { class: 'code-actions' }, btnAdd, btnReplace),
    h('p', { class: 'note' }, h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Enter'), ' adds to the drawing. ', h('kbd', {}, 'Tab'), ' indents; press ', h('kbd', {}, 'Esc'), ' to leave the editor.'),
    h('section', { class: 'code-lib' },
      h('div', { class: 'code-lib-head' }, h('h3', {}, 'My instructions'), btnSave),
      h('p', { class: 'note' }, 'Instructions you make and save here work in every drawing, like new tools you built yourself. Saved in this browser.'),
      libList,
      h('details', {}, h('summary', {}, 'Edit My instructions'), libEditor,
        h('div', { class: 'code-actions' },
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => api.download(new Blob([library], { type: 'text/plain' }), 'my-instructions.txt') }, 'Download'),
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
            if (!confirm('Put back the starter instructions? Your saved ones will be removed.')) return;
            library = STARTER_LIBRARY; libEditor.value = library; save(LIB_KEY, library); renderLibrary(); schedule();
          } }, 'Reset')))),
    h('section', { class: 'code-ref-wrap' }, h('h3', {}, 'Every instruction'), h('p', { class: 'note' }, 'Click one to put it in the editor.'), reference),
  );

  renderLibrary();
  updateGutter(0);
  return {
    shown() { run(); },
    hidden() { api.setPreview(null); },
    refresh() { if (!panel.hidden && live) run(); },
  };
}

/** A friendly starting number for a parameter, based on its name. */
function guessValue(param) {
  if (/^(n|count|sides|petals|points|times|copies)$/.test(param)) return 6;
  if (/depth|level/.test(param)) return 3;
  if (/angle|turn/.test(param)) return 90;
  return 100;
}
