import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processPdf, renderAndAudit } from './pipeline.js';
import { AltPassError, LIMITS } from './extract.js';
import { selectAdapter } from './alt/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);

export const SAMPLES = {
  'council-agenda': { file: 'council-agenda.pdf', label: 'Council meeting agenda' },
  'product-launch-deck': { file: 'product-launch-deck.pdf', label: 'Product launch slide deck' },
  'spring-price-list': { file: 'spring-price-list.pdf', label: 'Spring price list' },
};

const TTL_MS = 60 * 60 * 1000, MAX_RESULTS = 40, MAX_INFLIGHT = 3;

export function createApp({ adapter = () => selectAdapter(), now = () => Date.now() } = {}) {
  const app = express();
  const results = new Map();
  let inflight = 0;
  app.disable('x-powered-by');

  const sweep = () => { for (const [id, r] of results) if (now() - r.createdAt > TTL_MS) results.delete(id); while (results.size > MAX_RESULTS) results.delete(results.keys().next().value); };
  setInterval(sweep, 5 * 60 * 1000).unref();

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'",
    });
    next();
  });

  app.use('/fonts', express.static(nm('@fontsource-variable'), { maxAge: '7d', index: false, dotfiles: 'deny' }));
  app.use('/vendor/pdfjs', express.static(nm('pdfjs-dist', 'build'), { index: false }));
  app.get('/vendor/axe.min.js', (_req, res) => res.sendFile(nm('axe-core', 'axe.min.js')));
  app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));
  app.use('/samples', express.static(path.join(root, 'samples'), { index: false, extensions: [] , setHeaders: (res) => res.set('Content-Disposition', 'inline') }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxBytes, files: 1 } });

  const serialize = (r) => {
    const a = r.audit;
    return {
      id: r.id, filename: r.filename, title: r.doc.title, titleSource: r.doc.titleSource, lang: r.doc.lang, kind: r.doc.kind,
      pages: r.raw.meta.pagesRead, pageCount: r.raw.meta.pageCount, truncated: r.raw.meta.truncated,
      adapter: { id: r.doc.altAdapter.id, name: r.doc.altAdapter.name, errors: r.doc.altAdapter.errors.length },
      audit: a, outline: { h1: r.render.h1, headings: r.render.headings, hasToc: r.render.hasToc },
      images: r.doc.images.map((im) => ({ id: im.id, page: im.page, kind: im.kind, alt: im.alt, decorative: im.decorative, source: im.altSource, needsReview: im.needsReview && !im.edited, edited: im.edited, note: im.altNote, url: `/api/results/${r.id}/images/${im.id}.png`, w: im.pw, h: im.ph })),
      transcript: r.transcript, rev: r.rev,
      urls: { html: `/api/results/${r.id}/accessible.html`, naive: `/api/results/${r.id}/naive.html`, pdf: `/api/results/${r.id}/original.pdf`, json: `/api/results/${r.id}/audit.json` },
    };
  };

  async function handle(req, res, getBytes) {
    if (inflight >= MAX_INFLIGHT) return res.status(429).json({ error: { code: 'BUSY', message: 'AltPass is busy with other documents. Try again in a few seconds.' } });
    const stream = (req.get('accept') || '').includes('application/x-ndjson');
    let started = false;
    const send = (o) => { if (stream) { if (!started) { res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' }); started = true; } res.write(JSON.stringify(o) + '\n'); } };
    const fail = (e) => {
      const known = e instanceof AltPassError;
      const code = known ? e.code : 'FAILED';
      const message = known ? e.message : 'Something went wrong while reading this PDF. It may be damaged or use features AltPass cannot read yet.';
      if (!known) console.error('[altpass]', e);
      const status = code === 'TOO_BIG' ? 413 : known ? 422 : 500;
      if (stream && started) { send({ error: { code, message } }); return res.end(); }
      res.status(status).json({ error: { code, message } });
    };
    inflight++;
    try {
      const { bytes, filename } = await getBytes();
      send({ step: 'read' });
      const result = await processPdf(bytes, { filename, adapter: adapter(), onStep: (s) => send({ step: s }) });
      Object.assign(result, { id: crypto.randomUUID(), createdAt: now(), bytes, rev: 1 });
      results.set(result.id, result); sweep();
      if (stream) { send({ result: serialize(result) }); res.end(); } else res.json(serialize(result));
    } catch (e) { fail(e); } finally { inflight--; }
  }

  app.post('/api/audit', (req, res, next) => upload.single('file')(req, res, (err) => {
    if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: err.code === 'LIMIT_FILE_SIZE' ? 'TOO_BIG' : 'UPLOAD', message: err.code === 'LIMIT_FILE_SIZE' ? `That file is over ${LIMITS.maxBytes / 1048576} MB. Try compressing it or splitting it.` : 'The upload could not be read.' } });
    if (!req.file) return res.status(400).json({ error: { code: 'NO_FILE', message: 'Choose a PDF to upload.' } });
    handle(req, res, async () => ({ bytes: new Uint8Array(req.file.buffer), filename: (req.file.originalname || 'document.pdf').replace(/[^\w.\- ()]+/g, '_').slice(0, 120) }));
  }));

  app.post('/api/samples/:id', (req, res) => {
    const s = SAMPLES[req.params.id];
    if (!s) return res.status(404).json({ error: { code: 'NO_SAMPLE', message: 'Unknown sample.' } });
    handle(req, res, async () => ({ bytes: new Uint8Array(fs.readFileSync(path.join(root, 'samples', s.file))), filename: s.file }));
  });

  const find = (req, res) => { const r = results.get(req.params.id); if (!r) { res.status(404).json({ error: { code: 'EXPIRED', message: 'This result has expired (results are kept in memory for one hour). Upload the PDF again.' } }); return null; } return r; };
  const attach = (res, name, type, download) => { res.set({ 'Content-Type': type, 'Cache-Control': 'no-store' }); if (download) res.set('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`); };
  const stem = (r) => r.filename.replace(/\.pdf$/i, '');

  app.get('/api/results/:id/accessible.html', (req, res) => {
    const r = find(req, res); if (!r) return;
    attach(res, `${stem(r)}.accessible.html`, 'text/html; charset=utf-8', req.query.download === '1');
    // The converted document is untrusted content derived from an upload: no scripts, no network, images only as data URIs.
    res.set('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox allow-same-origin");
    res.send(r.render.html);
  });
  app.get('/api/results/:id/naive.html', (req, res) => {
    const r = find(req, res); if (!r) return;
    attach(res, 'naive.html', 'text/html; charset=utf-8');
    res.set('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox allow-same-origin");
    res.send(r.naive);
  });
  app.get('/api/results/:id/original.pdf', (req, res) => { const r = find(req, res); if (!r) return; attach(res, r.filename, 'application/pdf'); res.set('Content-Disposition', 'inline'); res.send(Buffer.from(r.bytes)); });
  app.get('/api/results/:id/audit.json', (req, res) => {
    const r = find(req, res); if (!r) return;
    attach(res, `${stem(r)}.audit.json`, 'application/json; charset=utf-8', req.query.download === '1');
    const s = serialize(r);
    res.send(JSON.stringify({ tool: 'AltPass', version: '0.1.0', generatedAt: new Date().toISOString(), file: r.filename, title: s.title, language: s.lang, altTextSource: s.adapter.name, score: s.audit.score, axeCore: s.audit.axe, checks: s.audit.checks, fixed: s.audit.fixes, needsReview: s.audit.review, disclaimer: 'Automated checks cover only part of WCAG. This report is not a legal certification of conformance.' }, null, 2));
  });
  app.get('/api/results/:id/images/:img', (req, res) => {
    const r = find(req, res); if (!r) return;
    const im = r.doc.images.find((i) => `${i.id}.png` === req.params.img);
    if (!im) return res.status(404).end();
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }).send(im.png);
  });
  app.get('/api/results/:id', (req, res) => { const r = find(req, res); if (r) res.json(serialize(r)); });

  app.put('/api/results/:id/alt', express.json({ limit: '100kb' }), async (req, res) => {
    const r = find(req, res); if (!r) return;
    const edits = Array.isArray(req.body?.edits) ? req.body.edits : null;
    if (!edits) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Expected {"edits":[{id, alt, decorative}]}.' } });
    for (const e of edits) {
      const im = r.doc.images.find((i) => i.id === e?.id); if (!im) return res.status(400).json({ error: { code: 'BAD_IMAGE', message: `Unknown image ${String(e?.id).slice(0, 40)}.` } });
      if (e.alt !== undefined && typeof e.alt !== 'string') return res.status(400).json({ error: { code: 'BAD_ALT', message: 'alt must be a string.' } });
    }
    for (const e of edits) {
      const im = r.doc.images.find((i) => i.id === e.id);
      if (e.decorative !== undefined) im.decorative = !!e.decorative;
      if (typeof e.alt === 'string') { const t = e.alt.replace(/\s+/g, ' ').trim().slice(0, 600); if (t !== im.alt) im.altSource = 'human'; im.alt = im.decorative ? '' : t; }
      if (im.decorative) im.alt = '';
      im.edited = true; im.needsReview = false;
    }
    try { await renderAndAudit(r); r.rev++; res.json(serialize(r)); } catch (e) { console.error(e); res.status(500).json({ error: { code: 'FAILED', message: 'Could not re-render the document.' } }); }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }));
  app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: { code: 'FAILED', message: 'Unexpected error.' } }); });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000, host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => {
    const a = selectAdapter();
    console.log(`AltPass running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`Alt text: ${a.name}${a.id === 'rules' ? '  (set OPENAI_API_KEY or ANTHROPIC_API_KEY to use a vision model)' : ''}`);
  });
}
