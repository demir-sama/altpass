// Rule-based alt-text drafting: no network, no model. It looks at the image's pixels (flat colours vs
// photographic, white background, size/shape) and at the text around it (caption, nearest heading).
// It can NOT see what an image actually shows, so every draft is flagged "needs review".
import { PNG } from 'pngjs';

const NAMED = [
  ['black', 0, 0, 0], ['white', 255, 255, 255], ['grey', 128, 128, 128], ['red', 220, 38, 38], ['orange', 249, 115, 22], ['yellow', 234, 179, 8],
  ['green', 34, 160, 80], ['teal', 20, 150, 150], ['blue', 37, 99, 235], ['navy', 31, 58, 95], ['purple', 126, 58, 220], ['pink', 236, 100, 160],
  ['brown', 140, 80, 30], ['beige', 245, 235, 215], ['light green', 220, 245, 230], ['light pink', 253, 231, 239],
];
const nameColour = (r, g, b) => NAMED.reduce((best, c) => { const d = (c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2; return d < best[0] ? [d, c[0]] : best; }, [Infinity, ''])[1];

export function analyseImage(png) {
  let img; try { img = PNG.sync.read(png); } catch { return null; }
  const { width, height, data } = img; const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 20000)));
  const buckets = new Map(); let n = 0, white = 0, dark = 0;
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const o = (y * width + x) * 4; const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
    if (a < 20) continue; n++;
    if (r > 240 && g > 240 && b > 240) white++; if (r + g + b < 120) dark++;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(k) || { c: 0, r: 0, g: 0, b: 0 }; e.c++; e.r += r; e.g += g; e.b += b; buckets.set(k, e);
  }
  if (!n) return null;
  const top = [...buckets.values()].sort((a, b) => b.c - a.c);
  const cover12 = top.slice(0, 12).reduce((s, e) => s + e.c, 0) / n;
  const cols = []; for (const e of top) { const nm = nameColour(e.r / e.c, e.g / e.c, e.b / e.c); if (!cols.includes(nm) && e.c / n > 0.03) cols.push(nm); }
  return { width, height, whiteRatio: white / n, darkRatio: dark / n, cover12, colours: cols, distinct: buckets.size };
}

export function classify(im, stats) {
  const wpt = im.w, hpt = im.h; const ar = Math.max(wpt, hpt) / Math.max(1, Math.min(wpt, hpt));
  if (ar >= 12 || Math.min(wpt, hpt) < 6) return 'decorative';
  if (wpt <= 100 && hpt <= 100) return 'logo';
  if (!stats) return 'graphic';
  if (stats.whiteRatio >= 0.35 && stats.cover12 >= 0.85) return 'chart';
  if (stats.darkRatio >= 0.35 && stats.cover12 >= 0.8) return 'screenshot';
  if (stats.cover12 < 0.7) return 'photo';
  return 'graphic';
}

const LABEL = { chart: 'Chart or diagram', screenshot: 'Screenshot or interface mock-up', photo: 'Photograph or illustration', graphic: 'Graphic', logo: 'Logo or emblem' };
const stripFigure = (s) => s.replace(/^\s*(figure|fig\.?|chart|image|photo|illustration|graph)\s*\d*[.:)\-–—]?\s*/i, '').trim();

export function describeWithRules(im, ctx = {}) {
  const stats = im.png ? analyseImage(im.png) : null;
  const kind = classify(im, stats);
  if (kind === 'decorative') return { alt: '', decorative: true, kind, source: 'rules', needsReview: false, note: 'Thin line or tiny shape: treated as decorative (hidden from screen readers).' };
  const cap = ctx.caption ? stripFigure(ctx.caption) : '';
  const colours = stats?.colours?.filter((c) => c !== 'white').slice(0, 3) || [];
  let alt;
  if (kind === 'logo') {
    const org = ctx.org ? ` of ${ctx.org}` : '';
    alt = `Logo or emblem${org}`;
  } else if (cap) {
    alt = `${kind === 'chart' ? 'Chart: ' : kind === 'screenshot' ? 'Screenshot: ' : ''}${cap}`.replace(/\.?$/, '.');
  } else if (ctx.heading) {
    alt = `${LABEL[kind] || 'Image'} in the “${ctx.heading.replace(/^\d+[.)]\s*/, '')}” section${colours.length && kind !== 'chart' ? `, mostly ${list(colours)}` : ''}.`;
  } else {
    alt = `${LABEL[kind] || 'Image'} on page ${im.page}${colours.length ? `, mostly ${list(colours)}` : ''}.`;
  }
  return { alt, decorative: false, kind, source: 'rules', needsReview: true, note: 'Drafted from the caption / nearby heading and image statistics. The pixels were not interpreted.' };
}
const list = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a.at(-1) : a[0]);
