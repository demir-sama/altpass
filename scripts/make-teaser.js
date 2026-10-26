// Regenerates the hero before/after images from the council-agenda sample (needs poppler's pdftoppm and Chrome).
//   node scripts/make-teaser.js
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { processPdf } from '../src/pipeline.js';
import { rulesAdapter } from '../src/alt/index.js';

const out = path.resolve('public/img'); fs.mkdirSync(out, { recursive: true });
const pdf = path.resolve('samples/council-agenda.pdf');
execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=86', '-r', '150', '-f', '1', '-l', '1', '-singlefile', pdf, path.join(out, 'teaser-before')]);

const res = await processPdf(fs.readFileSync(pdf), { filename: 'council-agenda.pdf', adapter: rulesAdapter });
const tmp = path.resolve('tmp'); fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'teaser.html'), res.render.html);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 640, height: 828 }, deviceScaleFactor: 2, colorScheme: 'light' });
await page.goto('file://' + path.join(tmp, 'teaser.html'));
await page.screenshot({ path: path.join(out, 'teaser-after.jpg'), type: 'jpeg', quality: 88 });
await browser.close();
fs.writeFileSync(path.join(out, 'teaser.json'), JSON.stringify({ before: res.audit.score.before, after: res.audit.score.after }));
console.log('teaser scores', res.audit.score);
