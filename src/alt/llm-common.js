export const SYSTEM = 'You write alt text for images in documents so that blind and low-vision readers get the same information as sighted readers. Be concise (max 2 sentences, under 220 characters unless it is a data chart, then summarise the key trend or values). Do not start with "Image of" or "Picture of". If the image is purely decorative (a divider line, background texture, ornament) say so.';

export function userPrompt(ctx = {}) {
  const parts = ['Describe this image for alt text.'];
  if (ctx.caption) parts.push(`Its caption in the document: "${ctx.caption}".`);
  if (ctx.heading) parts.push(`It appears under the heading: "${ctx.heading}".`);
  if (ctx.before) parts.push(`Text before it: "${ctx.before}"`);
  if (ctx.after) parts.push(`Text after it: "${ctx.after}"`);
  parts.push('Reply with JSON only: {"alt": string, "decorative": boolean}. If decorative, alt must be "".');
  return parts.join('\n');
}

export function parseReply(text) {
  if (!text) throw new Error('empty reply');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { const j = JSON.parse(m[0]); if (typeof j.alt === 'string') return { alt: j.alt.trim(), decorative: !!j.decorative }; } catch { /* fall through */ }
  }
  const plain = text.replace(/^["'\s]+|["'\s]+$/g, '');
  if (!plain) throw new Error('empty reply');
  return { alt: plain.slice(0, 400), decorative: false };
}

export async function fetchJson(url, init, timeoutMs = 25000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
