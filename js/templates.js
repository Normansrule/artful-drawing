// Starter pictures. Each one is built only from blocks and repeats,
// so opening a template is also a lesson: click any part to see how it's made.

import { makeBlock as B, blankScene } from './model.js';

const R = (mode, o = {}) => ({ mode, ...o });
const scene = (background, blocks) => ({ ...blankScene(), background, blocks });
const linear = (c1, c2, angle = 180) => ({ mode: 'linear', c1, c2, angle });
const radial = (c1, c2) => ({ mode: 'radial', c1, c2, angle: 90 });
const solid = (c1) => ({ mode: 'solid', c1, c2: c1, angle: 90 });

export const TEMPLATES = [
  {
    id: 'butterfly', name: 'Butterfly',
    blurb: 'One wing, mirrored. Spots use Step and repeat, then Mirror.',
    build: () => scene(linear('#dff3ff', '#fde2f3'), [
      B('star', { name: 'Sparkles', x: 400, y: 400, w: 26, h: 26, fill: '#ffffff', opacity: 0.9, points: 4, inner: 0.3, repeats: [R('scatter', { count: 26, spreadX: 380, spreadY: 380, seed: 11, sizeVar: 0.6, rotVar: 20 })] }),
      B('wing', { name: 'Wings', x: 548, y: 395, w: 300, h: 340, rot: -6, fillMode: 'linear', fill: '#ff7eb6', fill2: '#7b61ff', gradAngle: 50, stroke: '#221f4f', strokeWidth: 7, repeats: [R('mirror')] }),
      B('circle', { name: 'Upper spots', x: 560, y: 300, w: 64, h: 64, fill: '#ffe066', repeats: [R('step', { count: 3, dx: 52, dy: -22, scale: 0.72 }), R('mirror')] }),
      B('circle', { name: 'Lower spots', x: 545, y: 505, w: 58, h: 58, fill: '#fff3b0', repeats: [R('mirror')] }),
      B('circle', { name: 'Body', x: 400, y: 420, w: 42, h: 240, fill: '#221f4f' }),
      B('curve', { name: 'Antennae', x: 437, y: 215, w: 64, h: 96, bend: 0.35, stroke: '#221f4f', strokeWidth: 6, repeats: [R('mirror')] }),
      B('circle', { name: 'Antenna tips', x: 470, y: 166, w: 22, h: 22, fill: '#221f4f', repeats: [R('mirror')] }),
      B('circle', { name: 'Head', x: 400, y: 285, w: 70, h: 66, fill: '#221f4f' }),
      B('face', { name: 'Face', x: 400, y: 286, w: 46, h: 30, fill: '#ffffff', stroke: '#ffffff', strokeWidth: 2.5 }),
    ]),
  },
  {
    id: 'ghost', name: 'Cute ghost',
    blurb: 'A Ghost block, a Face, a Moon and scattered stars.',
    build: () => scene(radial('#4a3a86', '#161233'), [
      B('star', { name: 'Stars', x: 400, y: 380, w: 20, h: 20, fill: '#fff6c9', points: 4, inner: 0.35, repeats: [R('scatter', { count: 40, spreadX: 390, spreadY: 380, seed: 21, sizeVar: 0.7, rotVar: 15 })] }),
      B('moon', { name: 'Moon', x: 640, y: 150, w: 130, h: 130, rot: -25, fill: '#fff1a8', thickness: 0.45 }),
      B('circle', { name: 'Shadow', x: 400, y: 680, w: 230, h: 30, fill: '#000000', opacity: 0.3 }),
      B('drop', { name: 'Arms', x: 262, y: 455, w: 70, h: 110, rot: 110, fill: '#ece9ff', repeats: [R('mirror')] }),
      B('ghost', { name: 'Ghost', x: 400, y: 430, w: 290, h: 380, fillMode: 'radial', fill: '#ffffff', fill2: '#dcd6ff', waves: 5, wiggle: 0.18 }),
      B('face', { name: 'Face', x: 400, y: 380, w: 150, h: 100, expression: 'happy' }),
      B('circle', { name: 'Tiny shadow', x: 655, y: 640, w: 70, h: 14, fill: '#000000', opacity: 0.3 }),
      B('ghost', { name: 'Tiny friend', x: 655, y: 560, w: 90, h: 115, rot: 8, fill: '#ffffff', waves: 3 }),
      B('face', { name: 'Tiny face', x: 657, y: 545, w: 52, h: 34, rot: 8, expression: 'joy', strokeWidth: 3 }),
    ]),
  },
  {
    id: 'christmas-tree', name: 'Christmas tree',
    blurb: 'One triangle stepped upward four times, with a garland clipped inside it.',
    build: () => {
      const tiers = B('triangle', { name: 'Tree tiers', x: 400, y: 530, w: 380, h: 200, fillMode: 'linear', fill: '#35c275', fill2: '#157347', repeats: [R('step', { count: 4, dy: -92, scale: 0.76 })] });
      return scene(linear('#0f2547', '#285a8c'), [
        B('circle', { name: 'Snowfall', x: 400, y: 380, w: 12, h: 12, fill: '#ffffff', opacity: 0.85, repeats: [R('scatter', { count: 70, spreadX: 400, spreadY: 400, seed: 5, sizeVar: 0.7, rotVar: 0 })] }),
        B('rays', { name: 'Glow', x: 400, y: 200, w: 260, h: 260, fill: '#fff3b0', opacity: 0.35, count: 20, inner: 0.15, thickness: 0.5 }),
        B('circle', { name: 'Snowy ground', x: 400, y: 800, w: 1000, h: 250, fill: '#f1f6ff' }),
        B('rect', { name: 'Trunk', x: 400, y: 650, w: 70, h: 90, fill: '#7a4b2a', radius: 0.15 }),
        tiers,
        B('wave', { name: 'Garland', x: 400, y: 560, w: 440, h: 36, rot: -10, cycles: 3, stroke: '#ffe066', strokeWidth: 6, clipTo: tiers.id, repeats: [R('step', { count: 4, dy: -92, scale: 0.76 })] }),
        B('circle', { name: 'Ornaments', x: 292, y: 606, w: 28, h: 28, fill: '#ff4d6d', repeats: [R('step', { count: 4, dx: 29, dy: -92, scale: 0.9, hueStep: 35 }), R('mirror')] }),
        B('circle', { name: 'Center baubles', x: 400, y: 585, w: 24, h: 24, fill: '#5ce1e6', repeats: [R('step', { count: 3, dy: -92, scale: 0.9, hueStep: 60 })] }),
        B('star', { name: 'Star', x: 400, y: 196, w: 96, h: 96, fill: '#ffd23f', stroke: '#fff3b0', strokeWidth: 4, inner: 0.48 }),
        B('rect', { name: 'Gift', x: 270, y: 690, w: 100, h: 80, fill: '#ff5c8a', radius: 0.1 }),
        B('rect', { name: 'Gift ribbon', x: 270, y: 690, w: 16, h: 80, fill: '#ffe066', radius: 0 }),
        B('rect', { name: 'Gift 2', x: 540, y: 700, w: 80, h: 64, fill: '#7b61ff', radius: 0.1 }),
        B('rect', { name: 'Gift 2 ribbon', x: 540, y: 700, w: 80, h: 14, fill: '#5ce1e6', radius: 0 }),
      ]);
    },
  },
  {
    id: 'snowflake', name: 'Snowflake',
    blurb: 'One branching arm spun six times. Real ice grows in sixes.',
    build: () => scene(radial('#3d7cc9', '#10275a'), [
      B('crystal', { name: 'Little flakes', x: 400, y: 400, w: 60, h: 90, strokeWidth: 3, depth: 2, sides: 2, tip: 0, opacity: 0.45, repeats: [R('radial', { count: 6, around: 'self' }), R('scatter', { count: 16, spreadX: 380, spreadY: 380, seed: 9, sizeVar: 0.5, rotVar: 30 })] }),
      B('crystal', { name: 'Arms', x: 400, y: 400, w: 250, h: 620, strokeWidth: 12, depth: 3, sides: 3, angle: 60, ratio: 0.5, repeats: [R('radial', { count: 6 })] }),
      B('polygon', { name: 'Diamonds', x: 400, y: 330, w: 28, h: 50, sides: 4, fill: '#dbeafe', repeats: [R('radial', { count: 6, offset: 30 })] }),
      B('polygon', { name: 'Center', x: 400, y: 400, w: 96, h: 96, sides: 6, rot: 30, fill: '#ffffff' }),
      B('polygon', { name: 'Center hole', x: 400, y: 400, w: 44, h: 44, sides: 6, rot: 30, fill: '#93c5fd' }),
    ]),
  },
  {
    id: 'easter-eggs', name: 'Easter eggs',
    blurb: 'Pattern blocks clipped inside Egg blocks, like wax-resist dyeing.',
    build: () => {
      const egg = B('egg', { name: 'Big egg', x: 400, y: 400, w: 320, h: 420, fill: '#ffc8dd' });
      const egg2 = B('egg', { name: 'Green egg', x: 170, y: 600, w: 150, h: 195, rot: -12, fill: '#caffbf' });
      const egg3 = B('egg', { name: 'Blue egg', x: 640, y: 605, w: 160, h: 205, rot: 10, fill: '#bde0fe' });
      return scene(linear('#fff4d6', '#e3f6e8'), [
        B('circle', { name: 'Hill', x: 400, y: 820, w: 1100, h: 300, fill: '#8fd694' }),
        B('petal', { name: 'Grass', x: -10, y: 690, w: 20, h: 80, rot: 8, fill: '#57c785', repeats: [R('step', { count: 30, dx: 29, dy: 0, scale: 1, rot: 0 })] }),
        egg,
        B('pattern', { name: 'Bands', x: 400, y: 400, w: 340, h: 440, style: 'stripes', rows: 6, thickness: 0.38, fill: '#a2d2ff', clipTo: egg.id }),
        B('pattern', { name: 'Zigzags', x: 400, y: 437, w: 340, h: 440, style: 'zigzag', rows: 6, thickness: 0.35, stroke: '#ff5c8a', strokeWidth: 7, clipTo: egg.id }),
        B('star', { name: 'Flower dots', x: 330, y: 363, w: 26, h: 26, points: 6, inner: 0.5, fill: '#ffe066', clipTo: egg.id, repeats: [R('grid', { cols: 3, rows: 1, gapX: 70 })] }),
        B('circle', { name: 'Shine', x: 318, y: 290, w: 50, h: 110, rot: 25, fill: '#ffffff', opacity: 0.4, clipTo: egg.id }),
        egg2,
        B('pattern', { name: 'Green dots', x: 170, y: 600, w: 180, h: 210, rot: -12, style: 'dots', rows: 5, thickness: 0.5, fill: '#2fae66', clipTo: egg2.id }),
        egg3,
        B('pattern', { name: 'Blue waves', x: 640, y: 605, w: 190, h: 220, rot: 10, style: 'waves', rows: 5, thickness: 0.5, stroke: '#7b61ff', strokeWidth: 6, clipTo: egg3.id }),
      ]);
    },
  },
  {
    id: 'flower', name: 'Flower',
    blurb: 'Two rings of petals spun around a custom point, with a seed spiral center.',
    build: () => scene(linear('#e7f6ff', '#fef6e4'), [
      B('rect', { name: 'Stem', x: 400, y: 580, w: 18, h: 420, fill: '#3fae6a', radius: 1 }),
      B('petal', { name: 'Leaves', x: 460, y: 590, w: 70, h: 150, rot: 55, fill: '#57c785', fullness: 1.1, repeats: [R('mirror')] }),
      B('petal', { name: 'Outer petals', x: 400, y: 225, w: 120, h: 190, fillMode: 'linear', fill: '#ff8fab', fill2: '#ffc2d4', gradAngle: 0, repeats: [R('radial', { count: 8, around: 'point', cx: 400, cy: 320 })] }),
      B('petal', { name: 'Inner petals', x: 400, y: 255, w: 80, h: 130, fill: '#ffb3c6', repeats: [R('radial', { count: 8, offset: 22.5, around: 'point', cx: 400, cy: 320 })] }),
      B('circle', { name: 'Center', x: 400, y: 320, w: 120, h: 120, fill: '#ffd23f' }),
      B('sunflower', { name: 'Seeds', x: 400, y: 320, w: 100, h: 100, count: 110, fill: '#e09f3e' }),
      B('circle', { name: 'Ground', x: 400, y: 830, w: 1000, h: 200, fill: '#a7e08b' }),
    ]),
  },
  {
    id: 'sunny-day', name: 'Sunny day',
    blurb: 'A Sunburst behind a circle, clouds and a smile.',
    build: () => scene(linear('#8fd3ff', '#e0f4ff'), [
      B('rays', { name: 'Rays', x: 400, y: 360, w: 520, h: 520, count: 18, inner: 0.45, thickness: 0.55, fill: '#ffd23f', opacity: 0.85 }),
      B('circle', { name: 'Sun', x: 400, y: 360, w: 260, h: 260, fillMode: 'radial', fill: '#fff3b0', fill2: '#ffb703' }),
      B('face', { name: 'Face', x: 400, y: 370, w: 170, h: 110, expression: 'joy' }),
      B('cloud', { name: 'Cloud', x: 170, y: 610, w: 260, h: 130, puffs: 4 }),
      B('cloud', { name: 'Cloud 2', x: 620, y: 660, w: 220, h: 110, puffs: 3 }),
      B('arc', { name: 'Birds', x: 600, y: 170, w: 40, h: 40, sweep: 120, strokeWidth: 4, stroke: '#35527a', repeats: [R('step', { count: 3, dx: 50, dy: 25, scale: 0.8 }), R('mirror', { around: 'self' })] }),
    ]),
  },
  {
    id: 'autumn-tree', name: 'Autumn tree',
    blurb: 'A Fractal tree generator with falling leaves scattered below.',
    build: () => scene(linear('#ffe8d1', '#ffc8b4'), [
      B('circle', { name: 'Low sun', x: 620, y: 230, w: 170, h: 170, fill: '#fff3b0', opacity: 0.8 }),
      B('circle', { name: 'Ground', x: 400, y: 820, w: 1100, h: 240, fill: '#c9844b' }),
      B('tree', { name: 'Tree', x: 400, y: 400, w: 520, h: 600, depth: 9, angle: 24, ratio: 0.74, randomness: 0.35, leaf: 9, seed: 12, stroke: '#4a2d1f', strokeWidth: 26, fill: '#ff8c42' }),
      B('petal', { name: 'Falling leaves', x: 400, y: 560, w: 16, h: 28, fill: '#e76f51', repeats: [R('scatter', { count: 30, spreadX: 380, spreadY: 140, seed: 3, sizeVar: 0.5, rotVar: 180, hueVar: 25 })] }),
    ]),
  },
  {
    id: 'mandala', name: 'Mandala',
    blurb: 'Layer after layer spun around the center. Try changing the copy counts.',
    build: () => scene(radial('#2d2470', '#120e33'), [
      B('arc', { name: 'Outer ring', x: 400, y: 400, w: 640, h: 640, sweep: 360, stroke: '#8e8ab5', strokeWidth: 3 }),
      B('circle', { name: 'Bead ring', x: 400, y: 95, w: 24, h: 24, fill: '#ff5c8a', repeats: [R('radial', { count: 24, hueStep: 15 })] }),
      B('petal', { name: 'Big petals', x: 400, y: 205, w: 100, h: 240, fillMode: 'linear', fill: '#7b61ff', fill2: '#ff70a6', gradAngle: 0, opacity: 0.95, repeats: [R('radial', { count: 12 })] }),
      B('petal', { name: 'Gold petals', x: 400, y: 260, w: 60, h: 150, fill: '#ffd23f', repeats: [R('radial', { count: 12, offset: 15 })] }),
      B('drop', { name: 'Drops', x: 400, y: 318, w: 36, h: 60, fill: '#5ce1e6', repeats: [R('radial', { count: 12, offset: 15 })] }),
      B('circle', { name: 'Middle', x: 400, y: 400, w: 130, h: 130, fill: '#fff3b0' }),
      B('star', { name: 'Middle star', x: 400, y: 400, w: 110, h: 110, points: 8, inner: 0.55, fill: '#ff5c8a' }),
      B('circle', { name: 'Middle dot', x: 400, y: 400, w: 34, h: 34, fill: '#2d2470' }),
    ]),
  },
  {
    id: 'pumpkin', name: 'Pumpkin',
    blurb: 'Overlapping ovals mirrored into lobes, with a stem and a face.',
    build: () => scene(linear('#2b1d4e', '#4f2f6b'), [
      B('star', { name: 'Stars', x: 400, y: 300, w: 16, h: 16, fill: '#fff6c9', points: 4, inner: 0.35, repeats: [R('scatter', { count: 30, spreadX: 390, spreadY: 280, seed: 44, sizeVar: 0.6, rotVar: 10 })] }),
      B('circle', { name: 'Ground', x: 400, y: 820, w: 1000, h: 260, fill: '#3b2a5c' }),
      B('rect', { name: 'Stem', x: 408, y: 300, w: 34, h: 80, rot: 10, fill: '#5b8c3a', radius: 0.4 }),
      B('curve', { name: 'Vine', x: 460, y: 300, w: 70, h: 40, bend: -0.8, stroke: '#5b8c3a', strokeWidth: 6 }),
      B('circle', { name: 'Side lobes', x: 300, y: 480, w: 210, h: 270, fillMode: 'linear', fill: '#ff9a3c', fill2: '#e85d04', gradAngle: 180, repeats: [R('mirror')] }),
      B('circle', { name: 'Middle lobe', x: 400, y: 475, w: 250, h: 290, fillMode: 'linear', fill: '#ffae52', fill2: '#f48c06', gradAngle: 180 }),
      B('face', { name: 'Face', x: 400, y: 470, w: 180, h: 120, expression: 'wink' }),
      B('petal', { name: 'Leaf', x: 345, y: 330, w: 50, h: 100, rot: -60, fill: '#6fb342' }),
    ]),
  },
  {
    id: 'golden-spiral', name: 'Golden spiral',
    blurb: 'One small circle, 400 copies, each turned 137.5° from the last.',
    build: () => scene(solid('#130f2e'), [
      B('circle', { name: 'Seeds', x: 400, y: 400, w: 16, h: 16, fill: '#ff5c8a', repeats: [R('spiral', { count: 400, angle: 137.5, spacing: 17.5, scaleStep: 1.002, hueStep: 0.9 })] }),
    ]),
  },
  {
    id: 'hearts', name: 'Hearts',
    blurb: 'A big heart inside a spinning ring of small hearts, colored with Color shift.',
    build: () => scene(linear('#ffe3ec', '#ffd1dc'), [
      B('heart', { name: 'Heart ring', x: 400, y: 130, w: 60, h: 54, fill: '#ff4f87', repeats: [R('radial', { count: 14, hueStep: 22 })] }),
      B('heart', { name: 'Big heart', x: 400, y: 420, w: 320, h: 290, fillMode: 'linear', fill: '#ff4f87', fill2: '#ff8fab', gradAngle: 180 }),
      B('face', { name: 'Face', x: 400, y: 400, w: 150, h: 96, expression: 'happy', blush: true, fill: '#6b1231', stroke: '#6b1231' }),
    ]),
  },
  {
    id: 'cat', name: 'Kitty',
    blurb: 'Circle head, mirrored triangle ears and curved whiskers.',
    build: () => scene(linear('#fff0f6', '#e8e4ff'), [
      B('circle', { name: 'Body', x: 400, y: 640, w: 330, h: 260, fill: '#ffb86b' }),
      B('curve', { name: 'Tail', x: 590, y: 600, w: 120, h: 180, bend: -0.6, stroke: '#ffb86b', strokeWidth: 30 }),
      B('triangle', { name: 'Ears', x: 300, y: 250, w: 120, h: 130, rot: -18, tip: -0.2, fill: '#ffb86b', repeats: [R('mirror')] }),
      B('triangle', { name: 'Inner ears', x: 304, y: 262, w: 64, h: 76, rot: -18, tip: -0.2, fill: '#ff8fab', repeats: [R('mirror')] }),
      B('circle', { name: 'Head', x: 400, y: 380, w: 330, h: 280, fill: '#ffc587' }),
      B('face', { name: 'Face', x: 400, y: 400, w: 190, h: 120, expression: 'cat' }),
      B('line', { name: 'Whiskers', x: 555, y: 410, w: 90, h: 10, rot: -8, strokeWidth: 4, repeats: [R('step', { count: 2, dy: 22, rot: 14, scale: 1 }), R('mirror')] }),
      B('circle', { name: 'Paws', x: 330, y: 745, w: 90, h: 50, fill: '#ffc587', repeats: [R('mirror')] }),
    ]),
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
