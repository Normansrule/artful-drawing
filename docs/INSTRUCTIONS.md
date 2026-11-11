# Drawing instructions (the Code tab)

artful drawing has a small drawing language in the spirit of [Logo](https://el.media.mit.edu/logo-foundation/what_is_logo/logo_programming.html) turtle graphics. A pen starts in the middle of the page, facing up. Instructions move it, turn it and change its color, and it draws as it goes. Whatever it draws becomes ordinary blocks: you can still drag, recolor, mirror and undo them.

The big idea is **`define`**: people make their own instructions, save them to a personal library ("My instructions"), and from then on use them like built-in ones.

```text
// a star: five lines, turning 144° each time
size 6
repeat 5 [ move 300  turn 144 ]
```

- Try it: open the studio, click the **Code** tab, pick an example.
- Read the friendly guide with live examples: [manual.html#code](https://normansrule.github.io/artful-drawing/manual.html#code).
- The full instruction list is generated from `BUILTINS` in [`js/instructions.js`](../js/instructions.js), so the manual and the editor's reference can never fall out of date.

## The language in one page

| Idea | Syntax | Notes |
|---|---|---|
| Move and draw | `move 100`, `back 50` | Distance in canvas pixels. |
| Move without drawing | `jump 100`, `penup` / `pendown` | |
| Turn | `turn 90` (clockwise), `left 45` | Degrees. `heading 0` faces up, `90` right. |
| Go to a spot | `goto x y`, `home` | 0 0 is the middle; y grows **upward**. |
| Remember and return | `push`, `pop` | A stack of positions; perfect for branches. |
| Line style | `color pink`, `size 6`, `brush neon`, `smooth 0.5` | Brushes: ink, brush, marker, pencil, neon, dots. |
| Shapes at the pen | `circle r`, `oval w h`, `box w h`, `star r points`, `heart s`, `petal w len`, `polygon r sides`, `dot r`, `write "text" size` | Real shape blocks, turned the way the pen faces. |
| Filled outline | `shape [ … ]` | Everything drawn inside becomes one filled shape. |
| Fill | `fill gold`, `nofill` | If fill differs from line color, shapes get an outline. |
| Symmetry | `symmetry mirror`, `symmetry spin 6`, `symmetry kaleido 8`, `symmetry none` | Becomes a Mirror or Spin repeat on the blocks. |
| Page | `background navy`, `background sky cream` | Two colors blend top to bottom. |
| Loop | `repeat 10 [ … ]` | Inside, `i` counts 1, 2, 3… |
| Choice | `if len < 5 [ … ] else [ … ]` | `< > <= >= = !=`; true is 1. |
| Numbers with names | `set gap 40` | Visible inside the block where it is set and in everything inside it. |
| Your own instruction | `define name a b [ … ]` | Inputs are numbers; can call itself; `stop` returns early. |
| Randomness | `random(a, b)`, `seed 7` | The same seed always draws the same picture. |
| Math | `+ - * / %`, `( )`, `sin cos tan sqrt abs round floor min max` | Angles in degrees; `pi` is 180. |
| Colors | names (`pink`, `navy`…), `#ff4f87`, `hue(deg, sat, light)`, `gray(0…100)` | |
| Comments | `// anything` | |

Aliases for people coming from Logo or Python's turtle: `forward`/`fd`, `rt`/`right`, `lt`, `bk`, `pu`, `pd`, `to` (for `define`), `pencolor`, `pensize`, `setpos`.

### The one tricky rule: minus signs

Like Logo, a minus sign touching a number but with a space before it starts a **new** number, so `goto 0 -250` means x = 0, y = −250. To subtract, put spaces on both sides (`len - 1`) or join it to a name (`len-1`). Dashes between letters are part of a name (`petal-ring`).

## Making your own instructions

```text
define bloom petals len [
  repeat petals [
    petal len / 3 len
    turn 360 / petals
  ]
  fill gold
  circle len / 4
]

fill pink
bloom 8 240
```

- An instruction may be used above where it is written; the parser scans all `define`s first so it knows how many inputs each one takes.
- Recursion works and is limited to 80 levels. A forgotten `stop` gives a clear message instead of a frozen page.
- **Save to My instructions** copies every `define` in the editor (with the comment lines right above it) into the library. A define with the same name is replaced. The library is plain text in `localStorage` (`artful-drawing:my-instructions:v1`) and runs before every program, so its instructions are available everywhere. It can be edited, downloaded and reset.

## Safety limits

| Limit | Value |
|---|---|
| Steps (instructions run) | 250,000 |
| Points drawn | 120,000 |
| Shapes placed | 6,000 |
| Self-call depth | 80 |
| One `repeat` | 100,000 times |
| Blocks produced | 400 |

When a limit is reached the program stops, the preview shows everything drawn up to that point, and the message says what happened.

## How it works (for contributors)

`js/instructions.js` is a small, dependency-free interpreter, about 850 lines, with no `eval`:

1. **Tokenizer**: a single regular expression turns text into tokens. Each token remembers its line (for error messages), its character position (to cut `define`s out for the library) and whether a space came before it (for the minus-sign rule).
2. **Pre-scan**: every `define name a b [` is found first, so calls know how many inputs to read, even above the definition.
3. **Recursive-descent parser**: builds a tree of statements (`repeat`, `if`, `define`, `set`, `shape`, calls and built-ins) and expressions with the usual precedence (comparison < sum < product < unary). It raises `InstrError` with a line number and a plain-language message, and suggests the closest known word using edit distance ("Did you mean turn?").
4. **Interpreter**: walks the tree with a turtle state (`x, y, dir, pen, color, fill, size, brush, smooth, sym`), a scope stack for `i`, inputs and `set`, and a deterministic random generator (Park–Miller) seeded by `seed`. It never throws: errors come back in `result.errors` next to whatever was drawn.
5. **Output**: drawing produces `items`, either paths (polylines with a style key) or shapes (stamped at the pen). `toBlocks(result, scene)` turns them into normal scene blocks:
   - All lines with the same style become **one** `stroke` block. Separate runs are joined with `null` pen-lift markers, which the stroke renderer (`strokeRun` in `js/shapes.js`) draws as separate sub-paths. A tree with 500 branches is a handful of blocks, not 500.
   - Dots of one color merge into one filled stroke block, so thousands of dots stay fast.
   - Shapes become real `circle`, `rect`, `star`, `heart`, `petal`, `polygon` and `text` blocks, so the inspector works on them.
   - `symmetry` becomes `mirror` / `radial` repeats around the canvas center.
   - Everything from one run shares a group id and is marked `penMade`, so the eraser treats it like pen work.

Tests live in [`tests/instructions.test.js`](../tests/instructions.test.js): turtle geometry, the minus rule, recursion, error messages with line numbers, runaway programs, seeds, block merging, shapes, symmetry, the library helpers, and every example in the studio, the manual and the home page.

### Adding a built-in instruction

1. Add an entry to `BUILTINS` (name, aliases, argument kinds, group, help, example). The editor reference, the manual and the "every example runs" test pick it up automatically.
2. Handle it in the `command()` switch in `runInstructions`.
3. If it places a new kind of shape, map it in `toBlocks`.
4. Run `npm test`.
