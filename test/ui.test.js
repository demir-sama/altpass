// Browser tests (Playwright + Chrome). Skipped when no Chrome is found. Set CHROME_PATH to point at one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createApp } from '../src/server.js';
import { rulesAdapter } from '../src/alt/index.js';

const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const opts = { skip: chrome ? false : 'no Chrome found (set CHROME_PATH)' };
let server, base, browser;
test.before(async () => {
  if (!chrome) return;
  server = createApp({ adapter: () => rulesAdapter }).listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: chrome });
});
test.after(async () => { await browser?.close(); server?.close(); });

async function axeViolations(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ url: '/vendor/axe.min.js' });
  const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  return res.violations.map((v) => `${label}: ${v.id} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}) — ${v.help}`);
}

for (const scheme of ['light', 'dark']) {
  test(`app UI is axe-clean before and after a result (${scheme})`, opts, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(base);
    let v = await axeViolations(page, 'hero');
    await page.click('[data-sample=council-agenda]');
    await page.waitForSelector('#result:not([hidden]) .verdict');
    await page.waitForFunction(() => /violations in the accessible version/.test(document.querySelector('#axe-live')?.textContent || ''), null, { timeout: 30000 });
    await page.waitForSelector('#pdf-pages canvas');
    v = v.concat(await axeViolations(page, 'result'));
    await page.click('#tab-hears'); v = v.concat(await axeViolations(page, 'transcript'));
    await page.click('#tab-outline'); v = v.concat(await axeViolations(page, 'outline'));
    assert.deepEqual(v, []); assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('full flow: sample → result → live axe → edit alt → download', opts, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage();
  await page.goto(base);
  await page.click('[data-sample=spring-price-list]');
  await page.waitForSelector('#result:not([hidden]) .verdict');
  assert.match(await page.textContent('#verdict'), /Greenhouse & Garden Co\./);
  assert.match(await page.textContent('#verdict .scores'), /3[\s\S]*9\d/);
  await page.waitForFunction(() => /0 violations in the accessible version/.test(document.querySelector('#axe-live')?.textContent || ''), null, { timeout: 30000 });
  assert.match(await page.textContent('#axe-live'), /incl\. colour contrast/);
  // iframe preview shows the accessible document
  const frame = page.frameLocator('#preview'); await frame.locator('h1').waitFor(); assert.equal(await frame.locator('h1').count(), 1);
  assert.ok((await frame.locator('table').count()) === 2);
  // edit the first alt text
  const ta = page.locator('.alt-card textarea').first();
  await ta.fill('A bouquet of tulips, peonies and ranunculus in a white vase.');
  await page.locator('.alt-card .btn').first().click();
  await page.waitForFunction(() => document.querySelector('.alt-status')?.textContent.includes('Saved'));
  await page.waitForFunction(() => document.querySelector('#preview').contentDocument?.querySelector('img[alt^="A bouquet"]'));
  assert.match(await page.textContent('.alt-card .pill'), /Reviewed/);
  // download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-html')]);
  const file = await dl.path(); const html = fs.readFileSync(file, 'utf8');
  assert.match(dl.suggestedFilename(), /spring-price-list\.accessible\.html/); assert.match(html, /alt="A bouquet of tulips/);
  await ctx.close();
});

test('uploading a non-PDF shows a clear error', opts, async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(base);
  fs.mkdirSync('tmp', { recursive: true }); fs.writeFileSync('tmp/fake.pdf', 'definitely not a pdf');
  await page.setInputFiles('#file', 'tmp/fake.pdf');
  await page.waitForSelector('#error:not([hidden])');
  assert.match(await page.textContent('#error'), /not a PDF|does not look like/i);
  await ctx.close();
});

test('uploading a real PDF through the file input works', opts, async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(base);
  await page.setInputFiles('#file', 'samples/product-launch-deck.pdf');
  await page.waitForSelector('#result:not([hidden]) .verdict');
  assert.match(await page.textContent('#verdict'), /Lumen 2\.0/);
  await ctx.close();
});

test('reflows at 320px with no horizontal scrolling (app and accessible document)', opts, async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } }); const page = await ctx.newPage(); await page.goto(base);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'hero overflows');
  await page.click('[data-sample=spring-price-list]'); await page.waitForSelector('#result:not([hidden]) .verdict');
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'result overflows');
  const doc = await ctx.newPage(); await doc.goto(base + (await (await page.request.post(base + '/api/samples/council-agenda')).json()).urls.html);
  assert.ok(await doc.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'accessible html overflows');
  await ctx.close();
});

test('keyboard: skip link, tabs with arrow keys, visible focus', opts, async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(base);
  await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
  await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  await page.click('[data-sample=council-agenda]'); await page.waitForSelector('#result:not([hidden]) .verdict');
  await page.focus('#tab-hears'); await page.keyboard.press('ArrowLeft'); assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-pages');
  await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-hears');
  assert.equal(await page.getAttribute('#tab-hears', 'aria-selected'), 'true'); assert.equal(await page.isVisible('#panel-hears'), true);
  await ctx.close();
});

test('app UI is axe-clean on a 390px phone viewport with a result', opts, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage(); await page.goto(base);
  await page.click('[data-sample=product-launch-deck]'); await page.waitForSelector('#result:not([hidden]) .verdict');
  await page.waitForFunction(() => /violations in the accessible version/.test(document.querySelector('#axe-live')?.textContent || ''), null, { timeout: 30000 });
  assert.deepEqual(await axeViolations(page, 'mobile'), []);
  await ctx.close();
});
