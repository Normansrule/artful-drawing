// The manual page: live code demos, a reference generated from the language itself,
// and instant search over every section.

import { runInstructions, toBlocks, BUILTINS, FUNCTIONS, COLOR_NAMES } from './instructions.js';
import { blankScene, normalizeScene } from './model.js';
import { renderSceneSVG } from './render.js';
import { esc } from './util.js';

// ---------- runnable code demos ----------
let demoCount = 0;
function renderDemo(pre) {
  const src = pre.textContent.replace(/^\n+|\s+$/g, '');
  const r = runInstructions(src);
  const scene = blankScene();
  let svg;
  try {
    scene.blocks = toBlocks(r, scene);
    if (r.background) scene.background = { ...scene.background, ...r.background };
    svg = renderSceneSVG(normalizeScene(JSON.parse(JSON.stringify(scene))), { prefix: `d${demoCount++}-`, title: 'What this code draws' });
  } catch (e) { svg = `<p class="note">${esc(e.message)}</p>`; }
  const fig = document.createElement('div');
  fig.className = 'demo';
  const code = document.createElement('pre');
  code.className = 'demo-code';
  code.innerHTML = highlight(src);
  const view = document.createElement('div');
  view.className = 'demo-view';
  view.innerHTML = svg + (r.errors.length ? `<p class="demo-err">Line ${r.errors[0].line}: ${esc(r.errors[0].message)}</p>` : '');
  const open = document.createElement('a');
  open.className = 'btn btn-small demo-open';
  open.href = `studio.html#code=${encodeURIComponent(src)}`;
  open.textContent = 'Open in the studio';
  open.title = 'Opens this code in the Code tab, where you can change it';
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.append(open);
  fig.append(code, view, bar);
  pre.replaceWith(fig);
}

/** Light syntax coloring: instructions, numbers, colors, comments, text. */
const WORDS = new Set(BUILTINS.flatMap((b) => [b.name, ...b.aliases]));
function highlight(src) {
  return src.split('\n').map((line) => {
    const cut = line.indexOf('//');
    const code = cut >= 0 ? line.slice(0, cut) : line;
    const comment = cut >= 0 ? `<span class="tk-c">${esc(line.slice(cut))}</span>` : '';
    return code.replace(/("[^"]*")|(#[0-9a-fA-F]{3,6}\b)|(\b\d+\.?\d*\b)|([A-Za-z_][\w-]*)|([^"#\w]+)/g, (m, str, hex, num, word) => {
      if (str) return `<span class="tk-s">${esc(str)}</span>`;
      if (hex) return `<span class="tk-n">${esc(hex)}</span>`;
      if (num) return `<span class="tk-n">${num}</span>`;
      if (word) {
        const w = word.toLowerCase();
        if (w === 'define' || w === 'to') return `<span class="tk-d">${esc(word)}</span>`;
        if (WORDS.has(w) || w === 'else') return `<span class="tk-k">${esc(word)}</span>`;
        if (FUNCTIONS[w]) return `<span class="tk-f">${esc(word)}</span>`;
        if (COLOR_NAMES[w]) return `<span class="tk-col" style="--c:${COLOR_NAMES[w]}">${esc(word)}</span>`;
        return esc(word);
      }
      return esc(m);
    }) + comment;
  }).join('\n');
}

// ---------- the reference, built from the language's own table ----------
function renderReference() {
  const root = document.getElementById('instr-reference');
  if (!root) return;
  const groups = [...new Set(BUILTINS.map((b) => b.group))];
  const sig = (b) => b.args.map((a) => ({ num: 'number', color: 'color', 'color?': '[color]', str: '"text"', word: b.options ? b.options.join('|') : 'word', sym: 'kind [count]' }[a])).join(' ');
  root.innerHTML = groups.map((g) => `
    <h3>${esc(g)}</h3>
    <table class="man-table ref-table">
      <thead><tr><th>Instruction</th><th>What it does</th><th>Example</th></tr></thead>
      <tbody>${BUILTINS.filter((b) => b.group === g).map((b) => `
        <tr>
          <td><code class="ref-sig"><strong>${esc(b.name)}</strong> <span>${esc(sig(b))}</span></code>${b.aliases.length ? `<div class="ref-alias">also ${b.aliases.map((a) => `<code>${esc(a)}</code>`).join(', ')}</div>` : ''}</td>
          <td>${esc(b.help)}</td>
          <td><code class="ref-ex">${highlight(b.example)}</code></td>
        </tr>`).join('')}
      </tbody>
    </table>`).join('') + `
    <h3>Math and color functions</h3>
    <table class="man-table ref-table"><tbody>${Object.entries(FUNCTIONS).map(([name, f]) => `
      <tr><td><code class="ref-sig"><strong>${esc(f.help.split(':')[0])}</strong></code></td><td>${esc(f.help.includes(':') ? f.help.split(':').slice(1).join(':').trim() : `The ${name} of an angle in degrees.`)}</td></tr>`).join('')}
    </tbody></table>
    <p>Math works anywhere a number goes: <code>+ - * / %</code>, brackets, and the comparisons <code>&lt; &gt; &lt;= &gt;= = !=</code> (for <code>if</code>; true is 1, false is 0). Angles are in degrees, so <code>pi</code> is 180 (half a turn).</p>
    <h3>Color names</h3>
    <p class="color-names">${Object.entries(COLOR_NAMES).map(([n, c]) => `<span class="swatch-name"><i style="background:${c}"></i>${n}</span>`).join(' ')}</p>
    <p>Or any hex code like <code>#ff4f87</code>, <code>hue(degrees, saturation, lightness)</code> for the color wheel, and <code>gray(0…100)</code> from black to white.</p>`;
}

// ---------- search ----------
function setupSearch() {
  const input = document.getElementById('manual-search');
  const count = document.getElementById('manual-count');
  const none = document.getElementById('manual-none');
  const sections = [...document.querySelectorAll('.man-section')];
  const tocLinks = new Map([...document.querySelectorAll('.toc a')].map((a) => [a.getAttribute('href').slice(1), a.closest('li')]));
  const texts = sections.map((s) => s.textContent.toLowerCase().replace(/\s+/g, ' '));
  let marks = [];

  const clearMarks = () => {
    for (const m of marks) m.replaceWith(document.createTextNode(m.textContent));
    marks = [];
    sections.forEach((s) => s.normalize());
  };
  const markIn = (root, q) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('svg, script, style, .demo-code') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const hits = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.toLowerCase().includes(q)) hits.push(n);
    for (const n of hits.slice(0, 200)) {
      const i = n.data.toLowerCase().indexOf(q);
      const after = n.splitText(i);
      after.splitText(q.length);
      const mark = document.createElement('mark');
      mark.textContent = after.data;
      after.replaceWith(mark);
      marks.push(mark);
    }
  };
  const run = () => {
    clearMarks();
    const q = input.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    let shown = 0;
    sections.forEach((s, i) => {
      const hit = !words.length || words.every((w) => texts[i].includes(w));
      s.hidden = !hit;
      if (hit) shown++;
      const li = tocLinks.get(s.id);
      if (li) li.classList.toggle('toc-dim', !hit);
      if (hit && words.length) {
        words.forEach((w) => { if (w.length > 1) markIn(s, w); });
        s.querySelectorAll('details.faq').forEach((d) => { if (words.every((w) => d.textContent.toLowerCase().includes(w))) d.open = true; });
      }
    });
    none.hidden = shown > 0;
    count.textContent = words.length ? `${shown} section${shown === 1 ? '' : 's'} match “${input.value.trim()}”` : '';
  };
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; run(); }
    if (e.key === 'Enter') { const first = sections.find((s) => !s.hidden); first?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); input.select(); }
  });
  const q = new URLSearchParams(location.search).get('q');
  if (q) { input.value = q; run(); }
}

renderReference();
document.querySelectorAll('pre.code-demo[data-run]').forEach(renderDemo);
setupSearch();
