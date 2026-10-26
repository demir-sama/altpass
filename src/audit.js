// Accessibility checks on the ORIGINAL PDF and on the rebuilt HTML, plus the weighted score.
import { GENERIC_LINK, runsText } from './structure.js';
import { langName } from './render.js';

const PASS = 'pass', WARN = 'warn', FAIL = 'fail', NA = 'na';
const POINTS = { pass: 1, warn: 0.6, fail: 0 };
export const WEIGHTS = { structure: 12, title: 8, language: 8, headings: 14, order: 12, images: 14, lists: 6, tables: 8, links: 6, furniture: 4, navigation: 4, reflow: 4 };

export function score(checks, side) {
  let got = 0, max = 0;
  for (const c of checks) { const s = c[side].status; if (s === NA) continue; max += c.weight; got += c.weight * POINTS[s]; }
  return max ? Math.round((got / max) * 100) : 100;
}

export function buildAudit({ raw, doc, render, axeAfter, axeBefore }) {
  const m = raw.meta, st = doc.stats;
  const untagged = !m.tagged;
  const unit = doc.kind === 'slides' ? 'slides' : 'pages';
  const imgs = doc.images; const nonDeco = imgs.filter((i) => !i.decorative);
  const drafts = nonDeco.filter((i) => i.needsReview && !i.edited);
  const links = []; const collect = (runs) => runs.forEach((r) => r.href && links.push(r));
  for (const b of doc.blocks) { if (b.runs) collect(b.runs); if (b.type === 'list') b.items.forEach(collect); if (b.type === 'table') [...b.header, ...b.rows.flat()].forEach(collect); if (b.caption) collect(b.caption); }
  const generic = links.filter((l) => GENERIC_LINK.test(l.t.trim()));
  const hs = render.headings;
  let prev = 1, skips = 0; for (const h of hs) { if (h.level > prev + 1) skips++; prev = h.level; }

  const checks = [];
  const add = (id, title, wcag, before, after, extra = {}) => checks.push({ id, title, wcag, weight: WEIGHTS[id], before, after, ...extra });

  add('structure', 'Tagged document structure', '1.3.1 · PDF/UA',
    m.tagged ? { status: PASS, detail: 'The PDF carries a tag tree.' } : { status: FAIL, detail: 'Untagged PDF: assistive technology receives a flat stream of text with no structure.' },
    { status: PASS, detail: 'Semantic HTML5: header, nav, main, footer, headings, lists, tables, figures.' },
    { fixed: 'Rebuilt as semantic HTML with landmarks.' });

  add('title', 'Document title', '2.4.2',
    m.title ? { status: PASS, detail: `Title set: “${m.title}”.` } : { status: FAIL, detail: 'No title in the PDF metadata: screen readers announce the file name.' },
    { status: PASS, detail: `<title> set from ${doc.titleSource}: “${doc.title}”.` }, { fixed: `Added a document title (“${doc.title}”).` });

  add('language', 'Document language', '3.1.1',
    m.lang ? { status: PASS, detail: `Language: ${m.lang}.` } : { status: FAIL, detail: 'No language set: screen readers use the wrong pronunciation rules.' },
    doc.langConfident ? { status: PASS, detail: `lang="${doc.lang}" (${langName(doc.lang)}), detected from the text.` } : { status: m.lang ? PASS : WARN, detail: `lang="${doc.lang}" assumed (text too short to detect): please confirm.` },
    { fixed: `Set the page language to ${langName(doc.lang)}.` });

  add('headings', 'Headings and outline', '1.3.1 · 2.4.6',
    st.headings === 0 ? { status: WARN, detail: 'No headings could be identified from the layout.' }
      : m.tagged ? { status: PASS, detail: 'Tagged.' }
      : { status: FAIL, detail: `${st.headings} visual headings, but none are marked up: nobody can jump between sections.` },
    st.headings === 0 ? { status: WARN, detail: 'No headings found; the page has only a title.' }
      : { status: skips ? WARN : PASS, detail: `${hs.length + 1} headings (one h1, no skipped levels${skips ? ` — ${skips} skip(s) remain` : ''}) inferred from font size and weight.` },
    { fixed: `Marked up ${st.headings} headings in a valid outline.` });

  add('order', 'Reading order', '1.3.2',
    m.tagged ? { status: PASS, detail: 'Tagged order.' }
      : st.columnPages ? { status: FAIL, detail: `${st.columnPages} ${unit === 'slides' ? 'slide' : 'page'}${st.columnPages === 1 ? '' : 's'} with columns/side-by-side content: untagged order can interleave or reverse them.` }
      : { status: WARN, detail: 'No explicit reading order: relies on the order the text was drawn.' },
    { status: PASS, detail: st.columnPages ? `Columns detected and read left to right, top to bottom (${st.columnPages} ${unit}).` : 'Content read top to bottom in DOM order.' },
    { fixed: st.columnPages ? `Reordered ${st.columnPages} multi-column ${unit}.` : 'Set an explicit reading order.' });

  add('images', 'Images have text alternatives', '1.1.1',
    imgs.length === 0 ? { status: NA, detail: 'No images.' } : { status: FAIL, detail: `${imgs.length} image${imgs.length === 1 ? '' : 's'} without alternative text.` },
    imgs.length === 0 ? { status: NA, detail: 'No images.' }
      : drafts.length ? { status: WARN, detail: `${nonDeco.length - drafts.length} of ${nonDeco.length} described; ${drafts.length} machine-drafted ${drafts.length === 1 ? 'description needs' : 'descriptions need'} a human check.${imgs.length - nonDeco.length ? ` ${imgs.length - nonDeco.length} decorative hidden.` : ''}` }
      : { status: PASS, detail: `All ${nonDeco.length} images described${imgs.length - nonDeco.length ? `; ${imgs.length - nonDeco.length} decorative hidden` : ''}.` },
    { fixed: `Drafted alt text for ${nonDeco.length} image${nonDeco.length === 1 ? '' : 's'}${imgs.length - nonDeco.length ? ` and hid ${imgs.length - nonDeco.length} decorative` : ''}.` });

  add('lists', 'Real lists', '1.3.1',
    st.lists === 0 ? { status: NA, detail: 'No lists.' } : m.tagged ? { status: PASS, detail: 'Tagged.' } : { status: FAIL, detail: `${st.lists} list${st.lists === 1 ? '' : 's'} made of typed bullets or numbers: read as plain text.` },
    st.lists === 0 ? { status: NA, detail: 'No lists.' } : { status: PASS, detail: `${st.lists} proper <ul>/<ol> list${st.lists === 1 ? '' : 's'}.` },
    { fixed: `Converted ${st.lists} list${st.lists === 1 ? '' : 's'} to real list markup.` });

  add('tables', 'Table headers', '1.3.1',
    st.tables === 0 ? { status: NA, detail: 'No tables.' } : m.tagged ? { status: PASS, detail: 'Tagged.' } : { status: FAIL, detail: `${st.tables} table${st.tables === 1 ? '' : 's'} drawn as aligned text: cells are read as one long line.` },
    st.tables === 0 ? { status: NA, detail: 'No tables.' } : { status: PASS, detail: `${st.tables} real <table>${st.tables === 1 ? '' : 's'} with column${''} header cells (scope).` },
    { fixed: `Rebuilt ${st.tables} table${st.tables === 1 ? '' : 's'} with header cells.` });

  add('links', 'Link purpose', '2.4.4',
    links.length === 0 ? { status: NA, detail: 'No links.' } : generic.length ? { status: FAIL, detail: `${generic.length} link${generic.length === 1 ? '' : 's'} with vague text (“${generic[0].t.trim()}”).` } : { status: PASS, detail: `${links.length} descriptive link${links.length === 1 ? '' : 's'}.` },
    links.length === 0 ? { status: NA, detail: 'No links.' } : { status: PASS, detail: `${links.length} link${links.length === 1 ? '' : 's'}${render.renderStats.linksImproved ? `; ${render.renderStats.linksImproved} given a descriptive accessible name` : ''}.` },
    { fixed: `Gave ${render.renderStats.linksImproved || 0} vague link${render.renderStats.linksImproved === 1 ? '' : 's'} a descriptive name.` });

  add('furniture', 'Page furniture (running headers, footers, page numbers)', '1.3.2 (best practice)',
    st.chromeRemoved ? { status: WARN, detail: `${st.chromeRemoved} repeated header/footer lines are read on every ${unit === 'slides' ? 'slide' : 'page'}.` } : { status: PASS, detail: 'None repeated.' },
    { status: PASS, detail: st.chromeRemoved ? `Removed ${st.chromeRemoved} repeated lines; page breaks are labelled instead.` : 'Nothing to remove.' },
    { fixed: `Removed ${st.chromeRemoved} repeated header/footer lines.` });

  const navNeeded = m.pageCount >= 3;
  add('navigation', 'Ways to navigate', '2.4.1 · 2.4.5',
    m.hasOutline ? { status: PASS, detail: 'Bookmarks present.' } : navNeeded ? { status: FAIL, detail: `${m.pageCount} ${unit} and no bookmarks.` } : { status: NA, detail: 'Short document.' },
    { status: PASS, detail: `Skip link${hs.length >= 3 ? ', table of contents' : ''}, landmarks and heading navigation.` },
    { fixed: 'Added a skip link, landmarks and a table of contents.' });

  add('reflow', 'Reflow and readable text', '1.4.10 · 1.4.12',
    { status: FAIL, detail: 'Fixed page layout: zooming to 400 % forces two-dimensional scrolling on small screens.' },
    { status: PASS, detail: 'Responsive layout, relative units, 4.5:1+ contrast, dark mode.' },
    { fixed: 'Reflowing layout with accessible typography.' });

  const before = score(checks, 'before'), after = score(checks, 'after');
  const fixes = checks.filter((c) => c.before.status !== PASS && c.before.status !== NA && (c.after.status === PASS || c.after.status === WARN))
    .map((c) => ({ id: c.id, title: c.title, wcag: c.wcag, before: c.before.detail, after: c.after.detail, summary: c.fixed, status: c.after.status }));

  const review = [];
  for (const im of nonDeco) if (im.needsReview && !im.edited) review.push({ type: 'alt', id: im.id, page: im.page, text: `Check the drafted description of the image on ${doc.kind === 'slides' ? 'slide' : 'page'} ${im.page}.` });
  if (!doc.langConfident && !m.lang) review.push({ type: 'language', text: 'Confirm the document language (not enough text to detect it).' });
  if (hs.length) review.push({ type: 'headings', text: 'Heading levels were inferred from font size and weight. Skim the outline to confirm it matches the intended structure.' });
  if (st.tables) review.push({ type: 'tables', text: 'The first row of each table was treated as the header row.' });
  if (doc.meta.truncated) review.push({ type: 'truncated', text: `Only the first ${doc.meta.pagesRead} of ${doc.meta.pageCount} pages were processed.` });
  review.push({ type: 'contrast', text: 'Colour contrast of the original PDF was not assessed; the new HTML uses a tested palette.' });

  const gain = Math.max(0, after - before);
  return {
    score: { before, after, gain },
    axe: { before: axeBefore, after: axeAfter },
    checks, fixes, review,
    counts: { issuesFixed: fixes.length, toReview: review.filter((r) => r.type !== 'contrast').length, imagesDrafted: drafts.length },
  };
}

export { PASS, WARN, FAIL, NA };
