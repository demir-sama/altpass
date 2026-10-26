#!/usr/bin/env node
// Usage: node src/cli.js file.pdf [-o out.html] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { processPdf } from './pipeline.js';
import { selectAdapter } from './alt/index.js';
import { runsText } from './structure.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('-') && args[args.indexOf(a) - 1] !== '-o' && args[args.indexOf(a) - 1] !== '--json');
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
if (!file) { console.error('Usage: npm run audit -- file.pdf [-o out.html] [--json out.json]'); process.exit(2); }
const out = opt('-o') || path.basename(file).replace(/\.pdf$/i, '') + '.accessible.html';

const res = await processPdf(fs.readFileSync(file), { filename: path.basename(file), adapter: selectAdapter() });
fs.writeFileSync(out, res.render.html);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ title: res.doc.title, lang: res.doc.lang, audit: res.audit, headings: res.render.headings }, null, 2));

const a = res.audit; const icon = { pass: '✓', warn: '!', fail: '✗', na: '–' };
console.log(`\nAltPass — ${res.filename}`);
console.log(`Title: ${res.doc.title}   Language: ${res.doc.lang}   Alt text: ${res.doc.altAdapter.name}`);
console.log(`Accessibility score: ${a.score.before} → ${a.score.after}`);
console.log(`axe-core pass rate:  ${a.axe.before.passRate}% (naive HTML, ${a.axe.before.violations.length} violations) → ${a.axe.after.passRate}% (AltPass output, ${a.axe.after.violations.length} violations)\n`);
for (const c of a.checks) console.log(` ${icon[c.before.status]} → ${icon[c.after.status]}  ${c.title.padEnd(52)} WCAG ${c.wcag}`);
console.log('\nOutline:'); console.log(' h1 ' + res.render.h1); for (const h of res.render.headings) console.log(' ' + '  '.repeat(h.level - 2) + `h${h.level} ` + h.text);
console.log(`\nTo review (${a.counts.toReview}):`); for (const r of a.review) console.log(' - ' + r.text);
console.log(`\nWrote ${out}`);
