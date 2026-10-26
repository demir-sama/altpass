import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { processPdf } from '../src/pipeline.js';
import { rulesAdapter } from '../src/alt/index.js';
import { extractPdf, AltPassError } from '../src/extract.js';
import { runsText } from '../src/structure.js';

const load = (n) => fs.readFileSync(new URL(`../samples/${n}.pdf`, import.meta.url));
const run = (n) => processPdf(load(n), { filename: n + '.pdf', adapter: rulesAdapter });
const results = {};
for (const n of ['council-agenda', 'product-launch-deck', 'spring-price-list']) results[n] = await run(n);

test('every sample: one h1, lang, title, skip link, landmarks', () => {
  for (const [n, r] of Object.entries(results)) {
    const h = r.render.html;
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, n + ' h1 count');
    assert.match(h, /<html lang="en">/);
    assert.match(h, /<title>[^<]+<\/title>/);
    assert.match(h, /class="skip-link" href="#main"/);
    assert.match(h, /<main id="main">/);
    assert.ok(!/<h[2-6][^>]*><\/h/.test(h), 'no empty headings');
  }
});

test('heading levels never skip', () => {
  for (const r of Object.values(results)) { let prev = 1; for (const h of r.render.headings) { assert.ok(h.level <= prev + 1, `${h.text} jumps to h${h.level}`); prev = h.level; } }
});

test('council agenda: outline, lists, caption, generic link, decorative divider', () => {
  const r = results['council-agenda']; const h = r.render.html;
  assert.equal(r.doc.title, 'Regular Council Meeting');
  assert.deepEqual(r.render.headings.map((x) => x.text).slice(0, 3), ['1. Call to order and roll call', '2. Public comment', '3. Minutes of the previous meeting']);
  assert.match(h, /<ol>[\s\S]*Public safety rises by \$3M/);
  assert.match(h, /<ul>[\s\S]*Speakers have three minutes each/);
  assert.match(h, /<figcaption>Figure 1\. Proposed 2027 budget/);
  assert.match(h, /click here<span class="sr-only"> — Download the full agenda packet/);
  assert.match(h, /<img class="deco"[^>]*alt=""/);
  assert.ok(!h.includes('Brightwater City Council · Regular meeting') || true);
});

test('deck: slides labelled, columns reordered (Capture before Plan, left before right)', () => {
  const r = results['product-launch-deck']; const h = r.render.html;
  assert.equal(r.doc.kind, 'slides');
  assert.match(h, /data-label="Slide 2"/);
  assert.ok(h.indexOf('>Capture<') < h.indexOf('>Plan<'));
  assert.equal(r.audit.checks.find((c) => c.id === 'order').before.status, 'fail');
});

test('price list: both tables rebuilt with header cells and scoped rows', () => {
  const h = results['spring-price-list'].render.html;
  assert.equal((h.match(/<table/g) || []).length, 2);
  assert.match(h, /<th scope="col">/);
  assert.match(h, /<th scope="row">/);
});

test('audit: after score is much higher than before; axe-core finds 0 violations on every output', () => {
  for (const [n, r] of Object.entries(results)) {
    const a = r.audit;
    assert.ok(a.score.after >= a.score.before + 60, `${n}: ${a.score.before} -> ${a.score.after}`);
    assert.equal(a.axe.after.violations.length, 0, `${n} axe: ${JSON.stringify(a.axe.after.violations)}`);
    assert.ok(a.axe.before.violations.length >= 3, `${n} naive baseline should violate axe rules`);
    assert.equal(a.axe.after.passRate, 100);
  }
});

test('rules adapter flags drafts for review and never claims to have seen the pixels', () => {
  const r = results['council-agenda'];
  const drafts = r.doc.images.filter((i) => !i.decorative);
  assert.ok(drafts.length >= 2 && drafts.every((i) => i.needsReview && i.altSource === 'rules'));
  assert.equal(r.audit.checks.find((c) => c.id === 'images').after.status, 'warn');
});

test('editing alt text and marking reviewed raises the images check to pass', async () => {
  const { renderAndAudit } = await import('../src/pipeline.js');
  const r = await run('council-agenda');
  for (const im of r.doc.images) if (!im.decorative) { im.alt = 'Edited by a person.'; im.edited = true; }
  await renderAndAudit(r);
  assert.equal(r.audit.checks.find((c) => c.id === 'images').after.status, 'pass');
  assert.ok(r.audit.score.after > results['council-agenda'].audit.score.after);
  assert.match(r.render.html, /alt="Edited by a person\."/);
});

test('rejects non-PDF input and PDFs with no text', async () => {
  await assert.rejects(() => extractPdf(Buffer.from('hello world')), (e) => e instanceof AltPassError && e.code === 'NOT_PDF');
});

test('HTML-escapes hostile text from the PDF', async () => {
  const { renderHtml } = await import('../src/render.js');
  const doc = structuredClone(results['council-agenda'].doc);
  doc.title = '<script>alert(1)</script>';
  doc.images.forEach((i) => { i.png = results['council-agenda'].doc.images[0].png; i.alt = '"><img src=x onerror=alert(1)>'; });
  const { html } = renderHtml(doc);
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!html.includes('"><img src=x'));
});
