// Runs inside a sandboxed probe iframe (scripts only, opaque origin). axe-core is loaded just before this file.
(async () => {
  const send = (o) => parent.postMessage({ altpassAxe: true, ...o }, '*');
  try {
    if (document.readyState !== 'complete') await new Promise((ok) => addEventListener('load', ok));
    const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'passes', 'incomplete'] });
    const v = res.violations, p = res.passes.length, tot = p + v.length;
    send({ ok: true, violations: v.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length })), passes: p, incomplete: res.incomplete.length, passRate: tot ? Math.round((p / tot) * 100) : 100, version: res.testEngine.version, contrast: [...res.passes, ...v, ...res.incomplete].some((x) => x.id === 'color-contrast') });
  } catch (e) { send({ ok: false, error: String(e) }); }
})();
