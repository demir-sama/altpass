// What a typical "PDF to HTML" converter produces: every text run in a <div>, images with no alt,
// no language, no title, no landmarks, no headings. Used as the "before" for the axe-core comparison.
import { esc } from './render.js';

export function naiveHtml(raw) {
  let out = '<html><body style="font-family:Helvetica,Arial,sans-serif;background:#fff;color:#222">';
  for (const p of raw.pages) {
    const items = p.items.filter((i) => i.str.trim());
    const imgs = [...p.images].sort((a, b) => a.textOpsBefore - b.textOpsBefore);
    let k = 0;
    const flushImgs = (n) => { while (k < imgs.length && imgs[k].textOpsBefore <= n) { const im = imgs[k++]; if (im.png) out += `<img src="data:image/png;base64,${im.png.toString('base64')}" width="${Math.round(im.w)}">`; } };
    items.forEach((it, n) => { flushImgs(n); out += `<div style="font-size:${Math.round(it.size)}px${it.bold ? ';font-weight:bold' : ''}">${esc(it.str)}</div>`; });
    flushImgs(Infinity);
    out += '<div style="height:24px"></div>';
  }
  return out + '</body></html>';
}

// Reading-order transcript of the original, in content-stream order (what a screen reader receives from an untagged PDF).
export function announceOriginal(raw, { maxPerPage = 40 } = {}) {
  const lines = [{ kind: 'meta', text: raw.meta.title ? `Document, ${raw.meta.title}` : 'Document, untitled' }];
  lines.push({ kind: 'meta', text: raw.meta.lang ? `Language ${raw.meta.lang}` : 'Language not set: read with the default voice' });
  for (const p of raw.pages) {
    lines.push({ kind: 'page', text: `Page ${p.n}` });
    const items = p.items.filter((i) => i.str.trim());
    const imgs = [...p.images].sort((a, b) => a.textOpsBefore - b.textOpsBefore);
    let k = 0, count = 0;
    const flushImgs = (n) => { while (k < imgs.length && imgs[k].textOpsBefore <= n) { k++; if (count++ < maxPerPage) lines.push({ kind: 'graphic', text: 'Graphic' }); } };
    items.forEach((it, n) => { flushImgs(n); if (count++ < maxPerPage) lines.push({ kind: p.links.some((l) => it.x < l.x + l.w && it.x + it.w > l.x && Math.abs(it.y - (l.y + l.h)) < 12) ? 'link' : 'text', text: it.str.trim() }); });
    flushImgs(Infinity);
    if (count > maxPerPage) lines.push({ kind: 'more', text: `… ${count - maxPerPage} more items` });
  }
  return lines;
}
