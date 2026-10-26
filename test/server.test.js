import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/server.js';
import { rulesAdapter } from '../src/alt/index.js';

let server, base;
test.before(async () => { server = createApp({ adapter: () => rulesAdapter }).listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

const post = (url, init) => fetch(base + url, { method: 'POST', ...init });
const upload = (bytes, name = 'x.pdf') => { const fd = new FormData(); fd.append('file', new Blob([bytes], { type: 'application/pdf' }), name); return post('/api/audit', { body: fd }); };

test('sample audit returns scores, outline, images and URLs; downstream routes work', async () => {
  const res = await post('/api/samples/council-agenda'); assert.equal(res.status, 200);
  const r = await res.json();
  assert.equal(r.title, 'Regular Council Meeting'); assert.ok(r.audit.score.after > r.audit.score.before + 60);
  assert.equal(r.audit.axe.after.violations.length, 0); assert.equal(r.images.length, 3);
  const html = await fetch(base + r.urls.html); assert.match(html.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(await html.text(), /<html lang="en">/);
  const dl = await fetch(base + r.urls.html + '?download=1'); assert.match(dl.headers.get('content-disposition'), /attachment; filename="council-agenda\.accessible\.html"/);
  const pdf = await fetch(base + r.urls.pdf); assert.equal(pdf.headers.get('content-type'), 'application/pdf'); assert.equal((await pdf.arrayBuffer()).byteLength, fs.statSync('samples/council-agenda.pdf').size);
  const json = await (await fetch(base + r.urls.json)).json(); assert.equal(json.tool, 'AltPass'); assert.ok(json.disclaimer);
  const img = await fetch(base + r.images[0].url); assert.equal(img.headers.get('content-type'), 'image/png');
});

test('PUT alt updates the html, marks reviewed and raises the score', async () => {
  const r = await (await post('/api/samples/council-agenda')).json();
  const real = r.images.filter((i) => !i.decorative);
  const res = await fetch(base + `/api/results/${r.id}/alt`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edits: real.map((i) => ({ id: i.id, alt: 'Reviewed by Amara.', decorative: false })) }) });
  const j = await res.json(); assert.equal(res.status, 200);
  assert.ok(j.audit.score.after > r.audit.score.after); assert.equal(j.audit.counts.imagesDrafted, 0);
  assert.match(await (await fetch(base + j.urls.html)).text(), /alt="Reviewed by Amara\."/);
  assert.equal(j.rev, 2);
});

test('PUT alt validates input', async () => {
  const r = await (await post('/api/samples/spring-price-list')).json();
  const put = (body) => fetch(base + `/api/results/${r.id}/alt`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put({})).status, 400);
  assert.equal((await put({ edits: [{ id: 'nope', alt: 'x' }] })).status, 400);
  assert.equal((await put({ edits: [{ id: r.images[0].id, alt: 42 }] })).status, 400);
});

test('errors are explicit: not a PDF, no file, unknown sample, expired result', async () => {
  let res = await upload(Buffer.from('this is not a pdf'), 'x.pdf'); assert.equal(res.status, 422); assert.equal((await res.json()).error.code, 'NOT_PDF');
  res = await post('/api/audit', { body: new FormData() }); assert.equal(res.status, 400);
  res = await post('/api/samples/nope'); assert.equal(res.status, 404);
  res = await fetch(base + '/api/results/00000000-0000-0000-0000-000000000000/accessible.html'); assert.equal(res.status, 404); assert.equal((await res.json()).error.code, 'EXPIRED');
});

test('uploads over the size limit are rejected with a clear message', async () => {
  const big = Buffer.alloc(16 * 1024 * 1024, 0x20); big.write('%PDF-1.4');
  const res = await upload(big, 'big.pdf'); assert.equal(res.status, 413); assert.match((await res.json()).error.message, /15 MB/);
});

test('ndjson streaming reports steps then a result', async () => {
  const res = await post('/api/samples/product-launch-deck', { headers: { accept: 'application/x-ndjson' } });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.filter((l) => l.step).map((l) => l.step), ['read', 'read', 'structure', 'alt', 'render', 'axe']);
  assert.ok(lines.at(-1).result.audit.score.after > 80);
});

test('uploading a user-supplied PDF works end to end', async () => {
  const res = await upload(fs.readFileSync('samples/spring-price-list.pdf'), 'my list (final).pdf'); const r = await res.json();
  assert.equal(res.status, 200); assert.equal(r.filename, 'my list (final).pdf'); assert.equal(r.pages, 2);
});
