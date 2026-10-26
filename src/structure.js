// Turns positioned PDF content into a semantic block list:
// headings (with levels), paragraphs, lists, tables, figures, links, page breaks.
// Everything here is heuristic and deliberately explainable (see spec.md > Structure inference).

const BULLET_CHARS = '•◦▪▫●■□○·‣⁃–—*-';
const isBulletToken = (s) => s.length === 1 && BULLET_CHARS.includes(s);
const isOrderedToken = (s) => /^(\d{1,3}[.)]|[A-Za-z][.)]|\([0-9A-Za-z]\))$/.test(s);
const GENERIC_LINK = /^(click here|here|read more|more|link|this link|learn more|details|download|click|see more|this page|website)\.?$/i;

export const norm = (s) => s.replace(/\s+/g, ' ').trim();
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };

// ---------------------------------------------------------------- language
const STOP = {
  en: 'the of and to in is that for it with as was on are by this be from or at an have not but they which you were their has more will can all if one would there what about'.split(' '),
  fr: 'le la les de des du un une et en est que qui dans pour pas sur au aux avec ce ces par plus ne se son sa ses nous vous ils elle il mais ou être sont'.split(' '),
  de: 'der die das und ist in den von zu mit sich des auf für nicht ein eine dem als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie'.split(' '),
  es: 'el la los las de y en que es un una por con para se del al lo como más pero su sus le ya o este sí porque esta entre cuando muy sin sobre también'.split(' '),
  it: 'il lo la i gli le di e che è un una per con non su come più ma del della dei delle al nel sono si da anche questo questa quando tra molto'.split(' '),
  pt: 'o a os as de e que do da em um uma para com não é por mais se dos das no na como mas ao ele foi são seu sua ou quando muito nos já também'.split(' '),
  nl: 'de het een en van in is dat op te zijn met voor niet aan er ook als bij maar om dan wordt door naar uit over heeft deze'.split(' '),
};
export function detectLanguage(text) {
  const words = text.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿñæœäöüßáíóúãõì]+/g) || [];
  if (words.length < 12) return { lang: 'en', confident: false };
  const scores = {};
  for (const [l, list] of Object.entries(STOP)) { const set = new Set(list); scores[l] = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0); }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  const confident = best[1] >= 5 && best[1] >= (second[1] || 0) * 1.3;
  return { lang: confident ? best[0] : 'en', confident };
}

// ---------------------------------------------------------------- runs (text with optional link)
const runsText = (runs) => runs.map((r) => r.t).join('');
function pushRun(runs, t, href) {
  if (!t) return;
  const last = runs[runs.length - 1];
  if (last && last.href === href) last.t += t; else runs.push(href ? { t, href } : { t });
}
function tidyRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (r.href) {
      const lead = r.t.match(/^\s+/)?.[0] || '', trail = r.t.match(/\s+$/)?.[0] || '';
      const core = r.t.trim();
      if (lead) pushRun(out, lead); if (core) pushRun(out, core, r.href); if (trail) pushRun(out, trail);
    } else pushRun(out, r.t);
  }
  return out;
}
function itemRuns(item, links) {
  const len = item.str.length; if (!len) return [];
  const hits = [];
  for (const l of links) {
    const withinY = item.y >= l.y - 2 && item.y <= l.y + l.h + 3;
    const x1 = Math.max(item.x, l.x), x2 = Math.min(item.x + item.w, l.x + l.w);
    if (withinY && x2 - x1 > 1) {
      const a = Math.max(0, Math.round(((x1 - item.x) / item.w) * len)), b = Math.min(len, Math.round(((x2 - item.x) / item.w) * len));
      if (b > a) hits.push({ a, b, href: l.url });
    }
  }
  if (!hits.length) return [{ t: item.str }];
  hits.sort((p, q) => p.a - q.a);
  const out = []; let pos = 0;
  for (const h of hits) { if (h.a > pos) pushRun(out, item.str.slice(pos, h.a)); pushRun(out, item.str.slice(Math.max(pos, h.a), h.b), h.href); pos = Math.max(pos, h.b); }
  if (pos < len) pushRun(out, item.str.slice(pos));
  return out;
}

// ---------------------------------------------------------------- lines
function buildLines(items, links) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 0.45 * Math.max(r.size, it.size));
    if (row) { row.items.push(it); row.size = Math.max(row.size, it.size); } else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  rows.sort((a, b) => a.y - b.y);
  return rows.map((row) => {
    const its = row.items.sort((a, b) => a.x - b.x);
    const segs = [];
    for (const it of its) {
      const prev = segs[segs.length - 1];
      const gap = prev ? it.x - prev.x2 : Infinity;
      const marker = prev && prev.items.length === 1 && prev.marker && !prev.markerClosed;
      if (prev && gap <= 0.7 * Math.max(it.size, 8) && !marker) {
        const needsSpace = gap > 0.12 * it.size && !/\s$/.test(prev.items.at(-1).str) && !/^\s/.test(it.str);
        if (needsSpace) pushRun(prev.runs, ' ', prev.runs.at(-1)?.href && itemRuns(it, links)[0]?.href === prev.runs.at(-1).href ? prev.runs.at(-1).href : undefined);
        for (const r of itemRuns(it, links)) pushRun(prev.runs, r.t, r.href);
        prev.items.push(it); prev.x2 = it.x + it.w; prev.size = Math.max(prev.size, it.size);
        prev.bold = prev.bold && it.bold; prev.italic = prev.italic && it.italic; prev.chars += it.str.length;
      } else {
        const s = it.str.trim();
        const isMarker = !prev && (isBulletToken(s) || isOrderedToken(s));
        segs.push({ items: [it], x: it.x, x2: it.x + it.w, size: it.size, bold: it.bold, italic: it.italic, runs: itemRuns(it, links), chars: it.str.length, marker: isMarker ? (isBulletToken(s) ? 'bullet' : 'ordered') : null, markerClosed: false });
        if (prev) prev.markerClosed = true;
      }
    }
    // inline marker such as "• text" or "1) text"
    let marker = null, markerLabel = '';
    if (segs[0].marker) { marker = segs[0].marker; markerLabel = segs[0].items[0].str.trim(); }
    else {
      const t0 = runsText(segs[0].runs);
      const m = t0.match(/^([•◦▪●■\-–*])\s+\S/) || null;
      const n = t0.match(/^(\d{1,3}[.)])\s*[^\d\s.,)]/) || null;
      if (m) { marker = 'bullet'; markerLabel = m[1]; } else if (n) { marker = 'ordered-inline'; markerLabel = n[1]; }
    }
    const textSegs = segs.filter((s, i) => !(i === 0 && s.marker));
    const size = Math.max(...segs.map((s) => s.size));
    const chars = segs.reduce((n, s) => n + s.chars, 0);
    const bold = segs.filter((s) => !s.marker).every((s) => s.bold);
    const italic = segs.filter((s) => !s.marker).every((s) => s.italic);
    return { y: row.y, size, segs, textSegs, x: segs[0].x, x2: segs.at(-1).x2, chars, bold, italic, marker, markerLabel,
      multi: textSegs.length >= 2 && textSegs.some((s, i) => i > 0 && s.x - textSegs[i - 1].x2 >= 1.6 * Math.max(s.size, 8)) };
  });
}
const lineRuns = (line, keepMarker = false) => {
  const runs = [];
  line.segs.forEach((s, i) => {
    if (i === 0 && s.marker) return;
    if (runs.length) pushRun(runs, ' ');
    for (const r of s.runs) pushRun(runs, r.t, r.href);
  });
  if (keepMarker) return tidyRuns(runs);
  if (line.marker === 'bullet' && !line.segs[0].marker) { runs[0].t = runs[0].t.replace(/^[•◦▪●■\-–*]\s+/, ''); }
  if (line.marker === 'ordered-inline') { runs[0].t = runs[0].t.replace(/^\d{1,3}[.)]\s*/, ''); }
  return tidyRuns(runs);
};

// ---------------------------------------------------------------- columns (XY-cut variant)
const LONG_LINE = 30;
function regionRows(entries) {
  // approximate lines to count long lines for the table-vs-columns decision
  const texts = entries.filter((e) => e.kind === 'text');
  return buildLines(texts.map((e) => e.item), []);
}
function verticalCut(entries) {
  const iv = entries.map((e) => [e.x, e.x + Math.max(e.w, 1)]).sort((a, b) => a[0] - b[0]);
  const gutters = []; let end = iv[0][1];
  for (let i = 1; i < iv.length; i++) { if (iv[i][0] - end >= 14) gutters.push((end + iv[i][0]) / 2); end = Math.max(end, iv[i][1]); }
  if (!gutters.length) return null;
  const parts = Array.from({ length: gutters.length + 1 }, () => []);
  for (const e of entries) { const cx = e.x + e.w / 2; let k = 0; while (k < gutters.length && cx > gutters[k]) k++; parts[k].push(e); }
  const nonEmpty = parts.filter((p) => p.length);
  if (nonEmpty.length < 2) return null;
  // columns must look like text columns, not table cells: some part has long text lines or an image
  const bandLines = regionRows(entries);
  const multiRows = bandLines.filter((l) => l.multi);
  if (multiRows.length >= 3 && multiRows.every((l) => l.textSegs.every((g) => g.chars < LONG_LINE))) return null; // it's a table
  const hasImage = entries.some((e) => e.kind === 'image');
  const longLines = nonEmpty.reduce((n, p) => n + regionRows(p).filter((l) => l.chars >= LONG_LINE).length, 0);
  if (!hasImage && longLines < 2) return null;
  return nonEmpty;
}
function horizontalCut(entries, gapMin) {
  const sorted = [...entries].sort((a, b) => a.top - b.top);
  const bands = []; let cur = [sorted[0]]; let bottom = sorted[0].bottom;
  for (let i = 1; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.top - bottom >= gapMin) { bands.push(cur); cur = [e]; bottom = e.bottom; } else { cur.push(e); bottom = Math.max(bottom, e.bottom); }
  }
  bands.push(cur);
  return bands;
}
function orderRegions(entries, ctx, depth = 0) {
  if (!entries.length) return [];
  const bands = horizontalCut(entries, ctx.bandGap);
  const out = [];
  for (const band of bands) {
    const cols = band.length > 2 ? verticalCut(band) : null;
    if (cols && depth < 3) {
      ctx.columnPages.add(ctx.page);
      for (const c of cols) out.push(...orderRegions(c, ctx, depth + 1));
    } else out.push(band);
  }
  return out;
}

// ---------------------------------------------------------------- chrome (running headers / footers)
function findChrome(pages) {
  const counts = new Map();
  const keyOf = (it, page) => {
    const zone = it.y < page.height * 0.09 ? 'top' : it.y > page.height * 0.91 ? 'bot' : null;
    if (!zone) return null;
    return zone + '|' + it.str.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  };
  for (const p of pages) { const seen = new Set(); for (const it of p.items) { const k = keyOf(it, p); if (k && !seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) || 0) + 1); } } }
  const removed = [];
  const pageNumber = /^(page\s*)?#?(\s*(of|\/)\s*#)?$/;
  for (const p of pages) {
    p.items = p.items.filter((it) => {
      const k = keyOf(it, p); if (!k) return true;
      const body = k.split('|')[1];
      const isNum = /^(page\s*)?#(\s*(of|\/|\|)\s*#)?$/.test(body) || /^-?\s*#\s*-?$/.test(body);
      const repeated = pages.length >= 2 && counts.get(k) >= Math.max(2, Math.ceil(pages.length * 0.5));
      if (isNum || repeated) { removed.push({ page: p.n, text: it.str.trim() }); return false; }
      return true;
    });
  }
  return removed;
}

// ---------------------------------------------------------------- main
export function inferStructure(raw, { filename = 'document.pdf' } = {}) {
  const pages = raw.pages.map((p) => ({ ...p, items: p.items.map((i) => ({ ...i })) }));
  const removedChrome = findChrome(pages);

  // body size = most common size among non-bold text, by characters
  const sizeChars = new Map();
  for (const p of pages) for (const it of p.items) { if (it.bold) continue; const k = Math.round(it.size * 2) / 2; sizeChars.set(k, (sizeChars.get(k) || 0) + it.str.length); }
  const allBold = !sizeChars.size;
  if (allBold) for (const p of pages) for (const it of p.items) { const k = Math.round(it.size * 2) / 2; sizeChars.set(k, (sizeChars.get(k) || 0) + it.str.length); }
  const body = [...sizeChars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 11;

  const words = pages.reduce((n, p) => n + p.items.reduce((m, i) => m + i.str.split(/\s+/).length, 0), 0);
  const landscape = pages.length && pages.filter((p) => p.width > p.height).length > pages.length / 2;
  const kind = landscape && words / Math.max(1, pages.length) < 140 ? 'slides' : 'document';

  const ctx = { bandGap: 1.5 * body, columnPages: new Set(), page: 0 };
  const stats = { headings: 0, lists: 0, tables: 0, figures: 0, links: 0, columnPages: 0, chromeRemoved: removedChrome.length, joinedHyphens: 0 };
  const blocks = []; const images = [];

  const allText = pages.flatMap((p) => p.items.map((i) => i.str)).join(' ');
  const { lang, confident } = detectLanguage(allText);

  for (const page of pages) {
    ctx.page = page.n;
    if (page.n > 1) blocks.push({ type: 'pagebreak', n: page.n });
    const entries = [
      ...page.items.map((i) => ({ kind: 'text', x: i.x, w: i.w, top: i.y - i.size * 0.85, bottom: i.y + i.size * 0.25, item: i })),
      ...page.images.map((im) => ({ kind: 'image', x: im.x, w: im.w, top: im.y, bottom: im.y + im.h, image: im })),
    ];
    const regions = orderRegions(entries, ctx);
    for (const region of regions) regionToBlocks(region, page, blocks, images, { body, stats, kind });
  }
  stats.columnPages = ctx.columnPages.size;

  assignHeadingLevels(blocks, body);
  const h1s = blocks.filter((b) => b.type === 'heading' && b.level === 1);
  const firstH1 = h1s[0];
  const metaTitle = raw.meta.title;
  let title = metaTitle || (firstH1 && runsText(firstH1.runs)) || '';
  let titleSource = metaTitle ? 'metadata' : firstH1 ? 'first heading' : 'filename';
  if (!title) title = filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
  stats.headings = blocks.filter((b) => b.type === 'heading').length;
  stats.lists = blocks.filter((b) => b.type === 'list').length;
  stats.tables = blocks.filter((b) => b.type === 'table').length;
  stats.figures = blocks.filter((b) => b.type === 'figure').length;
  stats.links = blocks.reduce((n, b) => n + countLinks(b), 0);

  // context text for images (heading before + sentence before/after) used by alt-text adapters
  attachContext(blocks, images);

  return { meta: raw.meta, title, titleSource, lang, langConfident: confident, kind, blocks, images, stats, bodySize: body, removedChrome };
}

function countLinks(b) {
  const f = (runs) => runs.filter((r) => r.href).length;
  if (b.runs) return f(b.runs);
  if (b.type === 'list') return b.items.reduce((n, r) => n + f(r), 0);
  if (b.type === 'table') return [...b.header, ...b.rows.flat()].reduce((n, r) => n + f(r), 0);
  return 0;
}

function regionToBlocks(region, page, blocks, images, { body, stats, kind }) {
  const texts = region.filter((e) => e.kind === 'text').map((e) => e.item);
  const lines = buildLines(texts, page.links);
  const imgs = region.filter((e) => e.kind === 'image').map((e) => e.image).sort((a, b) => a.y - b.y);
  // interleave lines and images by vertical position
  const seq = [...lines.map((l) => ({ t: 'line', top: l.y - l.size * 0.85, l })), ...imgs.map((im) => ({ t: 'img', top: im.y, im }))].sort((a, b) => a.top - b.top);

  let i = 0; let prevLine = null; let para = null; let list = null;
  const gaps = lines.slice(1).map((l, k) => l.y - lines[k].y).filter((g) => g > 0);
  const pitch = median(gaps) || body * 1.3;
  const flushList = () => { if (list) { blocks.push(list.block); list = null; } };
  const flushPara = () => { if (para) { blocks.push({ type: 'p', runs: para.runs, page: page.n, size: para.size }); para = null; } };
  const flush = () => { flushPara(); flushList(); };

  while (i < seq.length) {
    const s = seq[i];
    if (s.t === 'img') {
      flush(); prevLine = null;
      const idx = images.length;
      const im = s.im;
      images.push({ id: 'img-' + (idx + 1), index: idx, page: page.n, x: im.x, y: im.y, w: im.w, h: im.h, pw: im.pw, ph: im.ph, png: im.png, hash: im.hash, repeatPages: im.repeatPages, textOpsBefore: im.textOpsBefore, pageW: page.width, pageH: page.height });
      blocks.push({ type: 'figure', image: idx, page: page.n });
      i++; continue;
    }
    const line = s.l;
    const prevGap = prevLine ? line.y - prevLine.y : Infinity;

    // ---- table
    if (line.multi && !line.marker) {
      let j = i; const rows = [];
      const cols = line.textSegs.map((g) => ({ x: g.x, x2: g.x2 }));
      while (j < seq.length && seq[j].t === 'line' && seq[j].l.multi && !seq[j].l.marker) {
        const l = seq[j].l;
        const ok = l.textSegs.every((g) => cols.some((c) => Math.abs(g.x - c.x) < 7 || Math.abs(g.x2 - c.x2) < 7));
        if (!ok) break; rows.push(l); j++;
      }
      if (rows.length >= 3) {
        flush();
        const cell = (l, ci) => { const g = l.textSegs.find((g) => nearestCol(g, cols) === ci); return g ? g.runs : []; };
        const toRuns = (rs) => rs.length ? rs : [{ t: '' }];
        blocks.push({ type: 'table', page: page.n,
          header: cols.map((_, ci) => toRuns(cell(rows[0], ci))),
          rows: rows.slice(1).map((l) => cols.map((_, ci) => toRuns(cell(l, ci)))),
          headerBold: rows[0].bold });
        prevLine = rows.at(-1); i = j; para = null; continue;
      }
    }

    // ---- heading
    const bigJump = line.size >= body * 1.25;
    const boldJump = line.bold && line.size >= body * 1.05;
    const text = norm(runsText(lineRuns(line, true)));
    const short = text.length > 0 && text.length <= 110;
    const isolated = prevGap >= pitch * 1.25;
    const sameSizeBold = line.bold && !boldJump && text.length <= 70 && isolated && !/[.,;]$/.test(text) && !line.multi && !line.marker;
    const headingLike = !line.multi && short && (bigJump || boldJump || sameSizeBold);
    if (headingLike && !(line.marker === 'bullet' && !boldJump && !bigJump)) {
      flush();
      const prev = blocks.at(-1);
      const sameSize = prev && prev.type === 'heading' && Math.abs(prev.size - line.size) < 0.6 && prevLine && prevGap < line.size * 1.5 && prev.page === page.n;
      if (sameSize) { pushRun(prev.runs, ' '); for (const r of lineRuns(line, true)) pushRun(prev.runs, r.t, r.href); }
      else blocks.push({ type: 'heading', runs: lineRuns(line, true), size: Math.round(line.size * 2) / 2, bold: line.bold, sameSizeBold: !bigJump && !boldJump, page: page.n });
      prevLine = line; i++; continue;
    }

    // ---- list
    if (line.marker) {
      const ordered = line.marker === 'ordered' || line.marker === 'ordered-inline';
      const textX = line.textSegs[0]?.x ?? line.x;
      if (!list || list.ordered !== ordered || prevGap > pitch * 1.9) { flush(); list = { ordered, textX, block: { type: 'list', ordered, items: [], page: page.n, start: ordered ? parseInt(line.markerLabel, 10) || 1 : undefined } }; }
      list.block.items.push(lineRuns(line)); list.lastX = textX;
      prevLine = line; i++; continue;
    }
    if (list && line.x >= list.textX - 3 && prevGap <= pitch * 1.35 && line.size <= body * 1.2 && !line.multi) {
      // continuation of previous list item
      const it = list.block.items.at(-1); pushRun(it, ' '); for (const r of lineRuns(line)) pushRun(it, r.t, r.href);
      prevLine = line; i++; continue;
    }

    // ---- caption directly below a figure
    const prevBlock = blocks.at(-1);
    if (prevBlock && prevBlock.type === 'figure' && !para && prevBlock.page === page.n && !prevBlock.caption) {
      const im = images[prevBlock.image]; const dist = (line.y - line.size) - (im.y + im.h);
      const t0 = text;
      if (dist < line.size * 2.2 && line.size <= body * 1.05 && (/^(figure|fig\.|chart|image|photo|table|graph|illustration|source)\b/i.test(t0) || line.italic)) {
        prevBlock.caption = lineRuns(line); prevLine = line; i++; continue;
      }
    }

    // ---- paragraph
    flushList();
    const newPara = !para || prevGap > pitch * 1.45 || Math.abs(para.size - line.size) > 0.6 || para.bold !== line.bold || (line.x - para.x > body * 1.2 && prevGap > pitch * 1.2);
    if (newPara) { flushPara(); para = { runs: [], size: line.size, bold: line.bold, x: line.x }; }
    const lr = lineRuns(line);
    if (para.runs.length) {
      const last = para.runs.at(-1);
      if (/[A-Za-z]-$/.test(last.t) && /^[a-z]/.test(lr[0]?.t || '')) { last.t = last.t.slice(0, -1); stats.joinedHyphens++; }
      else pushRun(para.runs, ' ');
    }
    for (const r of lr) pushRun(para.runs, r.t, r.href);
    prevLine = line; i++;
  }
  flush();
}

function nearestCol(g, cols) {
  let best = 0, d = Infinity;
  cols.forEach((c, k) => { const dd = Math.min(Math.abs(g.x - c.x), Math.abs(g.x2 - c.x2)); if (dd < d) { d = dd; best = k; } });
  return best;
}

function assignHeadingLevels(blocks, body) {
  const hs = blocks.filter((b) => b.type === 'heading');
  if (!hs.length) return;
  // cluster sizes (within 8 %) from largest to smallest; same-size bold headings rank below everything else
  const keyOf = (h) => (h.sameSizeBold ? body - 0.1 : h.size);
  const sizes = [...new Set(hs.map(keyOf))].sort((a, b) => b - a);
  const clusters = [];
  for (const s of sizes) { const c = clusters.at(-1); if (c && s >= c[0] * 0.92) c.push(s); else clusters.push([s]); }
  const rank = (h) => clusters.findIndex((c) => c.includes(keyOf(h))) + 1;
  for (const h of hs) h.level = rank(h);
  // exactly one h1: if the largest style repeats, push everything down one level and let the renderer add the title as h1
  const top = hs.filter((h) => h.level === 1);
  if (top.length > 1) { for (const h of hs) h.level += 1; blocks.titleNeedsH1 = true; }
  // never skip a level when going down
  let prev = blocks.titleNeedsH1 ? 1 : 0;
  for (const h of hs) { if (h.level > prev + 1) h.level = prev + 1; prev = h.level; h.level = Math.min(h.level, 6); }
}

function attachContext(blocks, images) {
  let lastHeading = '';
  const textOf = (b) => (b.runs ? norm(runsText(b.runs)) : '');
  blocks.forEach((b, i) => {
    if (b.type === 'heading') lastHeading = textOf(b);
    if (b.type === 'figure') {
      const im = images[b.image];
      let before = ''; for (let k = i - 1; k >= 0 && k > i - 4; k--) { if (blocks[k].type === 'p') { before = textOf(blocks[k]); break; } if (blocks[k].type === 'heading') break; }
      let after = ''; for (let k = i + 1; k < blocks.length && k < i + 3; k++) { if (blocks[k].type === 'p') { after = textOf(blocks[k]); break; } if (blocks[k].type === 'heading') break; }
      im.context = { heading: lastHeading, before: before.slice(-240), after: after.slice(0, 240), caption: b.caption ? norm(runsText(b.caption)) : '' };
    }
  });
}

export { runsText, GENERIC_LINK };
