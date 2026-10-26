---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. A sample PDF becomes accessible HTML (CLI)**
  Becomes usable: `npm run audit -- samples/council-agenda.pdf -o out.html` writes a standalone accessible HTML file with headings, lists, links, language and title.
  Why now: pdf.js on Node 20 and heading inference are the biggest technical risk and the heart of the kernel.
  PRD ref: `prd.md > Structure rebuilding`, `prd.md > Output`
  Spec ref: `spec.md > Extractor`, `spec.md > Structure inference`, `spec.md > Renderer`, `spec.md > File Structure`
  Build: scaffold, sample PDF generator (3 samples), extractor, structure inference, renderer, CLI.
  Verify (mechanical): run the CLI on each sample; unit tests assert headings/lists/table/reading order.
  Learner check: open `out.html` with a screen reader or browser and check the outline.
  Commit: `Add PDF extraction, structure inference and accessible HTML renderer`

- [x] **2. Audit, score and axe-core proof**
  Becomes usable: CLI/JSON prints before/after score, checklist of fixes, axe pass rate for naive vs accessible HTML.
  Why now: the "proof" is half of the kernel.
  PRD ref: `prd.md > Audit, score and proof`
  Spec ref: `spec.md > Auditor`
  Build: audit checks + weights, naive baseline HTML, axe in jsdom.
  Verify (mechanical): tests assert after-score > before-score and axe violations on output = 0 for all samples.
  Learner check: read the printed report.
  Commit: `Add audit, score and axe-core verification`

- [x] **3. Images get alt text through a pluggable adapter**
  Becomes usable: figures in the output carry alt text flagged for review; OpenAI/Anthropic adapters selectable by env.
  Why now: alt text is the most visible accessibility fix.
  PRD ref: `prd.md > Alt text`
  Spec ref: `spec.md > Alt-text adapters`
  Build: image extraction to PNG, rules adapter, OpenAI-compatible adapter, Anthropic adapter, fallback logic.
  Verify (mechanical): tests incl. mock LLM server for both adapters and failure fallback.
  Learner check: see figures with alt in the output.
  Commit: `Add image extraction and pluggable alt-text adapters`

- [ ] **4. Web app with before/after hero**
  Becomes usable: upload or pick a sample in the browser and see the full result view and download.
  Why now: the product experience (design) is judged and the video is recorded from it.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Screens and Layout`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Server`, `spec.md > Web UI`
  Build: Express API, static UI, pdf.js original preview, live axe in iframe, alt editing, downloads.
  Verify (mechanical): Playwright drives the flow and asserts the result view; axe on the app UI itself.
  Learner check: run `npm start`, drop a sample.
  Commit: `Add web UI with before/after view`

- [ ] **5. Demo video, docs and ship**
  Becomes usable: `demo/altpass-demo.mp4` (< 3 min), README, DEVPOST_SUBMISSION.md.
  Why now: submission requirements.
  PRD ref: `prd.md > What We're Building`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`
  Build: Playwright recording with captions, ffmpeg mux, docs.
  Verify (mechanical): ffprobe duration < 180 s; git status clean; license detected.
  Learner check: watch the video.
  Commit: `Add demo video script, README and submission text`

## Hands-on Checkpoints
- [x] Early: after slice 1 — heading inference checked on the three samples (outlines printed by the CLI and asserted in `test/pipeline.test.js`).
- [ ] Final: after slice 4 — kick the tires in the browser.

## Final Review
- [ ] Core journey works end to end in a browser.

## Code Tour and App Map
- [ ] `devpost/app-map.html` written.

## Revisions
