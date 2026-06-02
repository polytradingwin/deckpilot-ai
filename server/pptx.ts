// @ts-expect-error The local CJS wrapper forces Netlify to use pptxgenjs' require export.
import PptxGenJSModule from "./pptxgenjs.cjs";
import type PptxGenJS from "pptxgenjs";
import type { DeckSlide, DeckSpec } from "../src/shared/deck";

const PptxGen = ((PptxGenJSModule as unknown as { default?: typeof PptxGenJS }).default || PptxGenJSModule) as typeof PptxGenJS;

const colors = {
  bg: "08090B",
  panel: "121318",
  panel2: "1B1E24",
  text: "F5F2EC",
  muted: "A3A8AE",
  gold: "D7B981",
  cyan: "A7C8CA",
  sage: "A9B994",
  line: "2C3038",
};

type Accent = keyof Pick<typeof colors, "gold" | "cyan" | "sage">;

export async function renderDeckToPptx(deck: DeckSpec): Promise<Buffer> {
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "DeckPilot AI";
  pptx.company = "DeckPilot AI";
  pptx.subject = deck.subtitle;
  pptx.title = deck.title;
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

  const accent = (deck.theme?.accent || "gold") as Accent;

  deck.slides.forEach((slide, index) => {
    const page = pptx.addSlide();
    paintBackground(page, accent, index);
    renderSlide(page, slide, index, deck.slides.length, accent);
    if (slide.speakerNotes) page.addNotes(slide.speakerNotes);
  });

  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" });
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function paintBackground(page: PptxGenJS.Slide, accent: Accent, index: number) {
  page.background = { color: colors.bg };
  page.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: colors.bg },
    line: { color: colors.bg },
  });
  page.addShape("arc", {
    x: index % 2 === 0 ? 9.4 : -1.2,
    y: -0.8,
    w: 4.8,
    h: 4.8,
    fill: { color: colors[accent], transparency: 82 },
    line: { color: colors[accent], transparency: 100 },
    rotate: 25,
  });
  page.addShape("line", {
    x: 0.65,
    y: 6.92,
    w: 12,
    h: 0,
    line: { color: colors.line, transparency: 12, width: 0.8 },
  });
}

function renderSlide(page: PptxGenJS.Slide, slide: DeckSlide, index: number, total: number, accent: Accent) {
  addHeader(page, slide, index, total, accent);

  if (slide.layout === "cover") {
    renderCover(page, slide, accent);
    return;
  }

  if (slide.layout === "agenda") {
    renderAgenda(page, slide, accent);
    return;
  }

  if (slide.layout === "section") {
    renderSection(page, slide, accent);
    return;
  }

  if (slide.layout === "executiveSummary") {
    renderExecutiveSummary(page, slide, accent);
    return;
  }

  if (slide.layout === "chart" && slide.chart) {
    renderChart(page, slide, accent);
    return;
  }

  if (slide.layout === "comparison") {
    renderComparison(page, slide, accent);
    return;
  }

  if (slide.layout === "timeline") {
    renderTimeline(page, slide, accent);
    return;
  }

  if (slide.layout === "matrix") {
    renderMatrix(page, slide, accent);
    return;
  }

  if (slide.layout === "closing") {
    renderClosing(page, slide, accent);
    return;
  }

  renderContent(page, slide, accent);
}

function addHeader(page: PptxGenJS.Slide, slide: DeckSlide, index: number, total: number, accent: Accent) {
  page.addText(slide.kicker || "DeckPilot AI", {
    x: 0.72,
    y: 0.48,
    w: 7.6,
    h: 0.24,
    fontFace: "Aptos",
    fontSize: 8,
    bold: true,
    color: colors[accent],
    margin: 0,
    breakLine: false,
  });
  page.addText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, {
    x: 11.1,
    y: 0.44,
    w: 1.5,
    h: 0.28,
    align: "right",
    fontFace: "Aptos",
    fontSize: 8,
    color: colors.muted,
    margin: 0,
  });
}

function renderCover(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, {
    x: 0.72,
    y: 1.55,
    w: 10.9,
    h: 1.55,
    fit: "shrink",
    fontFace: "Aptos Display",
    fontSize: 42,
    bold: true,
    color: colors.text,
    margin: 0,
    breakLine: false,
  });
  page.addText(slide.subtitle || "", {
    x: 0.78,
    y: 3.18,
    w: 8.8,
    h: 0.5,
    fit: "shrink",
    fontSize: 16,
    color: colors.muted,
    margin: 0,
  });
  addBulletPanel(page, slide.body || [], 0.78, 4.42, 5.8, accent);
  page.addShape("rect", {
    x: 8.3,
    y: 3.82,
    w: 3.9,
    h: 1.65,
    fill: { color: colors.panel2, transparency: 6 },
    line: { color: colors.line, transparency: 12 },
  });
  page.addText("Generated deck", {
    x: 8.72,
    y: 4.25,
    w: 2.8,
    h: 0.26,
    fontSize: 10,
    bold: true,
    color: colors[accent],
    margin: 0,
  });
  page.addText("Editable .pptx", {
    x: 8.72,
    y: 4.72,
    w: 2.8,
    h: 0.34,
    fontSize: 18,
    bold: true,
    color: colors.text,
    margin: 0,
  });
}

function renderContent(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, {
    x: 0.72,
    y: 1.05,
    w: 7.9,
    h: 0.88,
    fit: "shrink",
    fontFace: "Aptos Display",
    fontSize: 28,
    bold: true,
    color: colors.text,
    margin: 0,
  });
  if (slide.subtitle) {
    page.addText(slide.subtitle, {
      x: 0.74,
      y: 2.02,
      w: 8.5,
      h: 0.36,
      fontSize: 12,
      color: colors.muted,
      margin: 0,
    });
  }
  addBulletPanel(page, slide.body || [], 0.76, 2.72, slide.metric ? 5.35 : 6.25, accent);
  if (slide.metric) {
    addMetricCard(page, slide.metric.label, slide.metric.value, slide.metric.context, accent);
  } else {
    addSideMetric(page, accent, slide.visual);
  }
  addTakeaway(page, slide.takeaway, accent);
}

function renderExecutiveSummary(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  const items = (slide.body || ["关键判断", "推荐动作", "预期影响"]).slice(0, 4);

  items.forEach((item, i) => {
    const x = 0.82 + (i % 2) * 4.15;
    const y = 2.3 + Math.floor(i / 2) * 1.35;
    page.addShape("rect", {
      x,
      y,
      w: 3.75,
      h: 1.02,
      fill: { color: colors.panel2, transparency: 3 },
      line: { color: i === 0 ? colors[accent] : colors.line, transparency: 14 },
    });
    page.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.28,
      y: y + 0.24,
      w: 0.45,
      h: 0.22,
      fontSize: 10,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText(item, {
      x: x + 0.82,
      y: y + 0.22,
      w: 2.65,
      h: 0.46,
      fit: "shrink",
      fontSize: 13,
      bold: true,
      color: colors.text,
      margin: 0,
    });
  });

  if (slide.metric) {
    addMetricCard(page, slide.metric.label, slide.metric.value, slide.metric.context, accent);
  } else {
    addMetricCard(page, "Decision", "01", slide.visual || "recommended path", accent);
  }
  addTakeaway(page, slide.takeaway, accent);
}

function renderAgenda(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  const items = (slide.body?.length ? slide.body : ["现状判断", "关键证据", "解决路径", "执行节奏"]).slice(0, 6);
  items.forEach((item, i) => {
    const y = 2.15 + i * 0.62;
    page.addShape("rect", {
      x: 0.86,
      y,
      w: 0.5,
      h: 0.38,
      fill: { color: i === 0 ? colors[accent] : colors.panel2, transparency: i === 0 ? 0 : 8 },
      line: { color: i === 0 ? colors[accent] : colors.line, transparency: 18 },
    });
    page.addText(String(i + 1).padStart(2, "0"), {
      x: 0.98,
      y: y + 0.09,
      w: 0.25,
      h: 0.14,
      fontSize: 8,
      bold: true,
      color: i === 0 ? colors.bg : colors[accent],
      margin: 0,
      align: "center",
    });
    page.addText(item, {
      x: 1.65,
      y: y + 0.02,
      w: 8.8,
      h: 0.3,
      fit: "shrink",
      fontSize: 16,
      bold: i === 0,
      color: colors.text,
      margin: 0,
    });
  });
  addTakeaway(page, slide.takeaway || "A clear narrative map keeps the audience oriented before the evidence deep-dive.", accent);
}

function renderSection(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addShape("rect", {
    x: 0.78,
    y: 1.35,
    w: 0.12,
    h: 4.5,
    fill: { color: colors[accent] },
    line: { color: colors[accent] },
  });
  page.addText(slide.kicker || "Section", {
    x: 1.2,
    y: 1.58,
    w: 2.8,
    h: 0.26,
    fontSize: 10,
    bold: true,
    color: colors[accent],
    margin: 0,
  });
  page.addText(slide.title, {
    x: 1.18,
    y: 2.05,
    w: 9.4,
    h: 1.35,
    fit: "shrink",
    fontFace: "Aptos Display",
    fontSize: 34,
    bold: true,
    color: colors.text,
    margin: 0,
  });
  page.addText(slide.subtitle || slide.takeaway || "", {
    x: 1.22,
    y: 3.65,
    w: 7.6,
    h: 0.52,
    fit: "shrink",
    fontSize: 15,
    color: colors.muted,
    margin: 0,
  });
}

function renderClosing(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, {
    x: 0.78,
    y: 1.15,
    w: 9.6,
    h: 0.95,
    fit: "shrink",
    fontFace: "Aptos Display",
    fontSize: 30,
    bold: true,
    color: colors.text,
    margin: 0,
  });
  const items = (slide.body || ["Confirm decision", "Assign owner", "Start next sprint"]).slice(0, 3);
  items.forEach((item, i) => {
    const x = 0.82 + i * 4.0;
    page.addShape("rect", {
      x,
      y: 3.0,
      w: 3.35,
      h: 1.75,
      fill: { color: colors.panel2, transparency: 4 },
      line: { color: i === 0 ? colors[accent] : colors.line, transparency: 16 },
    });
    page.addText(`0${i + 1}`, {
      x: x + 0.28,
      y: 3.28,
      w: 0.55,
      h: 0.28,
      fontSize: 12,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText(item, {
      x: x + 0.28,
      y: 3.85,
      w: 2.65,
      h: 0.62,
      fit: "shrink",
      fontSize: 16,
      bold: true,
      color: colors.text,
      margin: 0,
    });
  });
  addTakeaway(page, slide.takeaway, accent);
}

function renderComparison(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  const body = slide.body || [];
  const labels = ["Input", "Process", "Output"];

  labels.forEach((label, i) => {
    page.addShape("rect", {
      x: 0.78 + i * 4.05,
      y: 2.45,
      w: 3.55,
      h: 2.58,
      fill: { color: colors.panel2, transparency: 4 },
      line: { color: i === 1 ? colors[accent] : colors.line, transparency: 18 },
    });
    page.addText(label, {
      x: 1.08 + i * 4.05,
      y: 2.82,
      w: 2.8,
      h: 0.28,
      fontSize: 10,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText(body[i] || "", {
      x: 1.08 + i * 4.05,
      y: 3.35,
      w: 2.85,
      h: 1.2,
      fit: "shrink",
      fontSize: 16,
      bold: true,
      color: colors.text,
      margin: 0,
      breakLine: false,
    });
  });
}

function renderChart(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  addBulletPanel(page, slide.body || [], 0.78, 2.4, 4.4, accent);

  const chart = slide.chart!;
  page.addText(chart.title, {
    x: 6.3,
    y: 2.02,
    w: 5.2,
    h: 0.36,
    fontSize: 12,
    bold: true,
    color: colors.muted,
    margin: 0,
  });

  const max = Math.max(...chart.values, 1);
  chart.values.forEach((value, i) => {
    const barHeight = 2.5 * (value / max);
    const x = 6.3 + i * 0.82;
    page.addShape("rect", {
      x,
      y: 5.25 - barHeight,
      w: 0.46,
      h: barHeight,
      fill: { color: i === chart.values.length - 1 ? colors[accent] : colors.cyan, transparency: 4 },
      line: { color: colors.line, transparency: 100 },
    });
    page.addText(chart.labels[i] || "", {
      x: x - 0.12,
      y: 5.48,
      w: 0.72,
      h: 0.24,
      fit: "shrink",
      fontSize: 7,
      color: colors.muted,
      align: "center",
      margin: 0,
    });
  });

  addTakeaway(page, slide.takeaway, accent);
}

function renderTimeline(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  const items = (slide.body || ["启动", "验证", "扩展", "规模化"]).slice(0, 5);
  const startX = 0.95;
  const stepW = 2.18;

  page.addShape("line", {
    x: startX + 0.3,
    y: 3.42,
    w: stepW * (items.length - 1),
    h: 0,
    line: { color: colors[accent], transparency: 12, width: 1.5 },
  });

  items.forEach((item, i) => {
    const x = startX + i * stepW;
    page.addShape("ellipse", {
      x,
      y: 3.08,
      w: 0.68,
      h: 0.68,
      fill: { color: i === 0 ? colors[accent] : colors.panel2, transparency: i === 0 ? 0 : 3 },
      line: { color: colors[accent], transparency: i === 0 ? 0 : 22 },
    });
    page.addText(String(i + 1), {
      x: x + 0.22,
      y: 3.27,
      w: 0.24,
      h: 0.16,
      fontSize: 9,
      bold: true,
      color: i === 0 ? colors.bg : colors[accent],
      margin: 0,
      align: "center",
    });
    page.addText(item, {
      x: x - 0.08,
      y: 4.12,
      w: 1.55,
      h: 0.72,
      fit: "shrink",
      fontSize: 12,
      bold: true,
      color: colors.text,
      margin: 0,
      align: "center",
    });
  });

  addTakeaway(page, slide.takeaway, accent);
}

function renderMatrix(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  const items = (slide.body || ["高价值 / 低复杂", "高价值 / 高复杂", "低价值 / 低复杂", "低价值 / 高复杂"]).slice(0, 4);
  const labels = ["High impact", "Strategic bet", "Quick win", "Defer"];

  items.forEach((item, i) => {
    const x = 0.86 + (i % 2) * 4.72;
    const y = 2.34 + Math.floor(i / 2) * 1.42;
    page.addShape("rect", {
      x,
      y,
      w: 4.1,
      h: 1.05,
      fill: { color: colors.panel2, transparency: 4 },
      line: { color: i === 0 ? colors[accent] : colors.line, transparency: 16 },
    });
    page.addText(labels[i], {
      x: x + 0.28,
      y: y + 0.2,
      w: 1.2,
      h: 0.18,
      fit: "shrink",
      fontSize: 8,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText(item, {
      x: x + 0.28,
      y: y + 0.5,
      w: 3.35,
      h: 0.34,
      fit: "shrink",
      fontSize: 12,
      bold: true,
      color: colors.text,
      margin: 0,
    });
  });

  addTakeaway(page, slide.takeaway, accent);
}

function addBulletPanel(page: PptxGenJS.Slide, items: string[], x: number, y: number, w: number, accent: Accent) {
  const rows = items.length ? items.slice(0, 5) : ["核心观点", "支撑证据", "下一步行动"];
  rows.forEach((item, i) => {
    const top = y + i * 0.58;
    page.addShape("ellipse", {
      x,
      y: top + 0.05,
      w: 0.16,
      h: 0.16,
      fill: { color: colors[accent] },
      line: { color: colors[accent] },
    });
    page.addText(item, {
      x: x + 0.36,
      y: top,
      w,
      h: 0.32,
      fit: "shrink",
      fontSize: 15,
      color: colors.text,
      margin: 0,
      breakLine: false,
    });
  });
}

function addTakeaway(page: PptxGenJS.Slide, takeaway: string | undefined, accent: Accent) {
  if (!takeaway) return;
  page.addShape("rect", {
    x: 0.78,
    y: 6.02,
    w: 10.6,
    h: 0.54,
    fill: { color: colors[accent], transparency: 82 },
    line: { color: colors[accent], transparency: 28 },
  });
  page.addText(takeaway, {
    x: 1.05,
    y: 6.16,
    w: 9.9,
    h: 0.24,
    fit: "shrink",
    fontSize: 10,
    bold: true,
    color: colors.text,
    margin: 0,
  });
}

function addMetricCard(page: PptxGenJS.Slide, label: string, value: string, context: string | undefined, accent: Accent) {
  page.addShape("rect", {
    x: 9.45,
    y: 2.05,
    w: 2.55,
    h: 2.95,
    fill: { color: colors.panel2, transparency: 8 },
    line: { color: colors.line, transparency: 14 },
  });
  page.addText(label || "Metric", {
    x: 9.78,
    y: 2.48,
    w: 1.8,
    h: 0.25,
    fontSize: 9,
    bold: true,
    color: colors[accent],
    margin: 0,
  });
  page.addText(value || "01", {
    x: 9.78,
    y: 3.02,
    w: 1.95,
    h: 0.7,
    fit: "shrink",
    fontSize: 30,
    bold: true,
    color: colors.text,
    margin: 0,
  });
  page.addText(context || "decision evidence", {
    x: 9.78,
    y: 3.92,
    w: 1.8,
    h: 0.42,
    fit: "shrink",
    fontSize: 9,
    color: colors.muted,
    margin: 0,
  });
}

function addSideMetric(page: PptxGenJS.Slide, accent: Accent, visual?: string) {
  addMetricCard(page, "Visual logic", "01", visual || "message-first slide", accent);
}

function titleOptions(): PptxGenJS.TextPropsOptions {
  return {
    x: 0.72,
    y: 1.05,
    w: 9.6,
    h: 0.78,
    fit: "shrink",
    fontFace: "Aptos Display",
    fontSize: 28,
    bold: true,
    color: colors.text,
    margin: 0,
  };
}
