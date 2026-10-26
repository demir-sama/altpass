import { extractPdf } from './extract.js';
import { inferStructure } from './structure.js';
import { fillAltText, selectAdapter } from './alt/index.js';
import { renderHtml } from './render.js';
import { buildAudit } from './audit.js';
import { runAxe } from './axe.js';
import { naiveHtml, announceOriginal } from './naive.js';
import { AltPassError } from './extract.js';

export async function processPdf(bytes, { filename = 'document.pdf', adapter = selectAdapter(), onStep = () => {} } = {}) {
  onStep('read');
  const raw = await extractPdf(bytes);
  const chars = raw.pages.reduce((n, p) => n + p.items.reduce((m, i) => m + i.str.trim().length, 0), 0);
  if (chars < 20) throw new AltPassError('NO_TEXT', 'This PDF has no selectable text: it looks like a scan. AltPass needs real text to rebuild the structure (OCR is on the roadmap).');
  onStep('structure');
  const doc = inferStructure(raw, { filename });
  onStep('alt');
  await fillAltText(doc, adapter);
  const result = { filename, raw, doc };
  await renderAndAudit(result, { onStep });
  result.transcript = announceOriginal(raw);
  return result;
}

// Re-render after alt-text edits (cheap: no PDF parsing).
export async function renderAndAudit(result, { onStep = () => {} } = {}) {
  onStep('render');
  const render = renderHtml(result.doc, { filename: result.filename });
  onStep('axe');
  const axeAfter = await runAxe(render.html);
  result.naive ??= naiveHtml(result.raw);
  result.axeBefore ??= await runAxe(result.naive);
  result.render = render;
  result.audit = buildAudit({ raw: result.raw, doc: result.doc, render, axeAfter, axeBefore: result.axeBefore });
  return result;
}
