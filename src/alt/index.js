// Picks an alt-text adapter from the environment and fills in alt text for every extracted image.
// Order: ALTPASS_LLM=rules|openai|anthropic wins; otherwise OPENAI_API_KEY, then ANTHROPIC_API_KEY, else rules.
import { describeWithRules } from './rules.js';
import { openaiAdapter } from './openai.js';
import { anthropicAdapter } from './anthropic.js';

export const rulesAdapter = { id: 'rules', name: 'Rule-based fallback (no AI model)', describe: async (im, ctx) => describeWithRules(im, ctx) };

export function selectAdapter(env = process.env) {
  const want = (env.ALTPASS_LLM || '').toLowerCase();
  const model = env.ALTPASS_VISION_MODEL || undefined;
  if (want === 'rules') return rulesAdapter;
  if ((want === 'openai' || !want) && env.OPENAI_API_KEY) return openaiAdapter({ apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL, model });
  if ((want === 'anthropic' || !want) && env.ANTHROPIC_API_KEY) return anthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL, model });
  return rulesAdapter;
}

export async function fillAltText(doc, adapter = selectAdapter(), { concurrency = 3 } = {}) {
  const org = (doc.removedChrome.find((c) => c.page === 1)?.text || '').split(/\s*[·|—–-]\s*/)[0].trim();
  const errors = [];
  const queue = [...doc.images];
  const work = async () => {
    for (let im = queue.shift(); im; im = queue.shift()) {
      const ctx = { ...(im.context || {}), org };
      // always run the rules first: they decide obviously-decorative shapes without spending an LLM call
      const base = describeWithRules(im, ctx);
      let res = base;
      if (adapter.id !== 'rules' && !base.decorative && im.png) {
        try { res = { ...(await adapter.describe(im, ctx)), kind: base.kind }; if (!res.alt && !res.decorative) throw new Error('no alt'); }
        catch (e) { res = { ...base, source: 'rules (LLM call failed, used fallback)' }; errors.push({ image: im.id, error: String(e.message || e) }); }
      }
      Object.assign(im, { alt: res.alt, decorative: !!res.decorative, altSource: res.source, kind: res.kind, needsReview: !!res.needsReview, altNote: res.note, edited: false });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, work));
  doc.altAdapter = { id: adapter.id, name: adapter.name, errors };
  return doc;
}
