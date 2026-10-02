// The Helper: looks at your drawing like a friendly art teacher would, and
// suggests small changes with a one-click fix. You stay the artist: every fix
// is a normal step you can undo, and the Helper never adds anything you didn't draw.
//
// critique(scene, boxes) -> [{ id, kind: 'tip' | 'good', title, why, learn, ids, fix }]
//   boxes: Map(blockId -> {x, y, width, height}) measured by the studio (getBBox),
//          or approxBoxes(scene) when no browser is around (tests).
//   fix(scene, boxes) returns a NEW scene; the studio applies it and commits.

import { clone } from './util.js';
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, isHex } from './color.js';
import { harmonize, isLineBlock } from './coloring.js';
import { canShade, isShaded, addShading, addGroundShadow } from './shading.js';

// ---------- small color helpers ----------
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const bgColor = (s) => (s.background.mode === 'solid' ? s.background.c1 : mix(s.background.c1, s.background.c2));
function mix(a, b) { const p = hexToRgb(a), q = hexToRgb(b); return rgbToHex((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); }
const blockColor = (b) => (b.fillMode === 'none' || isLineBlock(b) ? b.stroke : b.fillMode === 'solid' ? b.fill : mix(b.fill, b.fill2));

/** Rough boxes from position and size (ignores repeats and rotation). Good enough for tests. */
export function approxBoxes(scene) {
  return new Map(scene.blocks.map((b) => [b.id, { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h }]));
}

const area = (bb) => bb.width * bb.height;
const isScatter = (b) => (b.repeats || []).some((r) => r.mode === 'scatter');

/** Parts that make up "the subject": not backdrops that fill the page, not sprinkles. */
function subject(scene, boxes) {
  const W = scene.width, H = scene.height;
  return scene.blocks.filter((b) => {
    const bb = boxes.get(b.id);
    if (!b.visible || !bb) return false;
    if (isScatter(b) || b.type === 'pattern') return false;
    if (area(bb) > W * H * 0.7) return false;
    if (bb.width > W * 0.95) return false; // ground and horizon bands
    return true;
  });
}
function union(list, boxes) {
  if (!list.length) return null;
  const bs = list.map((b) => boxes.get(b.id));
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.width)), y1 = Math.max(...bs.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Scale the whole drawing about the canvas center (keeps mirrors and spins working). */
function scaleAll(scene, k, keep = () => false) {
  const s = clone(scene), cx = s.width / 2, cy = s.height / 2;
  for (const b of s.blocks) {
    if (keep(b)) continue;
    b.x = cx + (b.x - cx) * k; b.y = cy + (b.y - cy) * k;
    b.w *= k; b.h *= k;
    if (b.strokeWidth) b.strokeWidth = Math.max(1, b.strokeWidth * Math.sqrt(k));
    for (const r of b.repeats || []) {
      for (const key of ['dx', 'dy', 'gapX', 'gapY', 'spreadX', 'spreadY', 'spacing']) if (Number.isFinite(r[key])) r[key] *= k;
      if (r.around === 'point') { r.cx = cx + (r.cx - cx) * k; r.cy = cy + (r.cy - cy) * k; }
    }
  }
  return s;
}
const usesCanvasCenter = (s) => s.blocks.some((b) => (b.repeats || []).some((r) => (r.mode === 'mirror' || r.mode === 'radial') && (r.around || 'canvas') === 'canvas'));
function moveAll(scene, dx, dy, keep = () => false) {
  const s = clone(scene);
  for (const b of s.blocks) {
    if (keep(b)) continue;
    b.x += dx; b.y += dy;
    for (const r of b.repeats || []) if (r.around === 'point') { r.cx += dx; r.cy += dy; }
  }
  return s;
}

const ROUND = new Set(['circle', 'blob', 'ghost', 'egg', 'cloud', 'heart']);

export function critique(scene, boxes = approxBoxes(scene)) {
  const out = [];
  const W = scene.width, H = scene.height;
  const vis = scene.blocks.filter((b) => b.visible !== false);
  if (!vis.length) {
    return [{ id: 'empty', kind: 'tip', title: 'Start with one big shape', why: 'Most drawings begin with the biggest, simplest shape: a body, a head, a hill. Add it first, then build on top.', learn: 'learn.html#blocks' }];
  }
  const subj = subject(scene, boxes);
  const u = union(subj, boxes);
  const isBackdrop = (b) => { const bb = boxes.get(b.id); return !!bb && (area(bb) > W * H * 0.7 || bb.width > W * 0.95); };

  // 1. Size on the page
  if (u) {
    const fill = (u.width * u.height) / (W * H);
    const margin = Math.min(u.x, u.y, W - (u.x + u.width), H - (u.y + u.height));
    if (fill < 0.12) {
      out.push({
        id: 'small', kind: 'tip', title: 'Make it bigger',
        why: 'Your drawing only fills a small part of the page. A subject that fills about half the canvas feels confident and is easier to see.',
        learn: 'learn.html#composition', ids: subj.map((b) => b.id),
        fix: (s, bx) => {
          const k = Math.min(5, Math.sqrt(0.4 / fill));
          let next = scaleAll(s, k, isBackdrop);
          if (!usesCanvasCenter(s)) next = moveAll(next, (W / 2 - u.cx) * k, (H / 2 - u.cy) * k, isBackdrop);
          return next;
        }, fixLabel: 'Make it bigger',
      });
    } else if (margin < Math.min(W, H) * 0.02 && margin > -Math.min(W, H) * 0.02 && fill < 0.85) {
      out.push({
        id: 'edges', kind: 'tip', title: 'Give it room to breathe',
        why: 'Parts of the drawing just touch the edge of the page, which makes it feel cramped. Either leave a clear margin, or push parts boldly off the edge on purpose.',
        learn: 'learn.html#composition', ids: subj.map((b) => b.id),
        fix: (s) => scaleAll(s, 0.88, isBackdrop), fixLabel: 'Add a margin',
      });
    }
    // 2. Almost centered
    const off = Math.hypot(u.cx - W / 2, u.cy - H / 2) / Math.min(W, H);
    if (off > 0.02 && off < 0.09 && !usesCanvasCenter(scene)) {
      out.push({
        id: 'nearly-centered', kind: 'tip', title: 'Almost centered',
        why: 'The drawing sits just a little off center, which can look like an accident. Center it exactly, or move it clearly onto a rule-of-thirds line.',
        learn: 'learn.html#composition', ids: subj.map((b) => b.id),
        fix: (s) => moveAll(s, W / 2 - u.cx, H / 2 - u.cy, isBackdrop), fixLabel: 'Center it',
      });
    }
  }

  // 3. Off the page
  const lost = vis.filter((b) => { const bb = boxes.get(b.id); return bb && (bb.x > W || bb.y > H || bb.x + bb.width < 0 || bb.y + bb.height < 0); });
  if (lost.length) {
    out.push({
      id: 'offpage', kind: 'tip', title: `${lost.length === 1 ? 'A part is' : `${lost.length} parts are`} off the page`,
      why: 'Something is completely outside the canvas, so nobody will see it. Bring it back, or delete it.',
      ids: lost.map((b) => b.id),
      fix: (s) => { const n = clone(s); for (const b of n.blocks) if (lost.some((l) => l.id === b.id)) { b.x = Math.min(W - 40, Math.max(40, b.x)); b.y = Math.min(H - 40, Math.max(40, b.y)); } return n; },
      fixLabel: 'Bring it back',
    });
  }

  // 4. Contrast between the subject and the background
  if (subj.length) {
    const main = [...subj].sort((a, b) => area(boxes.get(b.id)) - area(boxes.get(a.id)))[0];
    const c = blockColor(main), bg = bgColor(scene);
    if (isHex(c) && isHex(bg)) {
      const ratio = contrast(c, bg);
      if (ratio < 1.5) {
        out.push({
          id: 'contrast', kind: 'tip', title: `${main.name} blends into the background`,
          why: 'The biggest part is almost as light (or dark) as the background, so the eye slides right past it. Changing lightness matters more than changing hue.',
          learn: 'learn.html#color', ids: [main.id],
          fix: (s) => {
            const n = clone(s);
            const subjL = rgbToHsl(...hexToRgb(c))[2];
            const shift = (hex) => { const [hh, ss, ll] = rgbToHsl(...hexToRgb(hex)); const nl = subjL > 0.5 ? Math.max(0.1, Math.min(ll, subjL) - 0.4) : Math.min(0.95, Math.max(ll, subjL) + 0.4); return rgbToHex(...hslToRgb(hh, ss, nl)); };
            n.background.c1 = shift(n.background.c1); n.background.c2 = shift(n.background.c2);
            return n;
          }, fixLabel: subjLight(c) ? 'Darken the background' : 'Lighten the background',
        });
      } else if (ratio > 3) {
        out.push({ id: 'contrast-good', kind: 'good', title: 'Strong contrast', why: `${main.name} stands out clearly from the background.` });
      }
    }
  }

  // 5. Too many colors
  const colors = new Set(vis.filter((b) => b.type !== 'face').map(blockColor).filter((c) => isHex(c) && rgbToHsl(...hexToRgb(c))[1] > 0.25).map((c) => c.toLowerCase()));
  if (colors.size > 7) {
    const counts = new Map();
    for (const b of vis) { const c = blockColor(b); if (isHex(c)) counts.set(c, (counts.get(c) || 0) + 1); }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      id: 'colors', kind: 'tip', title: `${colors.size} different colors`,
      why: 'Lots of unrelated colors can look noisy. Pictures often feel calmer and more "designed" with a few related colors. This keeps your lights and darks and builds a harmony from your most-used color.',
      learn: 'learn.html#color',
      fix: (s) => harmonize(s, top, 'analogous'), fixLabel: 'Harmonize colors',
    });
  } else if (colors.size >= 2 && colors.size <= 5) {
    out.push({ id: 'colors-good', kind: 'good', title: 'A tidy color palette', why: `${colors.size} main colors: easy on the eyes.` });
  }

  // 6. Outlines that don't match
  const outlined = vis.filter((b) => b.strokeWidth > 0 && !isLineBlock(b) && b.fillMode !== 'none' && b.type !== 'face');
  if (outlined.length >= 3) {
    const ws = outlined.map((b) => b.strokeWidth).sort((a, b) => a - b);
    const median = ws[Math.floor(ws.length / 2)];
    if (ws[ws.length - 1] / Math.max(0.5, ws[0]) > 2.5) {
      out.push({
        id: 'outlines', kind: 'tip', title: 'Outlines of different weights',
        why: 'Some outlines are much thicker than others. Matching outline weights makes a drawing look like one style, like a sticker sheet or a comic.',
        ids: outlined.map((b) => b.id),
        fix: (s) => { const n = clone(s); for (const b of n.blocks) if (outlined.some((o) => o.id === b.id)) b.strokeWidth = median; return n; },
        fixLabel: `Make them all ${Math.round(median)}`,
      });
    }
  }

  // 7. Almost lined up
  const near = [];
  for (let i = 0; i < subj.length; i++) {
    for (let j = i + 1; j < subj.length; j++) {
      const a = subj[i], b = subj[j];
      const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      if (dx > 0.6 && dx < 7 && dy > 20) near.push([a, b, 'x']);
      else if (dy > 0.6 && dy < 7 && dx > 20) near.push([a, b, 'y']);
    }
  }
  if (near.length) {
    out.push({
      id: 'align', kind: 'tip', title: `${near.length === 1 ? 'Two parts are' : `${near.length} pairs are`} almost lined up`,
      why: 'Parts that are only a few pixels apart from lining up look like a mistake. Snapping them into line makes the drawing feel neat and intentional.',
      ids: [...new Set(near.flatMap(([a, b]) => [a.id, b.id]))],
      fix: (s) => {
        const n = clone(s), byId = new Map(n.blocks.map((b) => [b.id, b]));
        for (const [a, b, axis] of near) {
          const A = byId.get(a.id), B = byId.get(b.id);
          const v = Math.round((A[axis] + B[axis]) / 2);
          if (!A.locked) A[axis] = v;
          if (!B.locked) B[axis] = v;
        }
        return n;
      }, fixLabel: 'Line them up',
    });
  }

  // 8. Almost a mirror image
  const pairs = [];
  for (let i = 0; i < subj.length; i++) {
    for (let j = i + 1; j < subj.length; j++) {
      const a = subj[i], b = subj[j];
      if (a.type !== b.type || Math.abs(a.w - b.w) > a.w * 0.2 || Math.abs(a.h - b.h) > a.h * 0.2) continue;
      const sym = Math.abs(a.x + b.x - W), dy = Math.abs(a.y - b.y);
      if (Math.abs(a.x - b.x) > 30 && (sym > 2 || dy > 2) && sym < 30 && dy < 24) pairs.push([a, b]);
    }
  }
  if (pairs.length) {
    out.push({
      id: 'mirror', kind: 'tip', title: 'Almost a mirror image',
      why: 'These parts look like they are meant to match left and right, but they are a little off. Faces, wings and ears read best when they mirror exactly.',
      learn: 'learn.html#mirror', ids: [...new Set(pairs.flatMap(([a, b]) => [a.id, b.id]))],
      fix: (s) => {
        const n = clone(s), byId = new Map(n.blocks.map((b) => [b.id, b]));
        for (const [a, b] of pairs) {
          const A = byId.get(a.id), B = byId.get(b.id);
          const off = (Math.abs(A.x - W / 2) + Math.abs(B.x - W / 2)) / 2, y = (A.y + B.y) / 2;
          const [L, R] = A.x < B.x ? [A, B] : [B, A];
          L.x = W / 2 - off; R.x = W / 2 + off; L.y = R.y = y;
          const wm = (A.w + B.w) / 2, hm = (A.h + B.h) / 2; A.w = B.w = wm; A.h = B.h = hm;
          if (Math.abs(A.rot + B.rot) < 20) { const r = (Math.abs(A.rot) + Math.abs(B.rot)) / 2; L.rot = -r * Math.sign(L.rot || -1); R.rot = r * Math.sign(R.rot || 1); }
        }
        return n;
      }, fixLabel: 'Make them match',
    });
  }

  // 9. Cute faces: big eyes, set low (see "Why cute is cute")
  for (const f of vis.filter((b) => b.type === 'face')) {
    const host = subj.filter((b) => b.id !== f.id && ROUND.has(b.type))
      .filter((b) => { const bb = boxes.get(b.id); return bb && f.x > bb.x && f.x < bb.x + bb.width && f.y > bb.y && f.y < bb.y + bb.height; })
      .sort((a, b) => area(boxes.get(b.id)) - area(boxes.get(a.id)))[0];
    if (!host) continue;
    const hb = boxes.get(host.id), hcy = hb.y + hb.height / 2;
    const high = f.y < hcy - hb.height * 0.12, smallEyes = (f.eyes ?? 1) < 0.9, tiny = f.w < hb.width * 0.35;
    if (high || smallEyes || tiny) {
      out.push({
        id: `cute-${f.id}`, kind: 'tip', title: `Make ${host.name} cuter`,
        why: 'Faces look friendliest with big eyes set a little low on a round head, the "baby schema" animators use.',
        learn: 'learn.html#cute', ids: [f.id, host.id],
        fix: (s) => {
          const n = clone(s), F = n.blocks.find((b) => b.id === f.id);
          if (high) F.y = hcy + hb.height * 0.04;
          if (tiny) { const k = (hb.width * 0.45) / F.w; F.w *= k; F.h *= k; }
          if (smallEyes) F.eyes = 1.25;
          if (Math.abs(F.x - (hb.x + hb.width / 2)) < hb.width * 0.15) F.x = hb.x + hb.width / 2;
          return n;
        }, fixLabel: 'Make it cuter',
      });
    }
  }

  // 10. Flat round shapes: add light and shadow
  if (subj.length && vis.length <= 30) {
    const main = [...subj].sort((a, b) => area(boxes.get(b.id)) - area(boxes.get(a.id)))[0];
    const busy = (main.repeats || []).some((r) => ['spiral', 'grid', 'scatter'].includes(r.mode));
    if (canShade(main) && ROUND.has(main.type) && !busy && vis.length <= 14 && !isShaded(scene, main) && !main.group) {
      out.push({
        id: 'shade', kind: 'tip', title: `Give ${main.name} some depth`,
        why: 'A flat shape looks like a sticker; a little shadow on one side and a highlight on the other makes it look round and solid. Light comes from the top left.',
        learn: 'learn.html#composition', ids: [main.id],
        fix: (s) => addShading(s, main.id), fixLabel: 'Add shading',
      });
    }
    // 11. Characters floating in mid-air
    const hasShadow = vis.some((b) => /shadow/i.test(b.name) && !b.clipTo); // shading inside a shape doesn't count
    const character = vis.some((b) => b.type === 'face');
    if (u && character && ROUND.has(main.type) && !hasShadow && u.y + u.height < H * 0.93 && u.height > H * 0.2) {
      out.push({
        id: 'ground', kind: 'tip', title: 'Put it on the ground',
        why: 'Without a shadow underneath, a character seems to float. A soft oval shadow below makes it stand on something.',
        ids: subj.map((b) => b.id),
        fix: (s) => addGroundShadow(s, subj.map((b) => b.id), u), fixLabel: 'Add a ground shadow',
      });
    }
  }

  // 12. A plain white page
  const bg = scene.background;
  if (bg.mode === 'solid' && /^#f{6}$/i.test(bg.c1) && vis.length >= 3 && subj.length) {
    // Tint the page from the most colorful part (its opposite on the color wheel), not from a gray one.
    const vivid = subj.map(blockColor).filter(isHex).sort((a, b) => rgbToHsl(...hexToRgb(b))[1] - rgbToHsl(...hexToRgb(a))[1])[0];
    const base = vivid && rgbToHsl(...hexToRgb(vivid))[1] > 0.2 ? vivid : '#4f6bff';
    out.push({
      id: 'background', kind: 'tip', title: 'Try a background',
      why: 'A soft background color, tinted with a hint of your main color, makes a drawing feel finished, like a frame around it.',
      learn: 'learn.html#color',
      fix: (s) => {
        const n = clone(s);
        const [hh, ss] = isHex(base) ? rgbToHsl(...hexToRgb(base)) : [220, 0.5];
        n.background = { mode: 'linear', c1: rgbToHex(...hslToRgb(hh + 180, Math.min(0.6, ss * 0.6 + 0.2), 0.93)), c2: rgbToHex(...hslToRgb(hh + 200, Math.min(0.6, ss * 0.6 + 0.2), 0.84)), angle: 180 };
        return n;
      }, fixLabel: 'Add a soft background',
    });
  }

  // Encouragement
  if (subj.some((b) => (b.repeats || []).some((r) => r.mode === 'mirror' || (r.mode === 'radial' && r.kaleido)))) {
    out.push({ id: 'symmetry-good', kind: 'good', title: 'Nice symmetry', why: 'Mirrored parts give the drawing a sense of order.' });
  }
  if (u && Math.hypot(u.cx - W / 2, u.cy - H / 2) / Math.min(W, H) <= 0.02) {
    out.push({ id: 'centered-good', kind: 'good', title: 'Well centered', why: 'Your subject sits right in the middle of the page.' });
  }
  return out;
}
const subjLight = (hex) => rgbToHsl(...hexToRgb(hex))[2] > 0.5;
