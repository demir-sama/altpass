// Any OpenAI-compatible vision endpoint (OpenAI, OpenRouter, xAI, local servers...).
//   OPENAI_API_KEY, OPENAI_BASE_URL (default https://api.openai.com/v1), ALTPASS_VISION_MODEL
import { SYSTEM, userPrompt, parseReply, fetchJson } from './llm-common.js';

export function openaiAdapter({ apiKey, baseUrl = 'https://api.openai.com/v1', model = 'gpt-4o-mini' } = {}) {
  return {
    name: `OpenAI-compatible vision model (${model})`,
    id: 'openai',
    async describe(im, ctx) {
      const data = `data:image/png;base64,${im.png.toString('base64')}`;
      const json = await fetchJson(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0.2, max_tokens: 300,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: [{ type: 'text', text: userPrompt(ctx) }, { type: 'image_url', image_url: { url: data } }] }],
        }),
      });
      const r = parseReply(json?.choices?.[0]?.message?.content);
      return { ...r, source: `llm:${model}`, needsReview: true, note: 'Written by a vision model. Review before publishing.' };
    },
  };
}
