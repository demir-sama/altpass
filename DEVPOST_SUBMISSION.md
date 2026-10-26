# AltPass: Devpost submission pack

> **Status: submitted** at https://devpost.com/software/altpass. This file is the submission pack the entry was prepared from. The Devpost Learn skill pack asks that learners write their own submission copy; this was a starting point prepared from the real project (everything in it is true of the repo as built).

Hackathon: Build With AI: Basics (https://learn-ai-basics.devpost.com/). Deadline: **26 Oct 2026, 5:00 pm EDT = 10:00 pm in Lagos (WAT)**.

## Form fields

### Project name
AltPass

### Tagline / elevator pitch (short)
Turn an inaccessible PDF into accessible HTML, with a score and an axe-core proof.

(Alternative, under 60 characters: "Make any PDF pass accessibility checks")

### Public code repository URL
https://github.com/demir-sama/altpass  (public, MIT licence file at the repo root, planning docs `scope.md`, `prd.md`, `spec.md` at the root)

### Demo video URL (YouTube or Vimeo, public)
https://youtu.be/lPGszOaxCVQ  File: `demo/altpass-demo-voice.mp4`, about 2 minutes (limit is 3 minutes), captions plus a voice-over narration (script in `demo/narration.md`), no music. A captions-only cut without voice-over is kept as `demo/altpass-demo.mp4`.

### Try it out / live link (optional)
None. AltPass runs locally (`npm install && npm start`, see README). A hosted version is not deployed.

### Built with
Node.js 20, Express, pdf.js (pdfjs-dist), axe-core, jsdom, multer, pngjs, vanilla JavaScript, HTML and CSS, Playwright (browser tests and demo recording), ffmpeg, OpenAI-compatible and Anthropic vision APIs (optional adapters), Fontsource (Inter, Fraunces), Devpost Learn Skill Pack, Cursor/AI coding agent.

(Adapt the last item to the agent you actually used.)

### Project description ("About the project" / what it does, who it's for, what you learned)

**What it does.** AltPass takes a PDF (or a slide deck exported to PDF) and does two things in one pass. It audits it, and it fixes it. It reads the text, images and links with pdf.js, rebuilds the structure a sighted reader sees (language, title, headings, reading order across columns, lists, tables, links, image alt text), and writes it out as clean, accessible HTML. A 12-check, WCAG-mapped audit scores the PDF before and the HTML after (for the sample council agenda: 10 to 94; the price list: 3 to 94). Then axe-core runs on the result, live in the browser including colour contrast: the naive PDF-to-HTML export fails, the AltPass output has 0 violations. You get a side-by-side view (original pages next to the accessible preview), a simulated "what a screen reader hears" transcript of the original, a checklist of what was fixed and what still needs a person, an alt-text review list where editing a description updates the preview and the score, and downloads of the HTML and a JSON audit report.

**Who it's for.** Someone like a communications officer at a city government, a university or an online shop who has hundreds of PDFs (agendas, slide decks, price lists) and a compliance deadline. The EU Accessibility Act has applied since 28 June 2025, and the US ADA Title II web rule applies from 26 April 2027 (populations of 50,000 or more) and 26 April 2028 (smaller entities). Today she ignores the problem, pays for manual remediation, or runs a checker that lists 37 errors she cannot fix. And behind her are the people who are locked out of these documents: screen reader users, people who zoom, people with dyslexia, anyone reading an agenda on a phone.

**How it's honest.** Alt text comes from a pluggable adapter. In this build no vision-model key was available, so the default is a rule-based fallback that writes a draft from the caption and nearby text; it does not look at the picture, and every draft is flagged for human review (the score is capped until a person reviews it). OpenAI-compatible and Anthropic vision adapters are implemented and tested against a local mock server, but have not been run against a live provider. Structure is inferred by heuristics, scans need OCR (not included), and a clean axe-core run is necessary but not sufficient: AltPass is not a compliance certificate.

**What I learned.** (Edit to match your own experience.)
- Planning first paid off: the scope, PRD and spec forced decisions (HTML output instead of tagged PDF, an honest fallback instead of pretending to have AI vision, three self-made samples) before any code existed, so the build stayed small and each slice had a visible check.
- Turn promises into checks. "Provably accessible" became tests: axe-core on every output, and on the app's own pages in a real browser. The browser run found a colour-contrast failure in my own UI that the server-side run could not see, because jsdom has no layout or contrast.
- PDFs have no semantic structure: it has to be inferred from font sizes, gutters and alignment. The samples I generated myself were too friendly; PDFs written by LibreOffice and Chrome broke my table detection (centred headers, padded rows, narrow gutters), which I only found by testing them. They are now fixtures in the test suite.
- Small environment details matter: a newer jsdom needs a JavaScript feature Node 20 lacks, so it is pinned.

### Image gallery (suggested, files in `docs/`)
1. `docs/screenshot-result.jpg`: score ring, axe pass rate and the before/after panes.
2. `docs/screenshot-home.jpg`: home page with the before/after slider and sample chips.
(Optional: a frame from the video showing the "what a screen reader hears" panel.)

### Team
Solo (you). Add teammates if any.

### Exit survey / other form questions
These ask for your own reflections; write them yourself. Facts you can draw on are in the "What I learned" section above and in `devpost/checklist.md` (Revisions).

## YouTube upload (done)

- File: `demo/altpass-demo-voice.mp4` (narrated, about 2 min). Published at https://youtu.be/lPGszOaxCVQ.
- Title: `AltPass: turn an inaccessible PDF into accessible HTML (demo)`
- Visibility: **Public** (the rules require publicly visible; unlisted may not be accepted). Not made for kids.
- Description (draft): `AltPass audits a PDF and rebuilds it as accessible HTML, with a before/after score and a live axe-core proof. Built for Devpost "Build With AI: Basics". Code: https://github.com/demir-sama/altpass. Alt text in this demo is rule-based (no AI key), flagged for human review.`
- The video has a voice-over (script in `demo/narration.md`), no music and no third-party logos.

## What the video shows (about 2 min, narrated)

1. Title card (4 s).
2. The problem: untagged PDFs, the before/after slider on the sample page.
3. Why now: EU Accessibility Act and US ADA Title II dates.
4. Click the council agenda sample: the pipeline runs, score 10 to 94.
5. What a screen reader hears from the original, then the outline of the result.
6. Live axe-core in the browser: the naive export fails, the output has 0 violations.
7. The WCAG-mapped checklist and the alt-text review: edit two drafts, save, the score reaches 100.
8. Downloads, the "what it cannot do" section, end card.

## Testing instructions for judges

```bash
git clone https://github.com/demir-sama/altpass && cd altpass
npm install
npm start          # open http://127.0.0.1:3000 and click one of the three sample chips
```

Node.js 20 or newer. No account, key or login is needed. To use a vision model, set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (see `.env.example`).

## Judging criteria (for your own notes)

- Design: a complete product page (hero, samples, result view, checklist, alt review, why-now and limits sections), light and dark mode, keyboard-operable, reflows at 320 px; the app itself is checked with axe in `test/ui.test.js`.
- Potential impact: concrete deadlines (EU 28 Jun 2025; US 26 Apr 2027/2028) and a specific user.
- Innovation: fix and prove in one step instead of a checker report; the screen-reader transcript comparison.
- Presentation: the video follows one document from upload to downloads.

## Steps (all done)

1. Review and edit this file; write the exit-survey answers yourself.
2. Public GitHub repo created and pushed: https://github.com/demir-sama/altpass.
3. Narrated demo uploaded to YouTube as Public: https://youtu.be/lPGszOaxCVQ.
4. Submitted on Devpost: https://devpost.com/software/altpass.
