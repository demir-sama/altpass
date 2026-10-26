// Reads a PDF with pdf.js and returns raw, positioned content:
// text runs (with size/bold), images (as PNG buffers + bounding boxes), links and document metadata.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PNG } from 'pngjs';
import crypto from 'node:crypto';

export const LIMITS = { maxPages: 30, maxBytes: 15 * 1024 * 1024, maxImages: 40 };
const OPS = pdfjs.OPS;

export class AltPassError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

function toPng(img) {
  const { width, height, data } = img;
  if (!data || !width || !height) return null;
  const png = new PNG({ width, height });
  const px = width * height;
  if (data.length === px * 4) png.data = Buffer.from(data);
  else if (data.length === px * 3) {
    for (let i = 0, j = 0; i < px; i++) { png.data[j++] = data[i * 3]; png.data[j++] = data[i * 3 + 1]; png.data[j++] = data[i * 3 + 2]; png.data[j++] = 255; }
  } else if (data.length === px) {
    for (let i = 0, j = 0; i < px; i++) { png.data[j++] = data[i]; png.data[j++] = data[i]; png.data[j++] = data[i]; png.data[j++] = 255; }
  } else if (data.length === Math.ceil(width / 8) * height) { // 1 bpp
    const rb = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const v = (data[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; const o = (y * width + x) * 4;
      png.data[o] = png.data[o + 1] = png.data[o + 2] = v; png.data[o + 3] = 255;
    }
  } else return null;
  return PNG.sync.write(png);
}

function getObj(page, id) {
  const store = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    try { if (store.has(id)) return resolve(store.get(id)); store.get(id, resolve); } catch { resolve(null); }
    setTimeout(() => resolve(null), 4000);
  });
}

export async function extractPdf(bytes, { maxPages = LIMITS.maxPages } = {}) {
  if (bytes.length > LIMITS.maxBytes) throw new AltPassError('TOO_BIG', `That file is larger than ${LIMITS.maxBytes / 1024 / 1024} MB.`);
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  if (!head.includes('%PDF-')) throw new AltPassError('NOT_PDF', 'That does not look like a PDF file.');

  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, verbosity: 0, disableFontFace: true }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new AltPassError('ENCRYPTED', 'This PDF is password protected. Remove the password and try again.');
    throw new AltPassError('NOT_PDF', 'This PDF could not be read (it may be damaged).');
  }

  const md = await pdf.getMetadata().catch(() => ({ info: {}, metadata: null }));
  const info = md.info || {};
  const xmpTitle = md.metadata?.get?.('dc:title');
  const markInfo = await pdf.getMarkInfo?.().catch(() => null);
  const outline = await pdf.getOutline().catch(() => null);
  const pageCount = pdf.numPages;
  const use = Math.min(pageCount, maxPages);

  const pages = [];
  let taggedStructure = false;
  const seenHash = new Map();
  let imageCount = 0;

  for (let n = 1; n <= use; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const H = vp.height, Wd = vp.width;
    const tc = await page.getTextContent();
    const ops = await page.getOperatorList();
    if (!taggedStructure) { const st = await page.getStructTree().catch(() => null); if (st && st.children?.length) taggedStructure = true; }

    // fonts -> bold flag
    const fontInfo = new Map();
    const boldOf = (fontName) => {
      if (fontInfo.has(fontName)) return fontInfo.get(fontName);
      let bold = false, family = '';
      try {
        const f = page.commonObjs.has(fontName) ? page.commonObjs.get(fontName) : null;
        family = f?.name || '';
        bold = !!f?.bold || /bold|black|heavy|semibold|demi/i.test(family);
      } catch { /* ignore */ }
      const r = { bold, family }; fontInfo.set(fontName, r); return r;
    };

    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = it.transform;
      const size = Math.hypot(t[2], t[3]) || it.height || 10;
      const f = boldOf(it.fontName);
      items.push({ str: it.str, x: t[4], y: H - t[5], w: it.width, size: Math.round(size * 10) / 10, bold: f.bold, italic: /italic|oblique/i.test(f.family), font: f.family });
    }

    // images with bounding boxes via CTM tracking
    const images = [];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let textOps = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) textOps++;
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
        if (imageCount >= LIMITS.maxImages) continue;
        const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
        let png = null, pw = 0, ph = 0;
        let obj = null;
        if (fn === OPS.paintInlineImageXObject) obj = args[0];
        else if (fn === OPS.paintImageXObject) obj = await getObj(page, args[0]);
        if (obj) { pw = obj.width; ph = obj.height; try { png = toPng(obj); } catch { png = null; } }
        const x = Math.min(ctm[4], ctm[4] + ctm[0]), top = H - Math.max(ctm[5], ctm[5] + ctm[3]);
        const hash = png ? crypto.createHash('sha1').update(png).digest('hex') : null;
        if (hash) seenHash.set(hash, (seenHash.get(hash) || new Set()).add(n));
        images.push({ page: n, x, y: top, w, h, pw, ph, png, hash, textOpsBefore: textOps });
        imageCount++;
      }
    }

    const links = [];
    for (const a of await page.getAnnotations().catch(() => [])) {
      if (a.subtype === 'Link' && (a.url || a.unsafeUrl) && a.rect) {
        const [x1, y1, x2, y2] = a.rect;
        links.push({ url: a.url || a.unsafeUrl, x: Math.min(x1, x2), y: H - Math.max(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
      }
    }
    pages.push({ n, width: Wd, height: H, items, images, links });
    page.cleanup();
  }
  for (const p of pages) for (const im of p.images) im.repeatPages = im.hash ? seenHash.get(im.hash).size : 1;

  await pdf.destroy();
  const title = (info.Title && String(info.Title).trim()) || (xmpTitle && String(xmpTitle).trim()) || '';
  return {
    meta: {
      title, lang: info.Language || '', tagged: !!(markInfo?.Marked) || taggedStructure, hasStructTree: taggedStructure,
      hasOutline: !!(outline && outline.length), producer: info.Producer || '', creator: info.Creator || '',
      pageCount, pagesRead: use, truncated: pageCount > use,
    },
    pages,
  };
}
