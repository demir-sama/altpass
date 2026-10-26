// AltPass front end. Vanilla ES module, no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const svgIcon = (id, cls = 'icon') => { const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#' + id); s.append(u); return s; };
const say = (msg) => { const l = $('#live'); l.textContent = ''; setTimeout(() => (l.textContent = msg), 50); };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

let R = null;          // current result
let busy = false;

/* ---------- teaser slider ---------- */
(() => {
  const box = $('#teaser'), range = $('#teaser-range');
  const set = (v) => { box.style.setProperty('--pos', v + '%'); range.setAttribute('aria-valuetext', v <= 3 ? 'Showing the accessible version' : v >= 97 ? 'Showing the original PDF' : `${v}% of the page shows the original PDF`); };
  range.addEventListener('input', () => set(range.value));
  fetch('/img/teaser.json').then((r) => r.json()).then((s) => { $('#teaser-before-score').textContent = s.before; $('#teaser-after-score').textContent = s.after; }).catch(() => {});
  if (!reduceMotion) {
    let t0; const from = 85, to = 50;
    const step = (t) => { t0 ??= t; const p = Math.min(1, (t - t0) / 1400); const e = 1 - Math.pow(1 - p, 3); const v = Math.round(from + (to - from) * e); range.value = v; set(v); if (p < 1) requestAnimationFrame(step); };
    range.value = from; set(from); setTimeout(() => requestAnimationFrame(step), 500);
  }
})();

/* ---------- tabs (WAI-ARIA tabs pattern) ---------- */
$$('[role=tablist]').forEach((list) => {
  const tabs = $$('[role=tab]', list);
  const select = (tab, focus) => {
    tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $('#' + t.getAttribute('aria-controls')).hidden = !on; });
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' }[e.key]; if (k == null) return; e.preventDefault();
      select(k === 'first' ? tabs[0] : k === 'last' ? tabs.at(-1) : tabs[(i + k + tabs.length) % tabs.length], true);
    });
  });
});

/* ---------- upload ---------- */
const fileInput = $('#file'), drop = $('.drop'), errorBox = $('#error');
fileInput.addEventListener('change', () => { if (fileInput.files[0]) submitFile(fileInput.files[0]); });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) submitFile(f); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
$$('.chip').forEach((c) => c.addEventListener('click', () => submitSample(c.dataset.sample, c.querySelector('strong').textContent)));
$('#again').addEventListener('click', () => { $('#result').hidden = true; window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); $('#file').focus({ preventScroll: true }); });

function submitFile(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return showError('That does not look like a PDF. AltPass reads .pdf files.');
  const fd = new FormData(); fd.append('file', file);
  run(file.name, () => fetch('/api/audit', { method: 'POST', body: fd, headers: { Accept: 'application/x-ndjson' } }));
}
function submitSample(id, label) { run(label, () => fetch(`/api/samples/${id}`, { method: 'POST', headers: { Accept: 'application/x-ndjson' } })); }

function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
const STEP_ORDER = ['read', 'structure', 'alt', 'axe'];
const stepKey = (s) => (s === 'render' ? 'axe' : s);
function setStep(key) {
  const idx = STEP_ORDER.indexOf(key);
  $$('#steps li').forEach((li, i) => { li.classList.toggle('is-done', i < idx || key === 'done'); li.classList.toggle('is-active', i === idx); });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, doFetch) {
  if (busy) return; busy = true; errorBox.hidden = true; fileInput.value = '';
  drop.classList.add('is-busy'); $$('.chip').forEach((c) => (c.disabled = true));
  $('#progress-file').textContent = label; $('#progress').hidden = false; setStep('read'); say(`Processing ${label}`);
  let result = null, error = null;
  try {
    const res = await doFetch();
    const type = res.headers.get('content-type') || '';
    if (!type.includes('ndjson')) { const j = await res.json().catch(() => ({})); throw new Error(j.error?.message || 'The server could not process this file.'); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (value) buf += dec.decode(value, { stream: true });
      let nl; while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.step) { setStep(stepKey(msg.step)); await sleep(reduceMotion ? 0 : 380); }
        if (msg.result) result = msg.result;
        if (msg.error) error = msg.error.message;
      }
      if (done) break;
    }
    if (error) throw new Error(error);
    if (!result) throw new Error('The server returned no result.');
    setStep('done'); await sleep(reduceMotion ? 0 : 450);
    R = result; await showResult();
  } catch (e) { showError(e.message || 'Something went wrong.'); }
  finally { busy = false; drop.classList.remove('is-busy'); $$('.chip').forEach((c) => (c.disabled = false)); $('#progress').hidden = true; setStep('read'); }
}

/* ---------- result rendering ---------- */
function ring(value, color, label) {
  const R_ = 44, C = 2 * Math.PI * R_;
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'ring'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${label}: ${value} out of 100`);
  const mk = (cls, extra = {}) => { const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', 50); c.setAttribute('cy', 50); c.setAttribute('r', R_); c.setAttribute('stroke-width', 9); c.setAttribute('class', cls); for (const [k, v] of Object.entries(extra)) c.setAttribute(k, v); return c; };
  const bar = mk('bar', { stroke: color, 'stroke-dasharray': C, 'stroke-dashoffset': reduceMotion ? C * (1 - value / 100) : C });
  const t = document.createElementNS(SVGNS, 'text'); t.setAttribute('x', 50); t.setAttribute('y', 52); t.textContent = value;
  svg.append(mk('track'), bar, t);
  if (!reduceMotion) requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute('stroke-dashoffset', C * (1 - value / 100))));
  return svg;
}

function renderVerdict(r) {
  const a = r.audit, axeOk = a.axe.after.violations.length === 0;
  const drafts = a.counts.imagesDrafted;
  const needsReview = !axeOk || a.score.after < 90 || drafts > 0;
  const v = $('#verdict'); v.className = 'verdict card reveal' + (needsReview ? ' is-review' : '');
  v.replaceChildren(
    h('div', { class: 'stamp', 'aria-hidden': 'true' }, axeOk ? 'axe‑clean' : 'Needs work', h('small', {}, needsReview ? 'review pending' : 'all checks pass')),
    h('div', { class: 'verdict-main' },
      h('h3', { text: r.title }),
      h('p', { class: 'meta', text: `${r.filename} · ${r.pages} ${r.kind === 'slides' ? 'slides' : r.pages === 1 ? 'page' : 'pages'}${r.truncated ? ` (first ${r.pages} of ${r.pageCount})` : ''} · language ${r.lang} · alt text: ${r.adapter.name}${r.adapter.errors ? ` (${r.adapter.errors} fell back to rules)` : ''}` }),
      h('p', { class: needsReview ? 'note' : 'note ok' }, needsReview
        ? (drafts ? `Automated checks pass, but ${drafts === 1 ? 'one image description is a draft' : `${drafts} image descriptions are drafts`}${r.adapter.id === 'rules' ? ' written from the caption and nearby text (no vision model is configured)' : ' written by a vision model'}. A person must review ${drafts === 1 ? 'it' : 'them'} before publishing.` : 'Some checks still need attention. See the list below.')
        : 'Every automated check passes. Still skim the outline and read the page once.')),
    h('div', { class: 'scores' },
      h('div', { class: 'score' }, ring(a.score.before, 'var(--fail-fill)', 'Accessibility score before'), 'Before'),
      svgIcon('i-arrow', 'icon arrow'),
      h('div', { class: 'score' }, ring(a.score.after, 'var(--pass-fill)', 'Accessibility score after'), 'After')),
  );
  const stats = h('dl', { class: 'stats' },
    stat('axe‑core pass rate', `${a.axe.before.passRate}% → ${a.axe.after.passRate}%`, `${plural(a.axe.before.violations.length, 'violation')} → ${a.axe.after.violations.length}`),
    stat('Issues fixed', String(a.counts.issuesFixed), `of ${a.checks.filter((c) => c.before.status !== 'na').length} checks`),
    stat('To review', String(a.counts.toReview), 'by a person'),
    stat('Images', String(r.images.length), `${r.images.filter((i) => i.decorative).length} decorative`));
  $('.verdict-main', v).append(stats);
}
const stat = (k, big, small) => h('div', {}, h('dt', { text: k }), h('dd', {}, big, ' ', h('small', { text: small })));

const STATUS_WORD = { pass: 'Pass', fail: 'Fail', warn: 'Review', na: 'N/A' };
const STATUS_ICON = { pass: 'i-check', fail: 'i-x', warn: 'i-warn', na: 'i-dash' };
const badge = (s) => h('span', { class: `badge badge-${s}`, title: STATUS_WORD[s] }, svgIcon(STATUS_ICON[s]), h('span', { class: 'visually-hidden', text: STATUS_WORD[s] }));

function renderChecks(r) {
  const a = r.audit;
  const fixed = a.checks.filter((c) => c.before.status !== 'pass' && c.before.status !== 'na' && c.after.status !== 'na');
  $('#fixes-sub').textContent = `${plural(a.counts.issuesFixed, 'issue')} fixed or improved. Each check names the WCAG success criterion it maps to.`;
  const order = { fail: 0, warn: 1, pass: 2, na: 3 };
  const sorted = [...a.checks].sort((x, y) => order[x.before.status] - order[y.before.status] || order[x.after.status] - order[y.after.status]);
  $('#checks').replaceChildren(...sorted.map((c) => h('li', { class: 'check' + (c.before.status === 'na' ? ' na' : '') },
    h('div', { class: 'check-badges' }, h('span', { class: 'visually-hidden', text: 'Before:' }), badge(c.before.status), svgIcon('i-arrow', 'icon arrow'), h('span', { class: 'visually-hidden', text: 'After:' }), badge(c.after.status)),
    h('div', { class: 'check-body' },
      h('h4', {}, c.title, h('span', { class: 'pill pill-wcag wcag', text: 'WCAG ' + c.wcag })),
      c.before.status === 'na' ? h('p', { text: c.before.detail }) : [
        h('p', {}, h('b', { text: 'Before: ' }), c.before.detail),
        h('p', {}, h('b', { text: 'After: ' }), c.after.detail)]))));
  void fixed;
  $('#review-list').replaceChildren(...a.review.map((x) => h('li', { class: x.type === 'contrast' ? 'soft' : '', text: x.text })));
}

function renderOutline(r) {
  const o = r.outline;
  const root = $('#outline');
  const lm = (name, text) => h('li', {}, h('span', { class: 'lm', text: name }), text);
  const imgs = r.images.filter((i) => !i.decorative);
  root.replaceChildren(
    h('h5', { text: 'Landmarks' }),
    h('ul', {}, lm('banner', 'Skip link, title and document info'), o.hasToc ? lm('nav', 'Table of contents') : null, lm('main', 'Document content'), lm('contentinfo', 'Conversion notes')),
    h('h5', { text: 'Headings' }),
    h('ul', {}, h('li', {}, h('span', { class: 'lv', text: 'h1' }), o.h1), ...o.headings.map((x) => h('li', { style: `padding-left:${(x.level - 2) * 1.25}rem` }, h('span', { class: 'lv', text: 'h' + x.level }), x.text))),
    imgs.length ? h('h5', { text: 'Images as announced' }) : null,
    imgs.length ? h('ul', {}, ...imgs.map((i) => h('li', {}, h('span', { class: 'lm', text: 'img' }), h('span', { class: 'gfx', text: i.alt })))) : null,
    r.images.some((i) => i.decorative) ? h('p', { class: 'gfx', style: 'margin-top:.8rem', text: `${plural(r.images.filter((i) => i.decorative).length, 'decorative image')} hidden from assistive technology.` }) : null);
}

function renderTranscript(r) {
  const c = $('#transcript'); const checks = Object.fromEntries(r.audit.checks.map((x) => [x.id, x]));
  const notes = [];
  if (checks.language.before.status === 'fail') notes.push('no language');
  if (checks.title.before.status === 'fail') notes.push('no title');
  if (checks.headings.before.status !== 'pass') notes.push('no headings');
  if (checks.structure.before.status === 'fail') notes.push('no landmarks');
  c.replaceChildren(
    h('p', { class: 'tx-note', text: `Simulated from the file: an untagged PDF is read in the order its content was drawn${notes.length ? ' — ' + notes.join(', ') : ''}. Real screen readers vary.` }),
    ...r.transcript.map((l) => l.kind === 'meta' ? h('div', { class: 'meta-line', text: l.text }) : h('div', { class: 'say say-' + l.kind, text: l.text })));
}

function renderAlts(r) {
  const list = $('#alt-list');
  const n = r.images.length, drafts = r.images.filter((i) => i.needsReview && !i.decorative).length;
  $('#alts-sub').textContent = n ? (drafts ? `${plural(drafts, 'description')} drafted by ${r.adapter.id === 'rules' ? 'the rule-based fallback (it reads captions and nearby text, not pixels)' : r.adapter.name}. Edit anything that is wrong, then save: saving marks it as reviewed and updates the preview.` : 'Every image has been reviewed. You can still edit any description.') : '';
  if (!n) { list.replaceChildren(h('li', { class: 'empty', text: 'This document has no images, so there is no alt text to review.' })); return; }
  list.replaceChildren(...r.images.map((im) => {
    const ta = h('textarea', { id: `alt-${im.id}`, rows: 3, maxlength: 600 }); ta.value = im.alt; ta.disabled = im.decorative;
    const cb = h('input', { type: 'checkbox', id: `deco-${im.id}` }); cb.checked = im.decorative;
    const status = h('span', { class: 'alt-status', role: 'status' });
    cb.addEventListener('change', () => { ta.disabled = cb.checked; });
    const save = h('button', { class: 'btn', type: 'button', text: 'Save and mark reviewed' });
    save.addEventListener('click', async () => {
      save.disabled = true; status.textContent = 'Saving…';
      try {
        const res = await fetch(`/api/results/${r.id}/alt`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edits: [{ id: im.id, alt: ta.value, decorative: cb.checked }] }) });
        const j = await res.json(); if (!res.ok) throw new Error(j.error?.message || 'Save failed');
        R = j; await showResult({ keepScroll: true }); const el = $(`#alt-${im.id}`); const s = $(`#alt-${im.id}`)?.closest('.alt-card')?.querySelector('.alt-status'); if (s) s.textContent = 'Saved. Preview and score updated.'; say('Saved. Preview and score updated.'); el?.focus({ preventScroll: true });
      } catch (e) { status.textContent = e.message; save.disabled = false; }
    });
    return h('li', { class: 'alt-card' },
      h('img', { src: im.url, alt: `Extracted image from ${r.kind === 'slides' ? 'slide' : 'page'} ${im.page}`, loading: 'lazy' }),
      h('div', {},
        h('div', { class: 'meta' }, h('span', { class: 'pill ' + (im.needsReview && !im.decorative ? 'pill-warn' : 'pill-pass'), text: im.decorative ? 'Decorative' : im.needsReview ? 'Draft' : 'Reviewed' }), `${r.kind === 'slides' ? 'Slide' : 'Page'} ${im.page} · ${im.kind || 'image'} · source: ${im.source}`),
        h('label', { class: 'field', for: ta.id, text: 'Alternative text' }), ta,
        h('div', { class: 'alt-actions' }, h('label', { for: cb.id }, cb, 'Decorative (hide from screen readers)'), save, status),
        im.note ? h('p', { class: 'alt-note', text: im.note }) : null));
  }));
}

async function showResult({ keepScroll = false } = {}) {
  const r = R; const sec = $('#result'); const first = sec.hidden;
  sec.hidden = false;
  renderVerdict(r); renderChecks(r); renderOutline(r); renderTranscript(r);
  if (!keepScroll || first) renderAlts(r);
  else { /* keep the textareas in place while editing other images; refresh only badges */ refreshAltBadges(r); }
  $('#dl-html').href = r.urls.html + '?download=1'; $('#dl-json').href = r.urls.json + '?download=1'; $('#dl-open').href = r.urls.html;
  $('#preview').src = r.urls.html + '?v=' + r.rev;
  if (first || !keepScroll) { loadPdfPages(r); sec.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); sec.focus({ preventScroll: true }); say(`Result ready. Score ${r.audit.score.before} before, ${r.audit.score.after} after.`); }
  runLiveAxe(r);
}
function refreshAltBadges(r) {
  r.images.forEach((im) => { const card = $(`#alt-${im.id}`)?.closest('.alt-card'); if (!card) return; const p = $('.pill', card); p.className = 'pill ' + (im.needsReview && !im.decorative ? 'pill-warn' : 'pill-pass'); p.textContent = im.decorative ? 'Decorative' : im.needsReview ? 'Draft' : 'Reviewed'; $('.alt-card textarea', card) || 0; const ta = $('textarea', card); ta.value = im.alt; ta.disabled = im.decorative; $('input[type=checkbox]', card).checked = im.decorative; });
  const drafts = r.images.filter((i) => i.needsReview && !i.decorative).length;
  $('#alts-sub').textContent = drafts ? `${plural(drafts, 'description')} still to review.` : 'Every image has been reviewed. You can still edit any description.';
}

/* ---------- original PDF pages via pdf.js ---------- */
let pdfjs;
async function loadPdfPages(r) {
  const box = $('#pdf-pages'); box.replaceChildren(h('p', { class: 'loading', text: 'Rendering the original pages…' }));
  try {
    pdfjs ??= await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ url: r.urls.pdf, isEvalSupported: false }).promise;
    const width = Math.max(320, (box.clientWidth || 520) - 32); const dpr = Math.min(2, devicePixelRatio || 1);
    const canvases = [];
    for (let n = 1; n <= Math.min(doc.numPages, r.pages); n++) {
      if (R !== r) return; const page = await doc.getPage(n); const vp0 = page.getViewport({ scale: 1 }); const scale = (width / vp0.width) * dpr; const vp = page.getViewport({ scale });
      const c = h('canvas', { role: 'img', 'aria-label': `${r.kind === 'slides' ? 'Slide' : 'Page'} ${n} of the original PDF, shown as a picture` }); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; canvases.push(c);
      if (n === 1) box.replaceChildren(c); else box.append(c);
    }
  } catch (e) { box.replaceChildren(h('p', { class: 'loading', text: 'Could not render the original pages in this browser. ' }, h('a', { href: r.urls.pdf, target: '_blank', rel: 'noopener', text: 'Open the PDF' }))); }
}

/* ---------- live axe-core in the browser (real layout, so colour contrast is checked) ---------- */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
// The converted HTML is loaded into an off-screen, laid-out iframe that may run scripts but has an opaque origin
// (sandbox="allow-scripts"). axe-core and a tiny runner are injected; the result comes back via postMessage.
async function axeOn(url) {
  const html = await (await fetch(url)).text();
  const inject = '<script src="/vendor/axe.min.js"></script><script src="/axe-runner.js"></script>';
  const doc = html.includes('</body>') ? html.replace('</body>', inject + '</body>') : html + inject;
  const f = h('iframe', { 'aria-hidden': 'true', tabindex: '-1', title: 'axe-core probe', sandbox: 'allow-scripts', style: 'position:fixed;left:-9999px;top:0;width:900px;height:1000px;border:0' });
  try {
    return await new Promise((ok, no) => {
      const timer = setTimeout(() => no(new Error('timeout')), 20000);
      const onMsg = (e) => { if (e.source !== f.contentWindow || !e.data?.altpassAxe) return; clearTimeout(timer); removeEventListener('message', onMsg); e.data.ok ? ok(e.data) : no(new Error(e.data.error)); };
      addEventListener('message', onMsg); f.srcdoc = doc; document.body.append(f);
    });
  } finally { f.remove(); }
}
async function runLiveAxe(r) {
  const out = $('#axe-live'); out.replaceChildren('Running axe-core in your browser…');
  try {
    const [after, before] = [await axeOn(r.urls.html + '?v=' + r.rev), await axeOn(r.urls.naive)];
    if (R !== r) return;
    const bad = after.violations.length > 0;
    out.replaceChildren(
      h('strong', { text: `Live axe-core ${after.version} in your browser${after.contrast ? ' (incl. colour contrast)' : ''}:` }),
      h('span', { class: bad ? 'bad' : 'ok', text: bad ? `${plural(after.violations.length, 'violation')} in the accessible version` : `0 violations in the accessible version, ${plural(after.passes, 'rule')} passed` }),
      h('span', { text: `The naive PDF→HTML export has ${plural(before.violations.length, 'violation')} (${before.violations.map((x) => x.id).slice(0, 4).join(', ')}${before.violations.length > 4 ? '…' : ''})` }),
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'Re-run', onclick: () => runLiveAxe(r) }));
    r.liveAxe = { after, before };
  } catch (e) { out.replaceChildren('The live axe-core run could not start in this browser. The server-side result above (jsdom, no colour contrast) still applies.'); }
}
