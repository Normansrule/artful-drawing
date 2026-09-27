# Contributing to artful drawing

artful drawing has no build step and no dependencies to install. Clone it, start a tiny
web server, and edit the files. Pull requests for new blocks, repeats, starter
pictures, Learn page examples and translations are all welcome.

```bash
git clone https://github.com/<you>/artful-drawing.git
cd artful-drawing
python3 -m http.server 8000     # or: npx serve .   or: npm run serve
# open http://localhost:8000
npm test                        # Node 18 or newer, no npm install needed
```

A server is needed because the pages use JavaScript modules, which browsers refuse
to load from `file://` addresses.

## How a picture is stored

A picture is plain JavaScript Object Notation (JSON), defined in `js/model.js`:

```json
{
  "version": 1, "width": 800, "height": 800,
  "background": { "mode": "linear", "c1": "#dff3ff", "c2": "#fde2f3", "angle": 180 },
  "blocks": [
    { "id": "a1", "type": "wing", "name": "Wings", "x": 548, "y": 395, "w": 300, "h": 340,
      "rot": -6, "fill": "#ff7eb6", "fill2": "#7b61ff", "fillMode": "linear",
      "stroke": "#221f4f", "strokeWidth": 7, "repeats": [{ "mode": "mirror", "axis": "v", "around": "canvas" }] }
  ]
}
```

Blocks draw in order, so later blocks sit on top. `js/render.js` turns this into
Scalable Vector Graphics (SVG) with pure functions, which is why the same code runs
the studio, the thumbnails, the Learn page, the video export and the Node tests.

## Add a block

Add an entry to `SHAPES` in `js/shapes.js`:

```js
leaf: {
  label: 'Leaf', category: 'Shapes',
  blurb: 'A pointed oval with a center vein.',
  defaults: { w: 120, h: 220, fill: '#58b368', vein: true },
  params: [toggle('vein', 'Center vein')],
  parts: (p) => {
    const rx = p.w / 2, ry = p.h / 2;
    const parts = [{ d: `M0 ${-ry}Q${rx * 1.3} 0 0 ${ry}Q${-rx * 1.3} 0 0 ${-ry}Z` }];
    if (p.vein) parts.push({ d: `M0 ${-ry * 0.8}L0 ${ry * 0.8}`, kind: 'line', sw: 0.5, color: '#2f7a3e' });
    return parts;
  },
},
```

Rules of thumb:

- Draw centered on (0, 0), using `p.w` and `p.h` for size. Position, rotation, flip,
  repeats and color are applied for you.
- `parts` returns a list of `{ d, kind, sw, color, opacity, noStroke }`. Fill parts
  use the block's fill; `kind: 'line'` parts use its outline color and width (`sw`
  multiplies the width); `color` overrides both.
- Use the helpers `range`, `select`, `toggle` and `seed` for settings. The inspector
  builds its controls from them automatically.
- Randomness must come from `rng(seed)` in `js/util.js`, never `Math.random()`, so the
  same file always draws the same picture and share links stay exact.
- Round coordinates with `r2` to keep files and share links short.
- Geometry is cached by `render.js`, so expensive shapes (like the fractal tree) are
  only recomputed when their own settings change.

The shelf tile, inspector controls, tests and help text all pick up the new block.
Run `npm test`: it draws every block at the minimum and maximum of every slider.

## Add a repeat

Add an entry to `REPEATERS` in `js/repeaters.js`. A repeater returns a list of copies,
each `{ t, hue, o }`: an SVG transform string, a color shift in degrees, and an opacity.

```js
wave: {
  label: 'Wave row',
  blurb: 'Copies in a row that bob up and down.',
  defaults: { count: 8, dx: 70, amp: 40, hueStep: 0 },
  params: [
    { key: 'count', label: 'Copies', type: 'range', min: 1, max: 40, step: 1 },
    { key: 'dx', label: 'Spacing', type: 'range', min: 5, max: 200, step: 1 },
    { key: 'amp', label: 'Wave height', type: 'range', min: 0, max: 200, step: 1 },
    hueStep,
  ],
  copies(b, r) {
    return Array.from({ length: r.count }, (_, i) => ({
      t: `translate(${r2(i * r.dx)} ${r2(Math.sin(i * 0.9) * r.amp)})`,
      hue: i * r.hueStep, o: 1,
    }));
  },
},
```

`expandRepeats` stacks repeaters for you: each one is applied to every copy made by
the ones before it, capped at `MAX_COPIES` (3,000).

## Add a starter picture

Add an entry to `TEMPLATES` in `js/templates.js`. Build it only from blocks and
repeats (that is the point: opening a picture should teach how it was made), give
every block a friendly `name`, and keep it under about 20 blocks. It automatically
appears in the studio, on the landing page marquee and at `studio.html#template=<id>`.

## Add a Learn page example

- **Static example:** add a function to `DEMOS` in `js/learn.js`, then place
  `<figure data-demo="your-name" data-caption="..."></figure>` in `learn.html`.
- **Playground with sliders:** add an entry to `PLAYGROUNDS` with `controls`, a
  `build(values)` function and a `readout(values)` sentence, then place
  `<div class="playground" data-playground="your-name"></div>`.

## Style guide

- Plain language. Write for a curious 12-year-old and a professional illustrator at
  the same time. Spell out acronyms the first time, with the acronym in parentheses.
- Everything must work with a keyboard alone. New controls need visible focus,
  labels, and a key if they are used often.
- Motion is decoration. Check `prefers-reduced-motion` (see `js/fx.js`) and make sure
  the page is complete without the animation.
- No build tools, no frameworks, no runtime dependencies beyond the vendored GreenSock
  Animation Platform (GSAP) files used only on the landing page.
