import type { MindMapSpec } from "../src/shared/mindmap";

export function renderMindMapSummaryHtml(spec: MindMapSpec) {
  const nodes = spec.nodes.slice(0, 8);
  return htmlDocument(
    spec,
    "summary",
    `
      <main class="summary-page">
        <header class="report-header">
          <span>DeckEvo MindMap</span>
          <strong>${escapeHtml(spec.deliveryMode === "presenting" ? "Live report" : "Reading report")}</strong>
        </header>
        <section class="hero-block">
          <p>${escapeHtml(spec.subtitle)}</p>
          <h1>${escapeHtml(spec.title)}</h1>
          <div class="metrics">
            ${spec.summary.keyMetrics.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.note || "")}</small></div>`).join("")}
          </div>
        </section>
        <section class="mindmap-board">
          <div class="center-node">
            <span>Core</span>
            <strong>${escapeHtml(spec.summary.headline)}</strong>
            <p>${escapeHtml(spec.summary.conclusion)}</p>
          </div>
          <div class="node-ring">
            ${nodes
              .map(
                (node, index) => `
                  <article class="map-node n-${index}">
                    <small>${String(index + 1).padStart(2, "0")}</small>
                    <h2>${escapeHtml(node.title)}</h2>
                    <p>${escapeHtml(node.insight || node.subtitle || "")}</p>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>
      </main>
    `,
  );
}

export function renderMindMapFullHtml(spec: MindMapSpec) {
  return htmlDocument(
    spec,
    "full",
    `
      <main class="full-report">
        <header class="report-header">
          <span>DeckEvo MindMap</span>
          <strong>${escapeHtml(spec.audience)}</strong>
        </header>
        <section class="report-cover">
          <p>${escapeHtml(spec.subtitle)}</p>
          <h1>${escapeHtml(spec.title)}</h1>
          <strong>${escapeHtml(spec.summary.conclusion)}</strong>
        </section>
        ${spec.completeReport
          .map(
            (section, index) => `
              <section class="report-section">
                <small>${String(index + 1).padStart(2, "0")}</small>
                <h2>${escapeHtml(section.heading)}</h2>
                <ul>
                  ${section.body.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>
            `,
          )
          .join("")}
      </main>
    `,
  );
}

function htmlDocument(spec: MindMapSpec, mode: "summary" | "full", body: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(spec.title)} - DeckEvo MindMap ${mode}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #111318;
      --muted: #6d7480;
      --line: #d8d3c8;
      --paper: #f7f3eb;
      --gold: #c6a66b;
      --teal: #5c8a8f;
      --surface: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, "SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      color: var(--ink);
      background: var(--paper);
    }
    .print-action {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 2;
      border: 0;
      border-radius: 8px;
      padding: 12px 18px;
      color: #17120c;
      background: linear-gradient(180deg, #e7c98e, var(--gold));
      font-weight: 800;
      box-shadow: 0 10px 30px rgba(0,0,0,.16);
    }
    .summary-page {
      width: 297mm;
      min-height: 210mm;
      margin: 0 auto;
      padding: 16mm 18mm;
    }
    .full-report {
      width: 210mm;
      margin: 0 auto;
      padding: 18mm;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      padding-bottom: 10mm;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .report-header span { color: var(--teal); font-weight: 900; }
    .hero-block, .report-cover { padding: 14mm 0 10mm; }
    .hero-block p, .report-cover p {
      margin: 0 0 10px;
      color: var(--gold);
      font-weight: 800;
    }
    h1 {
      margin: 0;
      font-size: 44px;
      line-height: 1.08;
      letter-spacing: 0;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 16mm;
    }
    .metrics div, .map-node, .report-section {
      border: 1px solid var(--line);
      background: rgba(255,255,255,.58);
      box-shadow: 0 20px 60px rgba(48,42,32,.08);
    }
    .metrics div { min-height: 30mm; padding: 10px; }
    .metrics span, .map-node small, .report-section small {
      color: var(--teal);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .metrics strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
    }
    .metrics small { display: block; color: var(--muted); margin-top: 4px; }
    .mindmap-board {
      position: relative;
      min-height: 0;
      padding: 10mm 0 12mm;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(90deg, rgba(92,138,143,.12) 1px, transparent 1px),
        linear-gradient(180deg, rgba(92,138,143,.12) 1px, transparent 1px);
      background-size: 38mm 24mm;
    }
    .center-node {
      width: 86mm;
      min-height: 0;
      margin: 0 auto 10mm;
      padding: 12px;
      border-radius: 8px;
      color: #fff;
      background: linear-gradient(135deg, #111318, #244144);
    }
    .center-node span { color: var(--gold); font-weight: 900; }
    .center-node strong { display: block; margin-top: 8px; font-size: 18px; line-height: 1.25; }
    .center-node p { margin: 8px 0 0; color: #d7dedf; line-height: 1.5; }
    .node-ring {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      padding: 0;
    }
    .map-node {
      min-height: 36mm;
      padding: 12px;
      border-radius: 8px;
    }
    .map-node h2 {
      margin: 8px 0;
      font-size: 18px;
      line-height: 1.25;
    }
    .map-node p { margin: 0; color: var(--muted); line-height: 1.55; }
    .report-cover {
      min-height: 72mm;
      border-bottom: 1px solid var(--line);
    }
    .report-cover strong {
      display: block;
      width: 86%;
      margin-top: 12mm;
      color: var(--teal);
      font-size: 18px;
      line-height: 1.6;
    }
    .report-section {
      page-break-inside: avoid;
      margin: 10mm 0;
      padding: 10mm;
      border-radius: 8px;
    }
    .report-section h2 {
      margin: 6px 0 8px;
      font-size: 24px;
    }
    .report-section ul {
      margin: 0;
      padding-left: 20px;
      color: #333842;
      line-height: 1.75;
    }
    @page { size: ${mode === "summary" ? "A4 landscape" : "A4 portrait"}; margin: 0; }
    @media print {
      .print-action { display: none; }
      body { background: var(--paper); }
      .summary-page, .full-report { box-shadow: none; }
    }
  </style>
</head>
<body>
  <button class="print-action" onclick="window.print()">导出 PDF</button>
  ${body}
</body>
</html>`;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
