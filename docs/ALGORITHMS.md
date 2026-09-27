# The algorithms behind artful drawing

Everything artful drawing draws comes from two kinds of algorithm: **repeats**, which
copy a block, and **algorithm blocks**, which grow a shape from a rule. This page
explains each one in plain terms and points to the code. The Learn page
(`learn.html`) covers the same ideas with live pictures.

## Repeats (`js/repeaters.js`)

Each repeat returns a list of copies. A copy is an SVG transform, a hue shift and
an opacity. Repeats stack by composition: repeat B is applied to every copy made
by repeat A, so the copy count multiplies (capped at 3,000).

| Repeat | What it does | Math idea |
|---|---|---|
| Mirror | Adds a copy flipped across a vertical line, a horizontal line, or both | Reflection: `x → 2c − x`. Bilateral symmetry |
| Spin around | `count` copies rotated by `360° / count` around a center; Kaleidoscope mirrors every other copy | Rotation (cyclic group Cₙ); with mirroring, dihedral group Dₙ |
| Step and repeat | Copy *i* is moved by *i*·(dx, dy), turned by *i*·rot and scaled by scale^*i* around the block | Iterating one affine transform; the scale makes a geometric sequence |
| Grid | Rows × columns at fixed spacing; Brick offset shifts odd rows by half a step | A lattice; with offset, the arrangement of bricks and honeycombs |
| Scatter | Copies at seeded pseudo-random offsets, sizes, turns and hues | Pseudo-random number generator (Mulberry32) seeded for repeatability |
| Golden spiral | Copy *i* at angle *i*·137.5° and radius spacing·√*i* (or linear) | Vogel's model of phyllotaxis; the golden angle is 360°/φ² |

### Why the golden angle packs so well

If each seed turns by a rational fraction p/q of a circle, seed *q* lands exactly
on the ray of seed 0, so seeds form *q* straight spokes with gaps between them.
The golden ratio φ ≈ 1.618 is the hardest number to approximate with fractions
(its continued fraction is all 1s), so 360°/φ² ≈ 137.508° avoids every spoke
pattern. Radius √*i* keeps the area per seed constant, giving an even disc.
The visible spiral counts are consecutive Fibonacci numbers because the best
fraction approximations of φ are ratios of Fibonacci numbers.

### Seeded randomness

`rng(seed)` in `js/util.js` is Mulberry32, a tiny, fast generator. The same seed
always yields the same sequence, so a picture never changes on reload and share
links reproduce exactly. Never use `Math.random()` inside drawing code.

## Algorithm blocks (`js/shapes.js`)

| Block | Rule | Notes |
|---|---|---|
| Fractal tree | A branch draws itself, then two to four shorter branches at ±angle from its tip | Recursion depth *d* gives branches^*d* tips. Randomness jitters angle and length from a seed. Wind adds a constant bend |
| Snowflake arm | A main arm with side branches at an angle; each side branch grows its own smaller branches | Spin around × 6 gives the hexagonal symmetry of ice crystals |
| Koch snowflake | Replace every edge with four edges one third as long, with a triangular bump | Perimeter grows by 4/3 each level, forever; area converges. Fractal dimension log 4 / log 3 ≈ 1.26 |
| Sierpinski triangle | Split a triangle into four and keep the three corner ones, recursively | Area shrinks by 3/4 each level. Dimension log 3 / log 2 ≈ 1.585 |
| Seed spiral | The golden-angle packing above, drawn as one block | Angle slider from 120° to 160° to see the packing break |
| Sunburst | Tapered rays evenly spaced around a center | Radial symmetry in a single shape |
| Pattern | Stripes, checks, dots, zigzags, waves or scallops filling a rectangle | Designed to be clipped inside another block |

## Clipping

`clipTo` names another block. `render.js` turns that block (and all of its
repeated copies) into an SVG `clipPath`, and the clipped block only shows inside
it. It is the digital version of a stencil.

## The bloom animation (`js/bloom.js`)

Borrowing an idea from Remotion, an animation is a pure function of time.
`bloomPlan(scene)` assigns each visible block a start time, and each of its copies
a small extra delay, so repeats visibly unfold. `bloomReveal(plan, t)` returns how
grown each copy is at time *t* (0 to 1, with a small overshoot eased by a "back"
curve), and `render.js` scales each copy around its own center by that amount.
Because frames are computed rather than recorded, the studio preview, the landing
page, the Learn playgrounds and the WebM video export all show the same motion.

## Further reading

- Przemysław Prusinkiewicz and Aristid Lindenmayer, *The Algorithmic Beauty of Plants* (free at algorithmicbotany.org)
- Daniel Shiffman, *The Nature of Code* (free at natureofcode.com), chapters on randomness and fractals
- Helmut Vogel, "A better way to construct the sunflower head", *Mathematical Biosciences* 44 (1979)
- Benoit Mandelbrot, *The Fractal Geometry of Nature* (1982)
