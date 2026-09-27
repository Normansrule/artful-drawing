# Design notes

artful drawing has two moods that share one set of tokens.

- **Studio, Learn and References** use a *risograph sticker sheet* look: periwinkle
  paper, deep indigo ink, fluorescent pink and sunshine yellow. The block tiles
  with their misregistered pink shadow are the one loud element; everything else
  stays quiet so the drawing is the star.
- **The landing page** is a *night studio*: a deep indigo darkroom with live ink
  swirling behind the headline, glass panels, and heads-up-display (HUD) frames
  around pictures that draw themselves.

## Tokens (`css/style.css`)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#eef0fa` | Page background |
| `--ink` | `#221f4f` | Text, outlines, primary buttons |
| `--ink-2` | `#57537f` | Secondary text |
| `--pink` | `#ff4f87` | Focus rings, sticker shadows, accents |
| `--sun` | `#ffce3a` | Highlights, landing call-to-action buttons |
| `--teal` | `#13877e` | Labels, "live" indicators, guides |
| `--night` | `#0d0b24` | Landing page background (`css/home.css`) |

Type: **Bricolage Grotesque** for display, **Atkinson Hyperlegible** for body text
(designed by the Braille Institute for low-vision readers).

## Motion principles

1. **Motion explains.** The bloom animation shows *how* a picture is built: blocks
   arrive in layer order and repeated copies unfold one after another.
2. **Motion is optional.** With `prefers-reduced-motion: reduce`, every decorative
   animation stops, the ink simulation is not started, and every page is complete.
3. **Motion is cheap.** Looping previews render only while on screen
   (`IntersectionObserver`) and at 24 frames per second; the fluid pauses when the
   tab is hidden.
4. **One source of truth.** Every animated picture comes from the same renderer
   and the same `bloomReveal` timeline.

## Where the ideas came from

These projects shaped the visual layer. artful drawing does not bundle any of them
except GreenSock Animation Platform (GSAP); the rest are re-imagined in plain
JavaScript and Cascading Style Sheets (CSS) to keep the site build-free.

| Project | What artful drawing borrowed | Where |
|---|---|---|
| [React Bits](https://github.com/DavidHDev/react-bits) | Blur-in split text, animated gradient text, spotlight cards, tilt | `js/fx.js`, `css/effects.css` |
| [Magic UI](https://github.com/magicuidesign/magicui) | Shimmer button, border beam, dot pattern, marquee, number ticker, bento grid | `css/effects.css`, `css/home.css` |
| [Animate UI](https://animate-ui.com/) | Springy micro-interactions on tiles and cards, magnetic buttons | `css/effects.css`, `js/fx.js` |
| [Motion Primitives](https://github.com/ibelick/motion-primitives) | Small composable motion helpers (in-view reveal, scroll progress) | `js/fx.js` |
| [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) | Stable-fluids ink behind the landing headline (adapted, MIT) | `js/fluid.js` |
| [Bruno Simon's folio 2019](https://github.com/brunosimon/folio-2019) | Playfulness: pictures you poke, keycaps you press | Landing keyboard demo |
| [GSAP](https://github.com/greensock/GSAP) | ScrollTrigger scrubbing for the butterfly story, SplitText headline | `vendor/gsap/`, `js/home.js` |
| [Remotion](https://github.com/remotion-dev/remotion) | Animation as a pure function of time; exporting it as video | `js/bloom.js` |
| [LLM Visualization](https://github.com/bbycroft/llm-viz) | Explaining a system by watching it assemble step by step | Landing scroll story |
| [Transformer Explainer](https://github.com/poloclub/transformer-explainer) | Sliders beside a live picture with a plain-language readout | Learn page playgrounds |
| [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) | HUD corner brackets, scan line, "live" readouts | `.hud` in `css/home.css` |
| [World Monitor](https://github.com/koala73/worldmonitor) | Dense status telemetry | Studio render monitor (blocks, shapes, milliseconds, sparkline) |

## Version 1.2: the Night theme and toys

- **Night theme** (`css/night.css`, default everywhere): the paper tokens are
  re-lit as glass over a drifting aurora. The canvas floats on a conic color halo;
  headings, selected layers and primary buttons use a pink-to-violet gradient.
  `js/theme.js` sets the theme before first paint (no flash) and remembers the choice.
- **Symmetry painter** (`js/toys.js`): strokes are drawn in every rotated and mirrored
  position in two additive passes (a wide soft glow and a bright core), with the hue
  walking around the color wheel and optional fading trails. An invisible hand
  draws a rose curve until a visitor takes over. Arrow keys paint too.
- **3D ring gallery**: pure CSS 3D (`preserve-3d`, `rotateY`, `translateZ`), with a
  reflection underneath, drag-to-spin inertia, and keyboard focus that turns the
  ring to the focused picture.
- **Click sparks and floating stickers**: small canvas and CSS touches that make the
  landing page respond to every click and pointer movement.
