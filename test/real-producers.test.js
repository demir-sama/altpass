// PDFs written by other tools than the sample generator (LibreOffice, Chrome). They guard the structure heuristics
// against layouts the pdfkit samples do not have: padded/narrow table cells, centred table headers, long documents.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { processPdf } from '../src/pipeline.js';
import { rulesAdapter } from '../src/alt/index.js';

const run = (n) => processPdf(fs.readFileSync(new URL(`./fixtures/${n}.pdf`, import.meta.url)), { filename: n + '.pdf', adapter: rulesAdapter });

for (const n of ['libreoffice-narrow-table', 'libreoffice-padded-table']) {
  test(`${n}: table with centred header becomes a real table with th scopes`, async () => {
    const r = await run(n); const h = r.render.html;
    assert.equal((h.match(/<table/g) || []).length, 1);
    assert.match(h, /<th scope="col">Item<\/th><th scope="col">Planned<\/th><th scope="col">Actual<\/th>/);
    assert.match(h, /<th scope="row">Staff<\/th><td>120<\/td><td>118<\/td>/);
    assert.deepEqual(r.render.headings.map((x) => x.text), ['Highlights', 'Budget', 'Next steps']);
    assert.equal(r.audit.axe.after.violations.length, 0);
  });
}

test('chrome-document: heading outline and lists are recovered, axe clean', async () => {
  const r = await run('chrome-document');
  const texts = r.render.headings.map((x) => x.text);
  for (const t of ['The Core Journey', 'Look and Feel', 'Features and Behavior', 'Non-Goals']) assert.ok(texts.includes(t), 'missing heading ' + t);
  assert.ok(/<ul>/.test(r.render.html) || /<ol>/.test(r.render.html));
  assert.equal(r.audit.axe.after.violations.length, 0);
  assert.ok(r.audit.score.after > r.audit.score.before);
});
