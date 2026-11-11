// Drawing instructions: a tiny drawing language, in the spirit of Logo turtle graphics.
//
// A pen (the "turtle") starts in the middle of the page, facing up. Instructions move and
// turn it; it draws as it goes. People can make their OWN instructions with `define`,
// and those become as easy to use as the built-in ones.
//
//   repeat 5 [ move 200  turn 144 ]          // a star
//   define petal-ring n [ repeat n [ petal 60 200  turn 360 / n ] ]
//   petal-ring 8
//
// runInstructions(source) -> { items, background, errors, defined, turtle }
// toBlocks(result, scene)   -> ordinary, editable blocks (pure; tested in Node)

import { makeBlock, makeRepeat } from './model.js';
import { hslToRgb, rgbToHex, isHex } from './color.js';
import { uid } from './util.js';

// ---------------------------------------------------------------- the instruction set
// kinds: num (a number or a sum like size / 2), color, word, str (text in "quotes")
export const BUILTINS = [
  // moving
  { name: 'move', aliases: ['forward', 'fd'], args: ['num'], group: 'Move', help: 'Move forward, drawing a line (unless the pen is up).', example: 'move 100' },
  { name: 'back', aliases: ['bk'], args: ['num'], group: 'Move', help: 'Move backward, drawing a line.', example: 'back 50' },
  { name: 'jump', aliases: [], args: ['num'], group: 'Move', help: 'Move forward without drawing. Use a negative number to jump backward.', example: 'jump -200' },
  { name: 'turn', aliases: ['right', 'rt'], args: ['num'], group: 'Move', help: 'Turn clockwise by some degrees. 90 is a right angle; negative numbers turn the other way.', example: 'turn 90' },
  { name: 'left', aliases: ['lt'], args: ['num'], group: 'Move', help: 'Turn counterclockwise by some degrees.', example: 'left 45' },
  { name: 'goto', aliases: ['setpos'], args: ['num', 'num'], group: 'Move', help: 'Go to a spot. 0 0 is the middle of the page; x grows to the right and y grows upward. Draws a line if the pen is down.', example: 'goto -200 100' },
  { name: 'heading', aliases: ['face'], args: ['num'], group: 'Move', help: 'Face a direction: 0 is up, 90 is right, 180 is down, 270 is left.', example: 'heading 90' },
  { name: 'home', aliases: [], args: [], group: 'Move', help: 'Go back to the middle of the page, facing up (without drawing).', example: 'home' },
  { name: 'push', aliases: ['save'], args: [], group: 'Move', help: 'Remember where the pen is and which way it faces.', example: 'push' },
  { name: 'pop', aliases: ['restore'], args: [], group: 'Move', help: 'Jump back to the last place you remembered with push. Great for trees and branches.', example: 'pop' },
  // pen
  { name: 'penup', aliases: ['pu'], args: [], group: 'Pen', help: 'Lift the pen: moving no longer draws.', example: 'penup' },
  { name: 'pendown', aliases: ['pd'], args: [], group: 'Pen', help: 'Put the pen down: moving draws again.', example: 'pendown' },
  { name: 'color', aliases: ['pencolor', 'colour'], args: ['color'], group: 'Pen', help: 'Line color: a name like pink, a code like #ff4f87, or hue(…) for rainbow colors.', example: 'color hue(i * 30)' },
  { name: 'fill', aliases: [], args: ['color'], group: 'Pen', help: 'Fill color for shapes. If it differs from the line color, shapes get an outline.', example: 'fill gold' },
  { name: 'nofill', aliases: [], args: [], group: 'Pen', help: 'Shapes are outlines only, with no fill.', example: 'nofill' },
  { name: 'size', aliases: ['pensize', 'thickness'], args: ['num'], group: 'Pen', help: 'Line thickness.', example: 'size 6' },
  { name: 'brush', aliases: [], args: ['word'], group: 'Pen', options: ['ink', 'brush', 'marker', 'pencil', 'neon', 'dots'], help: 'Line style: ink, brush, marker, pencil, neon or dots.', example: 'brush neon' },
  { name: 'smooth', aliases: [], args: ['num'], group: 'Pen', help: 'Round off corners: 0 keeps sharp corners, 1 is very smooth.', example: 'smooth 0.6' },
  { name: 'symmetry', aliases: [], args: ['sym'], group: 'Pen', help: 'Copy everything you draw next: none, mirror, spin 6, or kaleido 8.', example: 'symmetry spin 6' },
  { name: 'background', aliases: ['bg'], args: ['color', 'color?'], group: 'Pen', help: 'Color the page. Give two colors for a top-to-bottom blend.', example: 'background navy black' },
  // shapes at the pen
  { name: 'circle', aliases: [], args: ['num'], group: 'Shapes', help: 'A circle centered on the pen, with this radius.', example: 'circle 50' },
  { name: 'oval', aliases: ['ellipse'], args: ['num', 'num'], group: 'Shapes', help: 'An oval this wide and this tall, turned the way the pen faces.', example: 'oval 120 60' },
  { name: 'box', aliases: ['rect'], args: ['num', 'num'], group: 'Shapes', help: 'A rectangle this wide and this tall, turned the way the pen faces.', example: 'box 100 60' },
  { name: 'star', aliases: [], args: ['num', 'num'], group: 'Shapes', help: 'A star with this radius and number of points.', example: 'star 60 5' },
  { name: 'heart', aliases: [], args: ['num'], group: 'Shapes', help: 'A heart this big.', example: 'heart 80' },
  { name: 'petal', aliases: ['leaf'], args: ['num', 'num'], group: 'Shapes', help: 'A petal this wide and this long, growing out from the pen in the direction it faces.', example: 'petal 60 180' },
  { name: 'polygon', aliases: [], args: ['num', 'num'], group: 'Shapes', help: 'A regular shape with this radius and number of sides.', example: 'polygon 70 6' },
  { name: 'dot', aliases: [], args: ['num'], group: 'Shapes', help: 'A small filled circle. Thousands of dots stay fast, because dots of one color become one part.', example: 'dot 6' },
  { name: 'write', aliases: ['text'], args: ['str', 'num'], group: 'Shapes', help: 'Words in quotes, this tall.', example: 'write "Hello!" 60' },
  // flow
  { name: 'repeat', aliases: [], args: [], group: 'Flow', help: 'Do the instructions in [ ] a number of times. Inside, i counts 1, 2, 3…', example: 'repeat 4 [ move 100  turn 90 ]' },
  { name: 'if', aliases: [], args: [], group: 'Flow', help: 'Do something only when a condition is true, with an optional else.', example: 'if len < 5 [ stop ] else [ move len ]' },
  { name: 'define', aliases: ['to'], args: [], group: 'Flow', help: 'Make your own instruction with inputs. Use it like any other instruction, even inside itself.', example: 'define square len [ repeat 4 [ move len  turn 90 ] ]' },
  { name: 'set', aliases: ['let'], args: [], group: 'Flow', help: 'Give a number a name to use later.', example: 'set gap 40' },
  { name: 'stop', aliases: [], args: [], group: 'Flow', help: 'Leave your own instruction early (useful to end a pattern that calls itself).', example: 'stop' },
  { name: 'shape', aliases: [], args: [], group: 'Flow', help: 'Everything drawn inside [ ] becomes one filled shape.', example: 'shape [ repeat 3 [ move 150  turn 120 ] ]' },
  { name: 'seed', aliases: [], args: ['num'], group: 'Flow', help: 'Pick a different set of random numbers. The same seed always draws the same picture.', example: 'seed 42' },
];

export const FUNCTIONS = {
  random: { help: 'random(a, b): a random number between a and b (or 0 and a).', n: [1, 2] },
  sin: { help: 'sin(degrees)', n: [1] }, cos: { help: 'cos(degrees)', n: [1] }, tan: { help: 'tan(degrees)', n: [1] },
  sqrt: { help: 'sqrt(x): square root', n: [1] }, abs: { help: 'abs(x): drop the minus sign', n: [1] },
  round: { help: 'round(x)', n: [1] }, floor: { help: 'floor(x): round down', n: [1] },
  min: { help: 'min(a, b)', n: [2] }, max: { help: 'max(a, b)', n: [2] },
  hue: { help: 'hue(degrees): a bright color from the color wheel (for color and fill)', n: [1, 2, 3] },
  gray: { help: 'gray(0…100): black to white (for color and fill)', n: [1] },
};

export const COLOR_NAMES = {
  black: '#1c1d21', white: '#ffffff', gray: '#8b8d94', grey: '#8b8d94', silver: '#c8cad0',
  red: '#e5484d', coral: '#ff7a6b', orange: '#f5891f', gold: '#f2b630', yellow: '#ffd43b', lemon: '#fff27a',
  lime: '#9ad94a', green: '#3fb68b', forest: '#2e7d4f', mint: '#8ff0c8', teal: '#14a39a', sky: '#7cc4ff',
  blue: '#3b82f6', navy: '#1e2a5a', indigo: '#5b5bd6', purple: '#8b5cf6', violet: '#a77bf3', lavender: '#c9b8ff',
  pink: '#ff6fa8', rose: '#ff4f87', magenta: '#d946ef', brown: '#8a5a2b', tan: '#d2a679', cream: '#fff6dd', ink: '#221f4f',
};

const LOOKUP = new Map();
for (const b of BUILTINS) for (const n of [b.name, ...b.aliases]) LOOKUP.set(n, b);
const KEYWORDS = new Set(['else', 'end']);
const isCommand = (w) => LOOKUP.has(w) || KEYWORDS.has(w);

const LIMITS = { steps: 250000, depth: 80, points: 120000, items: 6000, blocks: 400 };

export class InstrError extends Error {
  constructor(message, line) { super(message); this.line = line; }
}

// ---------------------------------------------------------------- tokens
function tokenize(src) {
  const out = [];
  const re = /(\/\/[^\n]*)|(\n)|([ \t\r]+)|("(?:[^"\\\n]|\\.)*"?)|(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)|(\d+\.?\d*|\.\d+)|([A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z][A-Za-z0-9_]*)*)|(<=|>=|==|!=|[\[\]()+\-*/%<>=,])|(.)/g;
  let m, line = 1, sp = true;
  const push = (tok) => { tok.sp = sp; tok.at = m.index; sp = false; out.push(tok); };
  while ((m = re.exec(src))) {
    if (m[1] || m[3]) { sp = true; continue; }
    if (m[2]) { line++; sp = true; continue; }
    if (m[4] != null) {
      if (!m[4].endsWith('"') || m[4].length < 2) throw new InstrError('This text is missing its closing quote mark (").', line);
      push({ t: 'str', v: m[4].slice(1, -1).replace(/\\(.)/g, '$1'), line });
    } else if (m[5]) push({ t: 'color', v: m[5].toLowerCase(), line });
    else if (m[6]) push({ t: 'num', v: parseFloat(m[6]), line });
    else if (m[7]) {
      // Words may contain dashes between letters (petal-ring), while depth-1 still means depth minus 1.
      push({ t: 'word', v: m[7].toLowerCase(), raw: m[7], line });
    } else if (m[8]) push({ t: 'op', v: m[8] === '==' ? '=' : m[8], line });
    else throw new InstrError(`I don't understand the character "${m[9]}".`, line);
  }
  out.push({ t: 'eof', line });
  return out;
}

// ---------------------------------------------------------------- parsing
function closest(word, candidates) {
  const dist = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  };
  let best = null, bd = Math.min(3, Math.floor(word.length / 3) + 2);
  for (const c of candidates) { const k = dist(word, c); if (k < bd) { bd = k; best = c; } }
  return best;
}

class Parser {
  constructor(tokens, defs) {
    this.tk = tokens; this.i = 0; this.defs = defs; // defs: Map name -> param count (pre-scanned)
    this.vars = [new Set(['i', 'pi'])];
    this.globals = new Set();
  }
  peek(k = 0) { return this.tk[this.i + k]; }
  next() { return this.tk[this.i++]; }
  isOp(v, k = 0) { const t = this.peek(k); return t.t === 'op' && t.v === v; }
  expectOp(v, what) {
    const t = this.next();
    if (t.t !== 'op' || t.v !== v) throw new InstrError(`Expected "${v}"${what ? ` ${what}` : ''}, but found ${describe(t)}.`, t.line);
    return t;
  }
  knownVar(w) { return this.globals.has(w) || this.vars.some((s) => s.has(w)); }

  program() {
    const body = [];
    while (this.peek().t !== 'eof') {
      if (this.isOp(']')) throw new InstrError('There is a "]" without a matching "[".', this.peek().line);
      body.push(this.statement());
    }
    return body;
  }
  block(what) {
    const open = this.peek();
    if (!(open.t === 'op' && open.v === '[')) throw new InstrError(`Expected "[" to start the instructions ${what}, but found ${describe(open)}.`, open.line);
    this.next();
    const body = [];
    while (!this.isOp(']')) {
      if (this.peek().t === 'eof') throw new InstrError(`The "[" ${what} (line ${open.line}) is never closed with "]".`, open.line);
      body.push(this.statement());
    }
    this.next();
    return body;
  }

  statement() {
    const t = this.next();
    if (t.t === 'op' && t.v === '-' && this.peek().t === 'num') throw new InstrError(`There is one number too many before -${this.peek().v}. To subtract, put a space on both sides of the minus, like 10 - 5.`, t.line);
    if (t.t !== 'word') throw new InstrError(`Expected an instruction such as move or turn, but found ${describe(t)}.`, t.line);
    const w = t.v, line = t.line;
    if (w === 'define' || w === 'to') {
      const nt = this.next();
      if (nt.t !== 'word') throw new InstrError('After define, give your instruction a name, like: define square len [ … ]', nt.line);
      const name = nt.v;
      if (LOOKUP.has(name) || KEYWORDS.has(name)) throw new InstrError(`"${name}" is already a built-in instruction. Pick another name for yours, like my-${name}.`, nt.line);
      const params = [];
      while (this.peek().t === 'word') params.push(this.next().v);
      this.vars.push(new Set(params));
      const body = this.block(`for "${name}"`);
      this.vars.pop();
      return { k: 'define', name, params, body, line };
    }
    if (w === 'repeat') {
      const count = this.expr();
      this.vars.push(new Set(['i']));
      const body = this.block('to repeat');
      this.vars.pop();
      return { k: 'repeat', count, body, line };
    }
    if (w === 'if') {
      const cond = this.expr();
      const then = this.block('for if');
      let other = null;
      if (this.peek().t === 'word' && this.peek().v === 'else') { this.next(); other = this.block('for else'); }
      return { k: 'if', cond, then, other, line };
    }
    if (w === 'set' || w === 'let') {
      const nt = this.next();
      if (nt.t !== 'word' || isCommand(nt.v)) throw new InstrError(`After set, give a name for the number, like: set gap 40${nt.t === 'word' ? ` ("${nt.v}" is an instruction)` : ''}.`, nt.line);
      this.globals.add(nt.v);
      if (this.isOp('=')) this.next(); // allow "set gap = 40"
      return { k: 'set', name: nt.v, value: this.expr(), line };
    }
    if (w === 'shape') return { k: 'shape', body: this.block('for shape'), line };
    if (w === 'else') throw new InstrError('"else" must come right after the "]" of an if.', line);
    if (w === 'end') throw new InstrError('This language uses [ and ] instead of end. Put the instructions inside [ ].', line);

    const b = LOOKUP.get(w);
    if (b) {
      const args = [];
      for (const kind of b.args) {
        if (kind === 'num') args.push(this.expr());
        else if (kind === 'color') args.push(this.color());
        else if (kind === 'color?') { if (this.startsColor()) args.push(this.color()); }
        else if (kind === 'str') {
          const s = this.next();
          if (s.t !== 'str') throw new InstrError(`${b.name} needs words in quotes, like: ${b.example}`, s.line);
          args.push(s.v);
        } else if (kind === 'word') {
          const s = this.next();
          if (s.t !== 'word' || !b.options.includes(s.v)) throw new InstrError(`${b.name} can be ${b.options.join(', ')}. Found ${describe(s)}.`, s.line);
          args.push(s.v);
        } else if (kind === 'sym') {
          const s = this.next();
          const ok = ['none', 'mirror', 'spin', 'kaleido'];
          if (s.t !== 'word' || !ok.includes(s.v)) throw new InstrError(`symmetry can be none, mirror, spin 6 or kaleido 8. Found ${describe(s)}.`, s.line);
          args.push(s.v);
          args.push(s.v === 'spin' || s.v === 'kaleido' ? this.expr() : null);
        }
      }
      return { k: 'cmd', name: b.name, args, line };
    }
    if (this.defs.has(w)) {
      const n = this.defs.get(w);
      const args = [];
      for (let k = 0; k < n; k++) {
        if (!this.startsExpr()) throw new InstrError(`${t.raw} needs ${n} number${n === 1 ? '' : 's'}, but got ${k}.`, line);
        args.push(this.expr());
      }
      return { k: 'call', name: w, args, line };
    }
    if (this.knownVar(w)) throw new InstrError(`"${t.raw}" is a number, not an instruction. Use it inside one, like: move ${t.raw}`, line);
    const hint = closest(w, [...LOOKUP.keys(), ...this.defs.keys()]);
    throw new InstrError(`I don't know the instruction "${t.raw}".${hint ? ` Did you mean ${hint}?` : ' Make it with define.'}`, line);
  }

  startsColor() {
    const t = this.peek();
    return t.t === 'color' || (t.t === 'word' && (COLOR_NAMES[t.v] || ((t.v === 'hue' || t.v === 'gray') && this.isOp('(', 1))));
  }
  color() {
    const t = this.peek();
    if (t.t === 'color') { this.next(); return { k: 'lit', v: t.v.length === 4 ? '#' + [...t.v.slice(1)].map((c) => c + c).join('') : t.v }; }
    if (t.t === 'word' && COLOR_NAMES[t.v]) { this.next(); return { k: 'lit', v: COLOR_NAMES[t.v] }; }
    if (t.t === 'word' && (t.v === 'hue' || t.v === 'gray') && this.isOp('(', 1)) return this.expr();
    const hint = t.t === 'word' ? closest(t.v, Object.keys(COLOR_NAMES)) : null;
    throw new InstrError(`Expected a color, like pink, #ff4f87 or hue(200), but found ${describe(t)}.${hint ? ` Did you mean ${hint}?` : ''}`, t.line);
  }

  startsExpr() {
    const t = this.peek();
    if (t.t === 'num' || (t.t === 'op' && (t.v === '(' || t.v === '-'))) return true;
    return t.t === 'word' && (this.knownVar(t.v) || FUNCTIONS[t.v] || !isCommand(t.v));
  }
  expr() { return this.compare(); }
  compare() {
    let a = this.sum();
    while (this.peek().t === 'op' && ['<', '>', '<=', '>=', '=', '!='].includes(this.peek().v)) {
      const op = this.next().v; a = { k: 'bin', op, a, b: this.sum() };
    }
    return a;
  }
  sum() {
    let a = this.product();
    while (this.peek().t === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
      // "goto 0 -250" is two numbers: a minus with a space before it but not after starts a new one
      if (this.peek().v === '-' && this.peek().sp && !this.peek(1).sp) break;
      const op = this.next().v; a = { k: 'bin', op, a, b: this.product() };
    }
    return a;
  }
  product() {
    let a = this.unary();
    while (this.peek().t === 'op' && ['*', '/', '%'].includes(this.peek().v)) {
      const op = this.next().v; a = { k: 'bin', op, a, b: this.unary() };
    }
    return a;
  }
  unary() {
    if (this.isOp('-')) { this.next(); return { k: 'neg', a: this.unary() }; }
    return this.primary();
  }
  primary() {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expectOp(')', 'to close the bracket'); return e; }
    if (t.t === 'word') {
      if (FUNCTIONS[t.v] && this.isOp('(')) {
        this.next();
        const args = [];
        if (!this.isOp(')')) { args.push(this.expr()); while (this.isOp(',')) { this.next(); args.push(this.expr()); } }
        this.expectOp(')', `to finish ${t.v}(…)`);
        if (!FUNCTIONS[t.v].n.includes(args.length)) throw new InstrError(`${FUNCTIONS[t.v].help}`, t.line);
        return { k: 'fn', name: t.v, args, line: t.line };
      }
      if (this.knownVar(t.v) || !isCommand(t.v)) return { k: 'var', name: t.v, raw: t.raw, line: t.line };
      throw new InstrError(`Expected a number, but found the instruction "${t.raw}". Did you forget a number before it?`, t.line);
    }
    throw new InstrError(`Expected a number, but found ${describe(t)}.`, t.line);
  }
}

function describe(t) {
  if (t.t === 'eof') return 'the end of the instructions';
  if (t.t === 'str') return 'some text in quotes';
  if (t.t === 'num') return `the number ${t.v}`;
  return `"${t.raw || t.v}"`;
}

/** Find every `define name params [` so instructions can be used before (or above) where they are defined. */
function scanDefines(tokens, into) {
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].t === 'word' && (tokens[i].v === 'define' || tokens[i].v === 'to') && tokens[i + 1].t === 'word') {
      let n = 0, j = i + 2;
      while (tokens[j] && tokens[j].t === 'word') { n++; j++; }
      into.set(tokens[i + 1].v, n);
    }
  }
}

export function parseInstructions(src, library = '') {
  const libTokens = tokenize(library);
  const tokens = tokenize(src);
  const defs = new Map();
  scanDefines(libTokens, defs);
  scanDefines(tokens, defs);
  let lib = [];
  try { lib = new Parser(libTokens, defs).program(); } catch (e) { if (e instanceof InstrError) e.inLibrary = true; throw e; }
  return { lib, main: new Parser(tokens, defs).program(), defs };
}

// ---------------------------------------------------------------- your own instruction library
/**
 * Find each `define name params [ … ]` in some source, with its exact text.
 * Returns [{ name, params, text, start, end }]. Unfinished defines are skipped.
 */
export function extractDefines(src) {
  let tk;
  try { tk = tokenize(src); } catch { return []; }
  const out = [];
  for (let i = 0; i < tk.length - 1; i++) {
    const t = tk[i];
    if (!(t.t === 'word' && (t.v === 'define' || t.v === 'to') && tk[i + 1].t === 'word')) continue;
    const params = [];
    let j = i + 2;
    while (tk[j].t === 'word') params.push(tk[j++].v);
    if (!(tk[j].t === 'op' && tk[j].v === '[')) continue;
    let depth = 0, k = j;
    for (; tk[k].t !== 'eof'; k++) {
      if (tk[k].t === 'op' && tk[k].v === '[') depth++;
      if (tk[k].t === 'op' && tk[k].v === ']' && --depth === 0) break;
    }
    if (tk[k].t === 'eof') continue;
    // keep a comment written right above the define, so the library explains itself
    let start = t.at;
    const before = src.slice(0, start).match(/((?:^|\n)[ \t]*\/\/[^\n]*)+\n?[ \t]*$/);
    if (before) start -= before[0].replace(/^\n/, '').length;
    out.push({ name: tk[i + 1].v, params, start, end: tk[k].at + 1, text: src.slice(start, tk[k].at + 1).trim() });
    i = k;
  }
  return out;
}

/** Add (or replace, by name) defines in a library. Returns the new library text. */
export function mergeIntoLibrary(library, defines) {
  const names = new Set(defines.map((d) => d.name));
  let text = library;
  for (const d of extractDefines(library).reverse()) {
    if (names.has(d.name)) text = text.slice(0, d.start) + text.slice(d.end);
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return [text, ...defines.map((d) => d.text)].filter(Boolean).join('\n\n') + '\n';
}

/** Take one define out of a library by name. */
export function removeFromLibrary(library, name) {
  const d = extractDefines(library).find((x) => x.name === name);
  if (!d) return library;
  return (library.slice(0, d.start) + library.slice(d.end)).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** A starter library, so "My instructions" is never an empty box. */
export const STARTER_LIBRARY = `// My instructions: anything defined here works in every drawing.
// Save your own from the editor with "Save to My instructions".

// A regular shape with any number of sides
define ngon sides len [
  repeat sides [
    move len
    turn 360 / sides
  ]
]

// A ring of petals around the pen
define flower petals len [
  repeat petals [
    petal len / 3 len
    turn 360 / petals
  ]
]
`;

// ---------------------------------------------------------------- running
const RAD = Math.PI / 180;
const STOP = Symbol('stop');

function hueColor(h, s = 85, l = 60) {
  return rgbToHex(...hslToRgb(h, Math.max(0, Math.min(100, s)) / 100, Math.max(0, Math.min(100, l)) / 100));
}

/**
 * Run a program. Never throws: problems come back in `errors` (with line numbers),
 * along with whatever was drawn before the problem.
 */
export function runInstructions(src, { library = '', limits = {} } = {}) {
  const L = { ...LIMITS, ...limits };
  const result = { items: [], background: null, errors: [], defined: [], turtle: { x: 0, y: 0, dir: 0 }, steps: 0 };
  let parsed;
  try { parsed = parseInstructions(src, library); } catch (e) {
    if (!(e instanceof InstrError)) throw e;
    result.errors.push({ line: e.line, message: e.message, inLibrary: !!e.inLibrary });
    return result;
  }
  const defs = new Map();
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const t = { x: 0, y: 0, dir: 0, pen: true, color: '#221f4f', fill: 'auto', size: 4, brush: 'ink', smooth: 0, sym: null };
  const stack = [];
  let cur = null, ring = null, points = 0, depth = 0;
  const seq = () => result.items.length;
  const vars = [new Map([['pi', 180]])]; // pi is 180 here because angles are in degrees: turn pi = half a turn

  const symKey = () => (t.sym ? `${t.sym.mode}${t.sym.count || ''}` : '');
  const styleKey = () => `${t.color}|${t.size}|${t.brush}|${t.smooth}|${symKey()}`;
  const addPoint = (x, y) => {
    if (++points > L.points) throw new InstrError(`That's more than ${L.points.toLocaleString('en-US')} points. Try fewer repeats or smaller numbers.`, null);
  };
  const lineTo = (nx, ny) => {
    if (ring) { ring.push([nx, ny]); addPoint(); return; }
    if (!t.pen) { cur = null; return; }
    const key = styleKey();
    if (!cur || cur.key !== key) {
      cur = { kind: 'path', key, seq: seq(), color: t.color, size: t.size, brush: t.brush, smooth: t.smooth, sym: t.sym, points: [[t.x, t.y]] };
      result.items.push(cur);
    }
    cur.points.push([nx, ny]); addPoint();
  };
  const go = (d, draw) => {
    const nx = t.x + Math.sin(t.dir * RAD) * d, ny = t.y + Math.cos(t.dir * RAD) * d;
    if (draw) lineTo(nx, ny); else cur = null;
    t.x = nx; t.y = ny;
  };
  const stamp = (type, props) => {
    if (result.items.length > L.items) throw new InstrError(`That's more than ${L.items.toLocaleString('en-US')} shapes. Try dots for lots of small things, or fewer repeats.`, null);
    const fill = t.fill === 'auto' ? t.color : t.fill;
    result.items.push({ kind: 'shape', type, seq: seq(), x: t.x, y: t.y, dir: t.dir, sym: t.sym, color: t.color, fill, size: t.size, ...props });
    cur = null;
  };
  const dot = (r) => {
    // dots of one color are merged into one closed path, so thousands stay fast
    const fill = t.fill === 'auto' ? t.color : t.fill === 'none' ? t.color : t.fill;
    const key = `dot|${fill}|${symKey()}`;
    let d = result.items.find((it) => it.kind === 'dots' && it.key === key);
    if (!d) { d = { kind: 'dots', key, seq: seq(), fill, sym: t.sym, rings: [] }; result.items.push(d); }
    const n = Math.max(8, Math.min(24, Math.round(r * 1.2)));
    d.rings.push(Array.from({ length: n }, (_, k) => [t.x + Math.cos((k / n) * 2 * Math.PI) * r, t.y + Math.sin((k / n) * 2 * Math.PI) * r]));
    points += n; addPoint();
    cur = null;
  };

  const lookup = (name, line, raw) => {
    for (let s = vars.length - 1; s >= 0; s--) if (vars[s].has(name)) return vars[s].get(name);
    if (defs.has(name)) throw new InstrError(`"${raw}" is an instruction you made, not a number.`, line);
    throw new InstrError(`I don't know a number called "${raw}". Give it a value first with: set ${raw} 10`, line);
  };
  const num = (e) => {
    const v = val(e);
    if (typeof v !== 'number') throw new InstrError('Expected a number here, not a color.', e.line);
    return v;
  };
  const val = (e) => {
    switch (e.k) {
      case 'num': return e.v;
      case 'lit': return e.v;
      case 'var': return lookup(e.name, e.line, e.raw);
      case 'neg': return -num(e.a);
      case 'bin': {
        const a = num(e.a), b = num(e.b);
        switch (e.op) {
          case '+': return a + b; case '-': return a - b; case '*': return a * b;
          case '/': if (b === 0) throw new InstrError("Can't divide by zero.", e.line); return a / b;
          case '%': return b === 0 ? 0 : ((a % b) + b) % b;
          case '<': return +(a < b); case '>': return +(a > b); case '<=': return +(a <= b); case '>=': return +(a >= b);
          case '=': return +(Math.abs(a - b) < 1e-9); case '!=': return +(Math.abs(a - b) >= 1e-9);
          default: return 0;
        }
      }
      case 'fn': {
        const a = e.args.map(num);
        switch (e.name) {
          case 'random': return a.length === 1 ? rand() * a[0] : a[0] + rand() * (a[1] - a[0]);
          case 'sin': return Math.sin(a[0] * RAD); case 'cos': return Math.cos(a[0] * RAD); case 'tan': return Math.tan(a[0] * RAD);
          case 'sqrt': return Math.sqrt(Math.max(0, a[0])); case 'abs': return Math.abs(a[0]);
          case 'round': return Math.round(a[0]); case 'floor': return Math.floor(a[0]);
          case 'min': return Math.min(a[0], a[1]); case 'max': return Math.max(a[0], a[1]);
          case 'hue': return hueColor(a[0], a[1], a[2]);
          case 'gray': { const g = Math.max(0, Math.min(100, a[0])) * 2.55; return rgbToHex(g, g, g); }
          default: return 0;
        }
      }
      default: return 0;
    }
  };
  const colorOf = (e) => { const c = val(e); if (!isHex(c)) throw new InstrError('Expected a color here.', e.line); return c; };

  const exec = (stmts) => {
    for (const s of stmts) {
      if (++result.steps > L.steps) throw new InstrError(`Stopped after ${L.steps.toLocaleString('en-US')} steps. Is something repeating forever?`, s.line);
      run1(s);
    }
  };
  const run1 = (s) => {
    switch (s.k) {
      case 'define': defs.set(s.name, s); if (!result.defined.includes(s.name)) result.defined.push(s.name); return;
      case 'set': vars[vars.length - 1].set(s.name, num(s.value)); return;
      case 'repeat': {
        const n = Math.floor(num(s.count));
        if (n > 100000) throw new InstrError('repeat can go up to 100,000 times.', s.line);
        const scope = new Map(); vars.push(scope);
        try { for (let k = 1; k <= n; k++) { scope.set('i', k); exec(s.body); } } finally { vars.pop(); }
        return;
      }
      case 'if': if (num(s.cond)) exec(s.then); else if (s.other) exec(s.other); return;
      case 'shape': {
        if (ring) throw new InstrError("A shape can't go inside another shape.", s.line);
        ring = [[t.x, t.y]];
        try { exec(s.body); } finally {
          const pts = ring; ring = null;
          if (pts.length >= 3) {
            const fill = t.fill === 'auto' ? t.color : t.fill;
            result.items.push({ kind: 'path', closed: true, key: `shape${seq()}`, seq: seq(), color: t.color, fill, size: t.size, brush: 'ink', smooth: t.smooth, sym: t.sym, points: pts });
          }
          cur = null;
        }
        return;
      }
      case 'call': {
        const d = defs.get(s.name);
        if (!d) throw new InstrError(`"${s.name}" is used before its define has run. Put the define first.`, s.line);
        if (++depth > L.depth) throw new InstrError(`"${s.name}" called itself ${L.depth} levels deep. Add an if that stops it, like: if len < 5 [ stop ]`, s.line);
        const scope = new Map(d.params.map((p, k) => [p, num(s.args[k])]));
        vars.push(scope);
        try { exec(d.body); } catch (e) { if (e !== STOP) throw e; } finally { vars.pop(); depth--; }
        return;
      }
      case 'cmd': return command(s);
      default:
    }
  };
  const command = (s) => {
    const a = s.args;
    switch (s.name) {
      case 'move': return go(num(a[0]), true);
      case 'back': return go(-num(a[0]), true);
      case 'jump': return go(num(a[0]), false);
      case 'turn': t.dir = (t.dir + num(a[0])) % 360; return;
      case 'left': t.dir = (t.dir - num(a[0])) % 360; return;
      case 'heading': t.dir = num(a[0]) % 360; return;
      case 'goto': { const x = num(a[0]), y = num(a[1]); if (t.pen) lineTo(x, y); else cur = null; t.x = x; t.y = y; return; }
      case 'home': t.x = 0; t.y = 0; t.dir = 0; cur = null; return;
      case 'push': if (stack.length > 2000) throw new InstrError('Too many push without pop.', s.line); stack.push({ x: t.x, y: t.y, dir: t.dir }); return;
      case 'pop': { const p = stack.pop(); if (!p) throw new InstrError('pop needs a push before it.', s.line); Object.assign(t, p); cur = null; return; }
      case 'penup': t.pen = false; cur = null; return;
      case 'pendown': t.pen = true; return;
      case 'color': t.color = colorOf(a[0]); return;
      case 'fill': t.fill = colorOf(a[0]); return;
      case 'nofill': t.fill = 'none'; return;
      case 'size': t.size = Math.max(0.5, Math.min(200, num(a[0]))); return;
      case 'brush': t.brush = a[0]; return;
      case 'smooth': t.smooth = Math.max(0, Math.min(1, num(a[0]))); return;
      case 'symmetry': {
        if (a[0] === 'none') t.sym = null;
        else if (a[0] === 'mirror') t.sym = { mode: 'mirror' };
        else t.sym = { mode: a[0], count: Math.max(2, Math.min(48, Math.round(num(a[1])))) };
        cur = null; return;
      }
      case 'background': result.background = a[1] ? { mode: 'linear', c1: colorOf(a[0]), c2: colorOf(a[1]), angle: 180 } : { mode: 'solid', c1: colorOf(a[0]), c2: colorOf(a[0]), angle: 90 }; return;
      case 'circle': { const r = Math.abs(num(a[0])); return stamp('circle', { w: r * 2, h: r * 2 }); }
      case 'oval': return stamp('oval', { w: Math.abs(num(a[0])), h: Math.abs(num(a[1])) });
      case 'box': return stamp('rect', { w: Math.abs(num(a[0])), h: Math.abs(num(a[1])) });
      case 'star': { const r = Math.abs(num(a[0])); return stamp('star', { w: r * 2, h: r * 2, points: Math.max(3, Math.min(24, Math.round(num(a[1])))) }); }
      case 'heart': { const v = Math.abs(num(a[0])); return stamp('heart', { w: v, h: v * 0.9 }); }
      case 'petal': return stamp('petal', { w: Math.abs(num(a[0])), h: Math.abs(num(a[1])) });
      case 'polygon': { const r = Math.abs(num(a[0])); return stamp('polygon', { w: r * 2, h: r * 2, sides: Math.max(3, Math.min(24, Math.round(num(a[1])))) }); }
      case 'dot': return dot(Math.max(0.5, Math.abs(num(a[0]))));
      case 'write': return stamp('text', { text: a[0], h: Math.abs(num(a[1])) });
      case 'stop': throw STOP;
      case 'seed': seed = Math.max(1, Math.floor(Math.abs(num(a[0]))) % 2147483646) || 1; return;
      default:
    }
  };

  try {
    exec(parsed.lib);
    exec(parsed.main);
  } catch (e) {
    if (e === STOP) { /* stop outside a define just ends the program */ }
    else if (e instanceof InstrError) result.errors.push({ line: e.line, message: e.message });
    else throw e;
  }
  result.turtle = { x: t.x, y: t.y, dir: t.dir };
  return result;
}

// ---------------------------------------------------------------- turning results into blocks
const r1 = (v) => Math.round(v * 10) / 10;

function repeatsFor(sym) {
  if (!sym) return [];
  if (sym.mode === 'mirror') return [makeRepeat('mirror')];
  return [makeRepeat('radial', { count: sym.count, kaleido: sym.mode === 'kaleido' })];
}

function strokeFrom(runs, scene, props) {
  const W = scene.width, H = scene.height;
  const pts = runs.flat();
  const xs = pts.map((p) => W / 2 + p[0]), ys = pts.map((p) => H / 2 - p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const norm = [];
  runs.forEach((run, k) => {
    if (k) norm.push(null);
    for (const [x, y] of run) norm.push([Math.round(((W / 2 + x - cx) / w) * 10000) / 10000, Math.round(((H / 2 - y - cy) / h) * 10000) / 10000]);
  });
  return makeBlock('stroke', { x: r1(cx), y: r1(cy), w: r1(w), h: r1(h), points: norm, ...props });
}

/**
 * Turn a run into ordinary blocks: one block per line style (so a tree with hundreds
 * of branches is still only a few parts), shapes as real, editable shape blocks.
 */
export function toBlocks(result, scene, { name = 'Code drawing' } = {}) {
  const W = scene.width, H = scene.height;
  const group = uid();
  const blocks = [];
  const openByKey = new Map();
  const at = (x, y) => ({ x: r1(W / 2 + x), y: r1(H / 2 - y) });
  for (const it of result.items) {
    const reps = repeatsFor(it.sym);
    if (it.kind === 'path' && !it.closed) {
      if (it.points.length < 2) continue;
      let g = openByKey.get(it.key);
      if (!g) { g = { seq: it.seq, it, runs: [] }; openByKey.set(it.key, g); blocks.push(g); }
      g.runs.push(it.points);
    } else if (it.kind === 'path' && it.closed) {
      const outline = it.fill !== 'none' && it.fill !== it.color;
      blocks.push(strokeFrom([it.points], scene, {
        name: `${name}: shape`, closed: true, smooth: it.smooth, brush: 'ink', fillRule: 'nonzero',
        fillMode: it.fill === 'none' ? 'none' : 'solid', fill: it.fill === 'none' ? '#ffffff' : it.fill,
        stroke: it.color, strokeWidth: it.fill === 'none' || outline ? it.size : 0, repeats: reps,
      }));
    } else if (it.kind === 'dots') {
      blocks.push(strokeFrom(it.rings, scene, { name: `${name}: dots`, closed: true, smooth: 0, fillRule: 'nonzero', fillMode: 'solid', fill: it.fill, stroke: it.fill, strokeWidth: 0, repeats: reps }));
    } else if (it.kind === 'shape') {
      const outlined = it.fill !== 'none' && it.fill !== it.color;
      const style = it.fill === 'none'
        ? { fillMode: 'none', stroke: it.color, strokeWidth: it.size }
        : { fillMode: 'solid', fill: it.fill, stroke: it.color, strokeWidth: outlined ? it.size : 0 };
      const base = { ...style, repeats: reps, rot: r1(it.dir) };
      let b;
      if (it.type === 'circle') b = makeBlock('circle', { ...base, ...at(it.x, it.y), w: r1(it.w), h: r1(it.h), name: `${name}: circle` });
      else if (it.type === 'oval') b = makeBlock('circle', { ...base, ...at(it.x, it.y), w: r1(it.w), h: r1(it.h), name: `${name}: oval` });
      else if (it.type === 'rect') b = makeBlock('rect', { ...base, ...at(it.x, it.y), w: r1(it.w), h: r1(it.h), radius: 0, name: `${name}: box` });
      else if (it.type === 'star') b = makeBlock('star', { ...base, ...at(it.x, it.y), w: r1(it.w), h: r1(it.h), points: it.points, inner: 0.45, name: `${name}: star` });
      else if (it.type === 'heart') b = makeBlock('heart', { ...base, ...at(it.x, it.y), w: r1(it.w), h: r1(it.h), name: `${name}: heart` });
      else if (it.type === 'polygon') b = makeBlock('polygon', { ...base, ...at(it.x, it.y), w: r1(it.w), h: r1(it.h), sides: it.sides, name: `${name}: polygon` });
      else if (it.type === 'petal') {
        // grow out from the pen, in the direction it faces
        const cx = it.x + Math.sin(it.dir * RAD) * it.h / 2, cy = it.y + Math.cos(it.dir * RAD) * it.h / 2;
        b = makeBlock('petal', { ...base, ...at(cx, cy), w: r1(it.w), h: r1(it.h), name: `${name}: petal` });
      } else if (it.type === 'text') {
        b = makeBlock('text', { ...base, ...at(it.x, it.y), w: r1(Math.max(40, it.text.length * it.h * 0.62)), h: r1(it.h * 1.3), text: it.text, font: 'clean', fill: it.fill === 'none' ? it.color : it.fill, fillMode: 'solid', strokeWidth: 0, name: `${name}: words` });
      }
      if (b) blocks.push(b);
    }
  }
  const out = blocks.map((g) => {
    if (!g.runs) return g;
    const it = g.it;
    return strokeFrom(g.runs, scene, {
      name: `${name}: lines`, closed: false, smooth: it.smooth, brush: it.brush, stroke: it.color, fill: it.color,
      strokeWidth: it.size, repeats: repeatsFor(it.sym),
    });
  });
  if (out.length > LIMITS.blocks) throw new InstrError(`That makes ${out.length} separate parts. Try dots instead of circles, or use fewer different colors.`, null);
  out.forEach((b) => { b.group = out.length > 1 ? group : ''; b.penMade = true; });
  return out;
}

// ---------------------------------------------------------------- examples
export const EXAMPLES = [
  ['Square spiral', `// Each line is a little longer than the last.
// i counts 1, 2, 3… inside a repeat.
color blue
size 3
repeat 70 [
  move i * 5
  turn 91
]`],
  ['Rainbow burst', `size 5
brush neon
background navy black
repeat 36 [
  color hue(i * 10)
  move 300
  back 300
  turn 10
]`],
  ['Flower (make your own instruction)', `// "define" makes a new instruction.
// This one is called bloom and takes two numbers.
define bloom petals len [
  repeat petals [
    petal len / 3 len
    turn 360 / petals
  ]
  fill gold
  circle len / 4
]

background cream
color #b0306a
size 3
fill pink
bloom 8 240`],
  ['Snowflake (an instruction that uses itself)', `// arm draws a line, then two smaller arms at its tip.
define arm len depth [
  move len
  if depth > 0 [
    turn -45
    arm len * 0.45 depth - 1
    turn 90
    arm len * 0.45 depth - 1
    turn -45
  ]
  back len
]

background navy black
color white
size 5
symmetry spin 6
arm 230 3`],
  ['Tree with leaves', `define branch len [
  if len < 12 [
    fill hue(90 + round(random(0, 3)) * 20, 60, 45)
    dot random(5, 10)
    stop
  ]
  size round(len / 9) + 1
  move len
  push
  turn -24
  branch len * 0.74
  pop
  push
  turn 22
  branch len * 0.7
  pop
]

background sky cream
color brown
brush brush
jump -330
branch 150`],
  ['Spirograph', `size 2
repeat 72 [
  color hue(i * 5)
  repeat 36 [
    move 26
    turn 10
  ]
  turn 5
]`],
  ['Koch snowflake', `define koch len depth [
  if depth = 0 [
    move len
    stop
  ]
  koch len / 3 depth - 1
  turn -60
  koch len / 3 depth - 1
  turn 120
  koch len / 3 depth - 1
  turn -60
  koch len / 3 depth - 1
]

color teal
fill mint
penup
goto -260 150
pendown
heading 90
shape [
  repeat 3 [
    koch 520 4
    turn 120
  ]
]`],
  ['Polka-dot grid', `// Two loops make rows and columns.
penup
repeat 7 [
  set row i
  repeat 7 [
    goto (i - 4) * 100 (row - 4) * 100
    fill hue((i + row) * 25)
    dot 30
  ]
]`],
  ['Heart confetti', `seed 7
penup
repeat 40 [
  goto random(-340, 340) random(-340, 340)
  heading random(-30, 30)
  fill hue(random(320, 380))
  heart random(25, 70)
]`],
  ['Sun with words', `background lemon cream
fill gold
color orange
size 6
symmetry spin 12
jump 170
petal 40 110
home
symmetry none
circle 120
penup
goto 0 -300
fill ink
write "Good morning" 64`],
];
