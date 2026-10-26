---
doc: scope
status: approved
---

# AltPass

Upload an inaccessible PDF; get an accessibility audit and a fixed, screen-reader-friendly HTML version — with a before/after view and proof it passes axe-core.

## The Unique Kernel
Most tools stop at *telling you* a PDF is inaccessible (a checker report). AltPass **fixes it in the same breath**: it rebuilds the document's real structure (headings, reading order, lists, tables, image alt text, language, title) as accessible HTML, then *proves* the result with an automated axe-core run and a before/after score. The "oh, that's cool" is seeing the same page go from "unlabelled graphic, graphic, graphic…" to a navigable outline and an axe pass rate you can screenshot into a compliance file.

## Who It's For
Someone like **Amara, a communications officer at a mid-sized city government (or a university or a small online shop in the EU)**. She has 400 PDFs on the website — council agendas, slide decks exported to PDF, price lists, brochures — and a compliance deadline. Today she either ignores the problem, pays per page for manual remediation, or runs a checker that hands back a list of 37 errors she doesn't know how to fix in Acrobat.

## The Core Loop
She opens AltPass, drops in a PDF (or picks a sample). Within seconds she sees: the before/after, a score (e.g. 22 → 96), a checklist of what was fixed and what still needs a human eye (e.g. "review these 3 draft alt texts"). She edits an alt text if needed, downloads the accessible HTML, drops the next PDF in. She comes back for every new document she publishes.

## Inspiration & Identity
Calm, confident, editorial: warm paper background, ink-black type, a serif display face (Fraunces) paired with a clean UI sans (Inter), one signal accent for "pass" green and one for "issue" red/orange. Think "passport" — stamps, a clear verdict, trust. Feels like Linear/Stripe docs crossed with a printed passport page. Reference: WCAG 2.2 (https://www.w3.org/TR/WCAG22/), PDF/UA principles (https://pdfa.org/resource/iso-14289-pdfua/), axe-core (https://github.com/dequelabs/axe-core).

## Why This Matters to the Learner
Accessibility law has just become real worldwide — the EU Accessibility Act has applied since 28 June 2025 and the US ADA Title II web rule compliance dates are 26 April 2027 (population ≥ 50,000) and 26 April 2028 (smaller entities) — and PDFs are the long tail nobody has fixed. People who rely on screen readers are shut out of exactly the documents that matter most (forms, agendas, notices).

## What "Working" Looks Like
A local web app. Drop a sample inaccessible PDF → the server extracts text and structure, infers headings and reading order, writes alt text for images, renders accessible HTML, scores before and after, runs axe-core on the output, and shows it all side by side. Download button gives a standalone `.html`. Three generated sample PDFs (a council agenda, a two-column slide deck, a price-list with a table) show it working end to end in a 90-second video.

## The POC Boundary
In:
- Text-based PDFs (including slide decks exported to PDF), up to ~30 pages / 15 MB.
- Extraction with pdf.js; heading / paragraph / list / table / link / multi-column reading-order inference; header/footer removal.
- Image extraction and alt-text drafting through a **pluggable adapter**: OpenAI-compatible and Anthropic vision adapters, plus a rule-based fallback (context + caption + image statistics) that is the default and flagged "needs review".
- Accessible HTML output (lang, title, landmarks, skip link, heading outline, figure/alt, table headers, readable CSS, dark mode).
- Before/after audit with a score, a checklist of fixes, and axe-core pass rate on before (naive conversion) and after.
- Editable alt text, HTML download, three generated samples.

## Later
- OCR for scanned PDFs; tagged-PDF (PDF/UA) output instead of HTML; batch/zip upload; colour-contrast checks on the *source* PDF; forms; math; multi-language alt text; hosted deployment with accounts.

## Explicitly Cut
- **Scanned / image-only PDFs** — needs OCR; out of a one-day POC (the app detects them and says so).
- **Writing a remediated PDF** — HTML is the more accessible format and avoids a PDF writer; the PDF/UA route is "Later".
- **Accounts, storage, history** — results live in memory for one session; nothing is persisted or uploaded to third parties unless the user configures an LLM key.
- **Claiming legal compliance** — AltPass produces a strong draft + evidence, not a legal certification; manual review is still recommended.
