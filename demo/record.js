// Records the AltPass demo video: drives the real app with Playwright (video + caption overlays), then transcodes with ffmpeg.
//   node demo/record.js            -> demo/altpass-demo.mp4 (about 90 s, silent, captions only)
// Needs Chrome (CHROME_PATH or /usr/bin/google-chrome) and ffmpeg/ffprobe on PATH.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'demo', 'work');
const out = path.join(root, 'demo', 'altpass-demo.mp4');
const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });

const server = createApp().listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: chrome });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'no-preference', recordVideo: { dir: work, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const sleep = (ms) => page.waitForTimeout(ms);

// A fake cursor and a caption bar, injected into the page (aria-hidden, only for the recording).
await page.addInitScript(() => {
  const mk = () => {
    if (document.getElementById('rec-cap')) return;
    const st = document.createElement('style');
    st.textContent = `#rec-cursor{position:fixed;z-index:99999;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .05s linear}
    #rec-cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
    #rec-cap{position:fixed;z-index:99998;left:50%;bottom:26px;transform:translateX(-50%) translateY(10px);max-width:1040px;padding:14px 24px;border-radius:14px;background:rgba(15,17,22,.92);color:#fff;font:600 24px/1.35 Inter,system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .35s,transform .35s;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.35)}
    #rec-cap.on{opacity:1;transform:translateX(-50%)}
    #rec-card{position:fixed;z-index:100000;inset:0;display:grid;place-items:center;align-content:center;gap:18px;text-align:center;background:#15171c;color:#faf7f2;opacity:0;pointer-events:none;transition:opacity .5s;padding:40px}
    #rec-card.on{opacity:1}
    #rec-card h1{font:600 92px/1 Fraunces,Georgia,serif;margin:0;letter-spacing:-.02em} #rec-card h1 em{color:#7fe0b0;font-style:italic}
    #rec-card p{font:500 30px/1.4 Inter,system-ui,sans-serif;margin:0;color:#d9d4cb;max-width:900px}
    #rec-card small{font:500 20px Inter,system-ui,sans-serif;color:#9d988e}`;
    document.head.append(st);
    const cur = document.createElement('div'); cur.id = 'rec-cursor'; cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8-6.5 1.8L8.8 18z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    const cap = document.createElement('div'); cap.id = 'rec-cap'; cap.setAttribute('aria-hidden', 'true');
    const card = document.createElement('div'); card.id = 'rec-card'; card.setAttribute('aria-hidden', 'true');
    document.body.append(card, cur, cap);
    addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
  };
  document.addEventListener('DOMContentLoaded', mk);
});

const caption = (t) => page.evaluate((t) => { const c = document.getElementById('rec-cap'); if (!t) return c.classList.remove('on'); c.textContent = t; c.classList.add('on'); }, t);
const card = (html) => page.evaluate((h) => { const c = document.getElementById('rec-card'); if (!h) return c.classList.remove('on'); c.innerHTML = h; c.classList.add('on'); }, html);
const loc = (s) => (typeof s === 'string' ? page.locator(s).first() : s);
async function moveTo(sel, opts = {}) { const b = await loc(sel).boundingBox(); await page.mouse.move(b.x + (opts.dx ?? b.width / 2), b.y + (opts.dy ?? Math.min(b.height / 2, 30)), { steps: 28 }); return b; }
async function click(sel) { await moveTo(sel); await sleep(250); await loc(sel).click(); }
const scrollTo = (sel, block = 'start') => page.evaluate(([s, b]) => document.querySelector(s).scrollIntoView({ behavior: 'smooth', block: b }), [sel, block]);

await page.goto(base); await page.waitForSelector('#rec-cap', { state: 'attached' });
await page.waitForFunction(() => document.fonts.ready.then(() => true));
await card('<h1>Alt<em>Pass</em></h1><p>Turn an inaccessible PDF into accessible HTML, with an audit and an axe-core proof.</p><small>Built for Devpost “Build With AI: Basics”</small>');
await sleep(4200); await card(null); await sleep(700);

// 1. Problem + before/after teaser
await caption('Most PDFs are untagged: no headings, no language, “Graphic” for every image.'); await sleep(3600);
const tb = await moveTo('#teaser', { dx: 640 * 0.5 + 40, dy: 200 });
await page.mouse.down(); await page.mouse.move(tb.x + tb.width * 0.88, tb.y + 200, { steps: 40 }); await sleep(500);
await page.mouse.move(tb.x + tb.width * 0.12, tb.y + 200, { steps: 60 }); await sleep(400);
await page.mouse.move(tb.x + tb.width * 0.5, tb.y + 200, { steps: 30 }); await page.mouse.up();
await caption('AltPass rebuilds the same page with real structure — and scores it before and after.'); await sleep(3800);

// 2. Why now
await caption('And it is now a legal duty: EU Accessibility Act since June 2025; US ADA Title II web rule from April 2027.');
await scrollTo('#why'); await sleep(5600);
await scrollTo('body'); await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })); await sleep(900);

// 3. Run a sample
await caption('Drop in a PDF or a slide deck — here, a deliberately inaccessible council agenda.'); await sleep(2800);
await click('[data-sample=council-agenda]'); await caption('Reading layout · rebuilding structure · writing alt text · checking with axe-core…');
await page.waitForSelector('#result:not([hidden]) .verdict'); await sleep(900);
await page.waitForFunction(() => /violations in the accessible version/.test(document.querySelector('#axe-live')?.textContent || ''), null, { timeout: 40000 });
const sc = await page.evaluate(() => document.querySelector('#verdict').innerText.replace(/\s+/g, ' '));
console.log('verdict text:', sc);
await sleep(600);
await scrollTo('#result'); await caption('Accessibility score: 10 → 94. Original on the left, accessible HTML on the right.'); await sleep(4600);

// 4. Before: what a screen reader hears
await scrollTo('.compare-view'); await sleep(900);
await click('#tab-hears'); await caption('What a screen reader hears from the original: no headings, no list, “Graphic”.'); await sleep(5200);
await click('#tab-outline'); await caption('What it gets from AltPass: landmarks, a heading outline, real lists.'); await sleep(4800);
await click('#tab-preview'); await sleep(500);

// 5. axe proof
const axe = await page.evaluate(() => document.querySelector('#axe-live').innerText.replace(/\s+/g, ' '));
console.log('axe-live:', axe);
await scrollTo('#axe-live', 'center'); await caption('axe-core runs live in your browser: the naive PDF→HTML export fails, the AltPass output has 0 violations.'); await sleep(5600);

// 6. Checklist
await scrollTo('.two-col'); await caption('Every check maps to a WCAG success criterion, with what was fixed and what still needs a person.'); await sleep(5200);

// 7. Alt text review
await scrollTo('#alts'); await sleep(900);
await caption('Alt text is a draft. Here a rule-based fallback wrote it (no AI key set), so it is flagged for human review.'); await sleep(4400);
async function editAlt(i, text) {
  const card = page.locator('.alt-card').nth(i), ta = card.locator('textarea'), save = card.locator('.btn').first();
  await moveTo(ta); await ta.click(); await ta.fill('');
  await ta.pressSequentially(text, { delay: 34 }); await sleep(400);
  await click(save);
  await page.waitForFunction((n) => document.querySelectorAll('.alt-card')[n]?.querySelector('.alt-status')?.textContent.includes('Saved'), i); await sleep(1200);
}
await caption('Edit a draft and save it — it is marked reviewed, and the preview and score update.');
await editAlt(0, 'Brightwater City Council crest: a navy circle with a gold wave.');
await editAlt(2, 'Bar chart: attendance at council meetings rose from 120 in 2022 to 310 in 2025.');
await scrollTo('#verdict', 'center'); console.log('after review:', await page.evaluate(() => document.querySelector('#verdict').innerText.replace(/\s+/g, ' ')));
await sleep(500); await caption('With every image reviewed by a person, the score climbs to its maximum.'); await sleep(4200);

// 8. Downloads + honesty
await scrollTo('.downloads', 'center'); await caption('Download the accessible HTML and a JSON audit report. Nothing leaves your machine.'); await moveTo('#dl-html'); await sleep(4200);
await scrollTo('#honesty'); await caption('And it is honest about its limits: structure is inferred, alt text is a draft, a clean axe run is not a certification.'); await sleep(6200);

// 9. End card
await caption(null); await sleep(400);
await card('<h1>Alt<em>Pass</em></h1><p>Upload a PDF. Get an audit, accessible HTML, and the proof.</p><small>Open source · MIT license · Node 20 · pdf.js · axe-core</small>');
await sleep(5200);

const vpath = await page.video().path();
await ctx.close(); await browser.close(); server.close();

// Transcode: trim the blank first frames, H.264, add a silent AAC track so every player/uploader is happy.
execFileSync('ffmpeg', ['-y', '-ss', '0.4', '-i', vpath, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '64k', out], { stdio: 'inherit' });
const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out]).toString());
console.log(`Wrote ${path.relative(root, out)}: ${dur.toFixed(1)} s, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
if (dur >= 180) { console.error('Video is 3 minutes or longer. Shorten the script.'); process.exit(1); }
