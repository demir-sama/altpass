// Anthropic Messages API with image input.
//   ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL (default https://api.anthropic.com), ALTPASS_VISION_MODEL
import { SYSTEM, userPrompt, parseReply, fetchJson } from './llm-common.js';

export function anthropicAdapter({ apiKey, baseUrl = 'https://api.anthropic.com', model = 'claude-3-5-haiku-latest' } = {}) {
  return {
    name: `Anthropic vision model (${model})`,
    id: 'anthropic',
    async describe(im, ctx) {
      const json = await fetchJson(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: 300, system: SYSTEM,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: im.png.toString('base64') } },
            { type: 'text', text: userPrompt(ctx) },
          ] }],
        }),
      });
      const text = (json?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      const r = parseReply(text);
      return { ...r, source: `llm:${model}`, needsReview: true, note: 'Written by a vision model. Review before publishing.' };
    },
  };
}
