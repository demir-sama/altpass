---
doc: spec
status: approved
---

# AltPass — Technical Spec

## How This Works, In Plain Language
AltPass is a small web server plus a web page. The page uploads a PDF to the server. The server **reads** the PDF with Mozilla's pdf.js (text with positions and font sizes, embedded images, links, metadata), **rebuilds structure** from those clues (big text = headings, aligned columns = tables, bullets = lists, left-then-right column order), **asks an alt-text adapter** to describe each image, **renders** a clean accessible HTML page, and **audits** both the original and the result. The audit uses our own PDF-level checks and Deque's open-source **axe-core** engine on the HTML. The page then shows the original and the fixed version side by side. Why this shape: no database, no build step, one language (JavaScript) — small enough to explain and to verify in a day.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Browser `POST /api/audit` (multipart PDF) or `POST /api/samples/:id` → server saves bytes in memory under a result id.
2. `extract.js` → `{meta, pages[{items, images, links}]}`.
3. `structure.js` → `{title, lang, blocks[]}` (heading/paragraph/list/table/figure/pagebreak).
4. `alt/index.js` picks an adapter → fills `figure.alt`, `figure.altSource`, `figure.needsReview`.
5. `render.js` → standalone accessible HTML string.
6. `audit.js` → before-checks on source, after-checks on output; `axe.js` → axe-core in jsdom on output and on the naive baseline HTML.
7. Server returns JSON `{id, before, after, fixes, review, images, axe}`; browser shows result, loads `GET /api/results/:id/accessible.html` into a sandboxed iframe, renders the original PDF pages with pdf.js in the browser, and re-runs axe-core live inside the iframe (real browser → real contrast check).
8. `PUT /api/results/:id/alt` updates an alt text → re-render → iframe reload.
9. `GET /api/results/:id/accessible.html?download=1` downloads the file.

## Stack
- Node.js ≥ 20, ES modules, Express 5 (https://expressjs.com), multer for uploads.
- `pdfjs-dist` 5.5.x legacy build (https://mozilla.github.io/pdf.js/) — pinned to 5.5.207 because 5.6.x has an open advisory; `isEvalSupported:false`.
- `axe-core` 4.14 (https://github.com/dequelabs/axe-core) via `jsdom` on the server and natively in the browser.
- `pngjs` to encode extracted raw image bitmaps as PNG.
- `pdfkit` (dev) to generate the sample PDFs; `playwright` (dev) to record the demo video.
- Vanilla HTML/CSS/JS front end; fonts Inter and Fraunces via `@fontsource-variable/*` (OFL).
- Verified early: pdf.js runs on Node 20 using the legacy build (checked in slice 1).

## Where It Runs and How Someone Tries It
Local Node process. `npm install && npm start`, open http://localhost:3000. Optional env: `ALTPASS_LLM=openai|anthropic|rules`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ALTPASS_VISION_MODEL`, `ANTHROPIC_API_KEY`. Without keys the rule-based adapter is used. CLI: `npm run audit -- samples/council-agenda.pdf -o out.html`. Tests: `npm test`. Demo recording: `node demo/record.js`. Deployment is not part of the POC.

## Look and Feel
Carried from `prd.md > Look and Feel`: warm paper + ink, Fraunces display + Inter UI, 16 px radius cards, green pass / vermilion issue accents, SVG score rings, stamp-style verdict, calm and confident copy ("Here is what changed, and here is what a human should still check."). Honest tone around heuristics. Constraint: vanilla CSS can do all of this; no component library.

## Components

### Extractor — `src/extract.js`
pdf.js `getDocument` → per page `getTextContent` (items with transform → x, y, size, font name) and `getOperatorList` (image paint ops → raw bitmap + bbox) and `getAnnotations` (link URLs + rects). Also metadata title, `getMarkInfo` (tagged?), outline. PRD ref: `prd.md > Structure rebuilding`.

### Structure inference — `src/structure.js`
Lines from items by y; body font size = most common by characters; heading if size ≥ 1.15× body or bold and short; levels by rank of distinct sizes; list items by leading bullet/number; tables by ≥3 consecutive lines sharing ≥2 aligned column x-starts; columns by a vertical gutter; header/footer by repetition across pages in top/bottom 8 %; language by stop-word scoring. PRD ref: `prd.md > Structure rebuilding`.

### Alt-text adapters — `src/alt/`
`rules.js` (default fallback), `openai.js` (any OpenAI-compatible `/chat/completions` vision endpoint), `anthropic.js` (`/v1/messages`), `index.js` (selection by env, per-image failure falls back to rules). PRD ref: `prd.md > Alt text`.

### Renderer — `src/render.js`
Block list → accessible HTML with inline CSS. PRD ref: `prd.md > Output`.

### Auditor — `src/audit.js`, `src/axe.js`
Check list with weights and WCAG refs; axe via jsdom. PRD ref: `prd.md > Audit, score and proof`.

### Server — `src/server.js`
Routes above; in-memory results Map with 1 h TTL. PRD ref: `prd.md > Upload and samples`.

### Web UI — `public/`
`index.html`, `styles.css`, `app.js`. PRD ref: `prd.md > Screens and Layout`.

## Data Model
In-memory only. `Result = {id, createdAt, filename, pdfBytes, doc: {meta, title, lang, blocks}, images: [{id, page, png, w, h, alt, altSource, needsReview, decorative}], audit}`. Restarting the server clears everything.

## File Structure
```
altpass/
├── src/
│   ├── extract.js        # pdf.js → raw pages
│   ├── structure.js      # raw pages → blocks
│   ├── alt/              # alt-text adapters (rules, openai, anthropic)
│   ├── render.js         # blocks → accessible HTML
│   ├── audit.js          # checks + score
│   ├── axe.js            # axe-core in jsdom
│   ├── pipeline.js       # glue
│   ├── cli.js            # npm run audit
│   └── server.js         # Express app
├── public/               # web UI
├── scripts/make-samples.js
├── samples/              # 3 generated inaccessible PDFs
├── test/                 # node:test suites
├── demo/record.js        # Playwright recording
├── devpost/              # Devpost Learn planning docs
├── scope.md prd.md spec.md  # root copies of the planning docs
└── README.md  LICENSE  DEVPOST_SUBMISSION.md
```

## External Services and Dependencies
- Optional vision LLM: OpenAI-compatible `POST {OPENAI_BASE_URL}/chat/completions` with a `image_url` data-URI part, or Anthropic `POST https://api.anthropic.com/v1/messages` with a base64 image block. Keys via env only. Cost and rate limits depend on the provider. **Not verified against a live provider in the build environment (no key available); adapter wiring is tested against a local mock server.**
- Everything else is local.

## Important Failure Modes
- **Scanned / no-text PDF** → clear message, no HTML produced (OCR is "Later").
- **LLM call fails or times out** → that image falls back to the rule-based text and is flagged for review.
- **Heuristic misreads structure** (e.g. a bold paragraph treated as a heading) → the checklist lists inferred headings and the alt/review table makes human review explicit; AltPass never claims legal compliance.

## What Was Simplified and Why
- **HTML output** instead of tagged PDF/UA — HTML is verifiable with axe-core and far less code; PDF/UA writing needs a PDF structure-tree writer.
- **In-memory results** instead of storage — nothing to secure or delete.
- **axe in jsdom on the server + live axe in the browser** — jsdom cannot compute colour contrast, so the browser run is the one shown in the UI.
- **Rule-based alt text** as default — honest, offline, and always flagged "needs review".

## Decisions and Open Issues
- Learner choices (from the brief): HTML output, pluggable LLM adapter with a rule-based fallback, axe-core proof, before/after, three generated samples, legal story (EAA, ADA Title II).
- Agent implementation details: pdf.js legacy build, Express, vanilla front end, in-memory store.
- Genuine uncertainty: how reliably heading levels can be inferred from font sizes alone. Plan: test on the three samples and on a real-world PDF in slice 1; record result in the checklist revisions.
- Unresolved: default vision model once a key exists.
