// Renders the block list as a standalone, accessible HTML document.
import { runsText, GENERIC_LINK, norm } from './structure.js';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LANG_NAME = { en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch' };
export const langName = (l) => LANG_NAME[l] || l;
const slug = (s) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'section';

export const DOC_CSS = `
:root{--bg:#fdfcf9;--ink:#15171c;--muted:#4a505c;--rule:#dcd7cc;--accent:#0b4fb3;--accent-ink:#fff;--band:#f3efe6;--mark:#fff3c4;--focus:#b34700;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--ink:#f1efe9;--muted:#b7bcc7;--rule:#363a43;--accent:#8ab4ff;--accent-ink:#0b1220;--band:#1d2027;--mark:#4a3d12;--focus:#ffb066}}
*{box-sizing:border-box}
html{font-size:100%;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:1.0625rem/1.7 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.skip-link{position:absolute;left:1rem;top:-4rem;background:var(--accent);color:var(--accent-ink);padding:.6rem 1rem;border-radius:.5rem;font-weight:600;z-index:10;text-decoration:none}
.skip-link:focus{top:1rem}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:2px}
.doc-header{background:var(--band);border-bottom:1px solid var(--rule);padding:clamp(1.5rem,5vw,3.5rem) 1.25rem 1.5rem}
.doc-header>*{max-width:44rem;margin-inline:auto}
.eyebrow{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:0 0 .75rem}
h1,h2,h3,h4,h5,h6{font-family:ui-serif,Georgia,"Iowan Old Style","Times New Roman",serif;line-height:1.2;letter-spacing:-.01em;margin:2.2em 0 .5em;text-wrap:balance;scroll-margin-top:1rem}
h1{font-size:clamp(2rem,5.5vw,3rem);margin:0;font-weight:700}
h2{font-size:1.65rem}h3{font-size:1.3rem}h4,h5,h6{font-size:1.1rem}
.meta{color:var(--muted);font-size:.95rem;margin:.9rem auto 0}
.toc{max-width:44rem;margin:1.5rem auto 0;padding:0 1.25rem}
.toc details{border:1px solid var(--rule);border-radius:.75rem;padding:.25rem 1rem;background:var(--bg)}
.toc summary{cursor:pointer;font-weight:600;padding:.6rem 0}
.toc ol{margin:0 0 .75rem;padding-left:1.25rem}.toc ol ol{margin:.25rem 0}
.toc a{color:var(--accent)}
main{max-width:44rem;margin:0 auto;padding:.5rem 1.25rem 3rem}
main>:first-child{margin-top:1.5rem}
p{margin:0 0 1.1em;hyphens:auto;overflow-wrap:break-word}
ul,ol{margin:0 0 1.2em;padding-left:1.5rem}li{margin:.3em 0;padding-left:.2em}
a{color:var(--accent);text-decoration-thickness:.08em;text-underline-offset:.18em}
a:hover{text-decoration-thickness:.16em}
figure{margin:1.8rem 0;padding:0}
figure img{display:block;max-width:100%;height:auto;border-radius:.6rem;border:1px solid var(--rule);background:#fff}
figcaption{margin-top:.6rem;font-size:.92rem;color:var(--muted)}
img.deco{display:none}
.table-wrap{overflow-x:auto;margin:1.5rem 0;border:1px solid var(--rule);border-radius:.6rem}
table{border-collapse:collapse;width:100%;min-width:20rem;font-size:.98rem}
caption{caption-side:top;text-align:left;font-weight:600;padding:.75rem 1rem;color:var(--muted)}
th,td{padding:.65rem 1rem;text-align:left;border-bottom:1px solid var(--rule);vertical-align:top}
thead th{background:var(--band);font-weight:700}
tbody tr:last-child>*{border-bottom:0}
tbody th{font-weight:600}
hr.page-break{border:0;border-top:1px dashed var(--rule);margin:2.75rem 0 1rem;height:0;overflow:visible;position:relative}
hr.page-break::after{content:attr(data-label);position:absolute;right:0;top:-.8em;background:var(--bg);color:var(--muted);font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;padding-left:.6rem}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.doc-footer{max-width:44rem;margin:0 auto;padding:1.5rem 1.25rem 3rem;border-top:1px solid var(--rule);color:var(--muted);font-size:.9rem}
.doc-footer p{margin:0 0 .5em}
@media (max-width:30rem){body{font-size:1rem}.table-wrap{margin-inline:-.25rem}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
@media print{.skip-link,.toc{display:none}body{background:#fff;color:#000}}
`;

function inlineRuns(runs, { fixLinks = true, stats } = {}) {
  let out = '';
  runs.forEach((r, i) => {
    if (!r.href) { out += esc(r.t); return; }
    const label = r.t.trim();
    if (fixLinks && GENERIC_LINK.test(label)) {
      let before = runs.slice(0, i).map((x) => x.t).join('').trim().replace(/[:,;\s–—-]+$/, '');
      before = before.split(/(?<=[.!?])\s+/).pop().trim();
      let host = ''; try { host = new URL(r.href).host; } catch { /* ignore */ }
      const hint = before && before.length <= 140 ? before : host;
      if (stats) stats.linksImproved = (stats.linksImproved || 0) + 1;
      out += `<a href="${esc(r.href)}">${esc(r.t)}${hint ? `<span class="sr-only"> — ${esc(hint)}</span>` : ''}</a>`;
    } else out += `<a href="${esc(r.href)}">${esc(r.t)}</a>`;
  });
  return out;
}

export function renderHtml(doc, { filename = 'document.pdf', generatedAt = new Date() } = {}) {
  const stats = { linksImproved: 0 };
  const lang = doc.lang || 'en';
  const unit = doc.kind === 'slides' ? 'Slide' : 'Page';
  const blocks = doc.blocks.filter(Boolean);
  const firstH1Idx = blocks.findIndex((b) => b.type === 'heading' && b.level === 1);
  const h1Text = firstH1Idx >= 0 ? runsText(blocks[firstH1Idx].runs) : doc.title;
  const body = blocks.filter((_, i) => i !== firstH1Idx);

  const headings = []; const used = new Set();
  const idFor = (text) => { let id = slug(text), n = 2; while (used.has(id)) id = `${slug(text)}-${n++}`; used.add(id); return id; };
  for (const b of body) if (b.type === 'heading') { b.id = idFor(runsText(b.runs)); headings.push(b); }

  let main = ''; let lastHeadingId = null;
  const renderTableCell = (cellRuns) => inlineRuns(cellRuns, { stats });
  for (let bi = 0; bi < body.length; bi++) {
    const b = body[bi];
    switch (b.type) {
      case 'heading': {
        const lvl = Math.min(Math.max(b.level, 2), 6);
        main += `<h${lvl} id="${b.id}">${inlineRuns(b.runs, { fixLinks: false })}</h${lvl}>\n`; lastHeadingId = b.id; break;
      }
      case 'p': main += `<p>${inlineRuns(b.runs, { stats })}</p>\n`; break;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        main += `<${tag}${b.ordered && b.start > 1 ? ` start="${b.start}"` : ''}>\n${b.items.map((it) => `  <li>${inlineRuns(it, { stats })}</li>`).join('\n')}\n</${tag}>\n`; break;
      }
      case 'table': {
        const labelled = body[bi - 1]?.type === 'heading' ? body[bi - 1].id : null;
        const rowHeaders = b.rows.length && b.rows.every((r) => !/^[\s€$£¥]?[\d.,%+\-–]+\s*[%A-Za-z]{0,3}$/.test(runsText(r[0]).trim())) && b.header.length > 1;
        const head = `<thead><tr>${b.header.map((c) => `<th scope="col">${renderTableCell(c)}</th>`).join('')}</tr></thead>`;
        const rows = b.rows.map((r) => `<tr>${r.map((c, ci) => (ci === 0 && rowHeaders ? `<th scope="row">${renderTableCell(c)}</th>` : `<td>${renderTableCell(c)}</td>`)).join('')}</tr>`).join('\n');
        const label = labelled ? ` aria-labelledby="${labelled}"` : ` aria-label="Table"`;
        main += `<div class="table-wrap" role="region"${labelled ? ` aria-labelledby="${labelled}"` : ' aria-label="Table"'} tabindex="0">\n<table${label}>\n${head}\n<tbody>\n${rows}\n</tbody>\n</table>\n</div>\n`; break;
      }
      case 'figure': {
        const im = doc.images[b.image];
        const src = im.png ? `data:image/png;base64,${im.png.toString('base64')}` : '';
        const dims = (im.pw && im.ph ? ` width="${im.pw}" height="${im.ph}"` : '') + (im.w ? ` style="max-width:min(100%,${Math.round(im.w * 1.34)}px)"` : '');
        if (im.decorative) { main += `<img class="deco" src="${src}" alt=""${dims}>\n`; break; }
        main += `<figure id="${im.id}">\n  <img src="${src}" alt="${esc(im.alt || '')}"${dims} loading="lazy">\n${b.caption ? `  <figcaption>${inlineRuns(b.caption, { stats })}</figcaption>\n` : ''}</figure>\n`; break;
      }
      case 'pagebreak': main += `<hr class="page-break" role="doc-pagebreak" aria-label="${unit} ${b.n}" data-label="${unit} ${b.n}">\n`; break;
      default: break;
    }
  }

  const toc = headings.length >= 3 ? (() => {
    let html = '<ol>'; let depth = 2; const stack = [];
    for (const h of headings) {
      const l = Math.min(Math.max(h.level, 2), 4);
      while (depth < l) { html += '<ol>'; depth++; stack.push(1); }
      while (depth > l) { html += '</ol>'; depth--; }
      html += `<li><a href="#${h.id}">${esc(runsText(h.runs))}</a></li>`;
    }
    while (depth > 2) { html += '</ol>'; depth--; }
    return html + '</ol>';
  })() : '';

  const draftCount = doc.images.filter((i) => i.needsReview && !i.edited && !i.decorative).length;
  const metaBits = [`${doc.meta.pagesRead} ${unit.toLowerCase()}${doc.meta.pagesRead === 1 ? '' : 's'}`, `Language: ${langName(lang)}`];
  const html = `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<meta name="generator" content="AltPass">
<meta name="description" content="Accessible HTML version of ${esc(filename)}">
<style>${DOC_CSS}</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="doc-header">
  <p class="eyebrow">Accessible version</p>
  <h1>${esc(h1Text)}</h1>
  <p class="meta">${esc(metaBits.join(' · '))}</p>
</header>
${toc ? `<nav class="toc" aria-label="Table of contents"><details><summary>Contents</summary>${toc}</details></nav>\n` : ''}<main id="main">
${main}</main>
<footer class="doc-footer">
  <p>Converted from <strong>${esc(filename)}</strong> by AltPass on ${esc(generatedAt.toISOString().slice(0, 10))}. Structure (headings, lists, tables, reading order) was inferred from the PDF's layout.</p>
  ${draftCount ? `<p>${draftCount} image description${draftCount === 1 ? ' is a' : 's are'} machine-drafted and should be reviewed by a person before this document is published.</p>` : ''}
</footer>
</body>
</html>
`;
  return { html, renderStats: stats, headings: headings.map((h) => ({ level: Math.min(Math.max(h.level, 2), 6), text: runsText(h.runs), id: h.id })), h1: h1Text };
}
