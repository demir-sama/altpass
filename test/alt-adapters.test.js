import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { extractPdf } from '../src/extract.js';
import { inferStructure } from '../src/structure.js';
import { fillAltText, selectAdapter, rulesAdapter } from '../src/alt/index.js';
import { openaiAdapter } from '../src/alt/openai.js';
import { anthropicAdapter } from '../src/alt/anthropic.js';
import { parseReply } from '../src/alt/llm-common.js';
import { describeWithRules } from '../src/alt/rules.js';

// A tiny mock of both vendors' APIs. This proves the request/response plumbing only: it is NOT a live provider test.
function mock(handler) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const body = JSON.parse(b); seen.push({ url: req.url, headers: req.headers, body }); const [code, out] = handler(req.url, body, seen.length); res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ seen, url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}
const freshDoc = async () => inferStructure(await extractPdf(fs.readFileSync(new URL('../samples/council-agenda.pdf', import.meta.url))), { filename: 'c.pdf' });

test('OpenAI-compatible adapter sends data-URI image + context, parses JSON reply', async () => {
  const m = await mock(() => [200, { choices: [{ message: { content: '```json\n{"alt":"Bar chart of the budget; public safety is largest at $46M.","decorative":false}\n```' } }] }]);
  const doc = await freshDoc();
  await fillAltText(doc, openaiAdapter({ apiKey: 'test-key', baseUrl: m.url + '/v1', model: 'mock-vision' }));
  m.close();
  const chart = doc.images.find((i) => i.alt.includes('public safety'));
  assert.ok(chart, 'LLM text used'); assert.equal(chart.altSource, 'llm:mock-vision'); assert.ok(chart.needsReview);
  const req = m.seen[0];
  assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.headers.authorization, 'Bearer test-key');
  const parts = req.body.messages[1].content;
  assert.match(parts[1].image_url.url, /^data:image\/png;base64,/);
  assert.ok(m.seen.some((r) => /Proposed 2027 budget/.test(r.body.messages[1].content[0].text)), 'caption sent as context');
  // obviously decorative divider is decided by rules without spending an LLM call
  assert.ok(doc.images.some((i) => i.decorative && i.altSource === 'rules'));
  assert.equal(m.seen.length, doc.images.filter((i) => !i.decorative).length);
});

test('Anthropic adapter uses x-api-key + base64 image block', async () => {
  const m = await mock(() => [200, { content: [{ type: 'text', text: '{"alt":"City seal.","decorative":false}' }] }]);
  const doc = await freshDoc();
  await fillAltText(doc, anthropicAdapter({ apiKey: 'k', baseUrl: m.url, model: 'mock' }));
  m.close();
  assert.equal(m.seen[0].url, '/v1/messages'); assert.equal(m.seen[0].headers['x-api-key'], 'k');
  assert.equal(m.seen[0].body.messages[0].content[0].source.type, 'base64');
  assert.ok(doc.images.some((i) => i.alt === 'City seal.'));
});

test('a failing LLM call falls back to rules per image and is reported', async () => {
  const m = await mock((_u, _b, n) => (n === 1 ? [500, { error: 'boom' }] : [200, { choices: [{ message: { content: 'A plain text answer.' } }] }]));
  const doc = await freshDoc();
  await fillAltText(doc, openaiAdapter({ apiKey: 'k', baseUrl: m.url, model: 'mock' }), { concurrency: 1 });
  m.close();
  assert.equal(doc.altAdapter.errors.length, 1);
  assert.ok(doc.images.some((i) => /fallback/.test(i.altSource)));
  assert.ok(doc.images.some((i) => i.alt === 'A plain text answer.'));
  assert.ok(doc.images.every((i) => i.decorative || i.alt.length > 0));
});

test('adapter selection from the environment', () => {
  assert.equal(selectAdapter({}).id, 'rules');
  assert.equal(selectAdapter({ OPENAI_API_KEY: 'x' }).id, 'openai');
  assert.equal(selectAdapter({ ANTHROPIC_API_KEY: 'x' }).id, 'anthropic');
  assert.equal(selectAdapter({ OPENAI_API_KEY: 'x', ALTPASS_LLM: 'rules' }).id, 'rules');
  assert.equal(selectAdapter({ OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y', ALTPASS_LLM: 'anthropic' }).id, 'anthropic');
});

test('parseReply is lenient about formatting', () => {
  assert.deepEqual(parseReply('{"alt":"x","decorative":true}'), { alt: 'x', decorative: true });
  assert.equal(parseReply('Just words.').alt, 'Just words.');
  assert.throws(() => parseReply(''));
});

test('rules: thin lines are decorative, captions win, small shapes are logos', () => {
  assert.equal(describeWithRules({ w: 400, h: 3, page: 1 }).decorative, true);
  assert.equal(describeWithRules({ w: 60, h: 60, page: 1 }, { org: 'Acme' }).alt, 'Logo or emblem of Acme');
  assert.match(describeWithRules({ w: 300, h: 200, page: 1 }, { caption: 'Figure 2: Sales by region' }).alt, /Sales by region/);
});
