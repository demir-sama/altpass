// axe-core (Deque, MPL-2.0) run on an HTML string inside jsdom.
// jsdom has no layout engine, so colour-contrast is disabled here; the web UI re-runs axe in a real browser
// (where contrast IS checked) on the same HTML.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let axeSource;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

export async function runAxe(html) {
  axeSource ??= fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    dom.window.eval(axeSource);
    const res = await dom.window.axe.run(dom.window.document.documentElement, {
      runOnly: { type: 'tag', values: TAGS },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations', 'passes', 'incomplete'],
    });
    return summariseAxe(res, { contrast: false, engine: 'axe-core ' + res.testEngine.version + ' (jsdom)' });
  } finally { dom.window.close(); }
}

export function summariseAxe(res, extra = {}) {
  const violations = res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.length }));
  const passes = res.passes.length;
  const total = passes + violations.length;
  return { violations, passes, incomplete: res.incomplete.length, inapplicable: res.inapplicable?.length ?? 0, passRate: total ? Math.round((passes / total) * 100) : 100, ...extra };
}
