// @ts-expect-error The local CJS wrapper forces Netlify to use pptxgenjs' require export.
import PptxGenJSModule from "./pptxgenjs.cjs";
import type PptxGenJS from "pptxgenjs";
import type { DeckSlide, DeckSpec, DeckTemplate } from "../src/shared/deck";

const PptxGen = ((PptxGenJSModule as unknown as { default?: typeof PptxGenJS }).default || PptxGenJSModule) as typeof PptxGenJS;

const palettes = {
  executiveDark: {
    bg: "08090B",
    panel: "121318",
    panel2: "1B1E24",
    text: "F5F2EC",
    muted: "A3A8AE",
    gold: "D7B981",
    cyan: "A7C8CA",
    sage: "A9B994",
    line: "2C3038",
  },
  editorialLight: {
    bg: "F7F3EA",
    panel: "FFFCF6",
    panel2: "EFE7D9",
    text: "171512",
    muted: "716B61",
    gold: "B98B49",
    cyan: "4E8791",
    sage: "697D52",
    line: "D7CCBA",
  },
  dataGrid: {
    bg: "091018",
    panel: "101B26",
    panel2: "172635",
    text: "EEF7F8",
    muted: "8FA2AA",
    gold: "CDAA70",
    cyan: "69C4D0",
    sage: "8FB989",
    line: "26394A",
  },
  productNeon: {
    bg: "070A12",
    panel: "101522",
    panel2: "182033",
    text: "F4F7FF",
    muted: "97A5BD",
    gold: "E2BE75",
    cyan: "70D6E5",
    sage: "9CCE8E",
    line: "29334D",
  },
  warmBoardroom: {
    bg: "17130F",
    panel: "221D18",
    panel2: "2D251E",
    text: "FFF7EC",
    muted: "B4A89B",
    gold: "D6A85F",
    cyan: "8FBCC0",
    sage: "A7B278",
    line: "45382A",
  },
  academicPaper: {
    bg: "FAF7F0",
    panel: "FFFDF8",
    panel2: "ECE8DD",
    text: "20231D",
    muted: "62685D",
    gold: "A98647",
    cyan: "557F87",
    sage: "647A56",
    line: "D2D0C6",
  },
} satisfies Record<DeckTemplate, Record<"bg" | "panel" | "panel2" | "text" | "muted" | "gold" | "cyan" | "sage" | "line", string>>;

let colors = palettes.executiveDark;

const templateByStyle = {
  consulting: "executiveDark",
  product: "productNeon",
  brand: "editorialLight",
  academic: "academicPaper",
} as const satisfies Record<string, DeckTemplate>;

type Accent = "gold" | "cyan" | "sage";

export async function renderDeckToPptx(deck: DeckSpec): Promise<Buffer> {
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "DeckEvo";
  pptx.company = "DeckEvo";
  pptx.subject = deck.subtitle;
  pptx.title = deck.title;
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
  };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

  const accent = (deck.theme?.accent || "gold") as Accent;
  const template = resolveTemplate(deck);
  colors = palettes[template];

  deck.slides.forEach((slide, index) => {
    const page = pptx.addSlide();
    paintBackground(page, accent, index, template);
    renderSlide(page, slide, index, deck.slides.length, accent, template);
    if (slide.speakerNotes) page.addNotes(slide.speakerNotes);
  });

  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" });
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function resolveTemplate(deck: DeckSpec): DeckTemplate {
  const requested = deck.theme?.template;
  if (requested && requested in palettes) return requested;
  const fromMood = templateByStyle[(deck.theme?.mood || "") as keyof typeof templateByStyle];
  return fromMood || "executiveDark";
}

function paintBackground(page: PptxGenJS.Slide, accent: Accent, index: number, template: DeckTemplate) {
  page.background = { color: colors.bg };
  page.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: colors.bg },
    line: { color: colors.bg },
  });

  if (template === "editorialLight" || template === "academicPaper") {
    page.addShape("rect", {
      x: 0,
      y: 0,
      w: template === "academicPaper" ? 0.18 : 0.42,
      h: 7.5,
      fill: { color: colors[accent], transparency: template === "academicPaper" ? 32 : 0 },
      line: { color: colors[accent], transparency: 100 },
    });
    page.addShape("line", {
      x: 0.72,
      y: 0.88,
      w: 11.9,
      h: 0,
      line: { color: colors.line, transparency: 0, width: 0.8 },
    });
    return;
  }

  if (template === "dataGrid") {
    for (let x = 0.8; x < 12.6; x += 1.3) {
      page.addShape("line", {
        x,
        y: 0.95,
        w: 0,
        h: 5.7,
        line: { color: colors.line, transparency: 58, width: 0.35 },
      });
    }
    for (let y = 1.15; y < 6.5; y += 0.82) {
      page.addShape("line", {
        x: 0.72,
        y,
        w: 11.9,
        h: 0,
        line: { color: colors.line, transparency: 60, width: 0.35 },
      });
    }
    page.addShape("rect", {
      x: 10.55,
      y: 0,
      w: 2.78,
      h: 7.5,
      fill: { color: colors.panel2, transparency: 16 },
      line: { color: colors.panel2, transparency: 100 },
    });
    return;
  }

  if (template === "warmBoardroom") {
    page.addShape("rect", {
      x: 0,
      y: 5.72,
      w: 13.333,
      h: 1.02,
      fill: { color: colors[accent], transparency: 78 },
      line: { color: colors[accent], transparency: 100 },
    });
    page.addShape("line", {
      x: 0.74,
      y: 1,
      w: 11.9,
      h: 0,
      line: { color: colors[accent], transparency: 32, width: 1.1 },
    });
    return;
  }

  if (template === "productNeon") {
    page.addShape("rect", {
      x: 8.85,
      y: 0.82,
      w: 3.2,
      h: 5.75,
      fill: { color: colors.panel2, transparency: 30 },
      line: { color: colors.cyan, transparency: 72, width: 1 },
    });
    page.addShape("line", {
      x: 0.65,
      y: 6.75,
      w: 11.8,
      h: -4.9,
      line: { color: colors[accent], transparency: 68, width: 1.2 },
    });
  }

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

function renderSlide(page: PptxGenJS.Slide, slide: DeckSlide, index: number, total: number, accent: Accent, template: DeckTemplate) {
  addHeader(page, slide, index, total, accent);

  if (slide.layout === "cover") {
    renderCover(page, slide, accent, template);
    return;
  }

  if (slide.layout === "agenda") {
    renderAgenda(page, slide, accent);
    return;
  }

  if (slide.layout === "section") {
    renderSection(page, slide, accent, template);
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

  if (slide.layout === "heroMetric") {
    renderHeroMetric(page, slide, accent, template);
    return;
  }

  if (slide.layout === "process") {
    renderProcess(page, slide, accent);
    return;
  }

  if (slide.layout === "caseStudy") {
    renderCaseStudy(page, slide, accent);
    return;
  }

  if (slide.layout === "quote") {
    renderQuote(page, slide, accent, template);
    return;
  }

  if (slide.layout === "dashboard") {
    renderDashboard(page, slide, accent);
    return;
  }

  if (slide.layout === "closing") {
    renderClosing(page, slide, accent);
    return;
  }

  renderContent(page, slide, accent, template);
}

function addHeader(page: PptxGenJS.Slide, slide: DeckSlide, index: number, total: number, accent: Accent) {
  page.addText(slide.kicker || "DeckEvo", {
    x: 0.72,
    y: 0.48,
    w: 7.6,
    h: 0.24,
    fontFace: "Microsoft YaHei",
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
    fontFace: "Microsoft YaHei",
    fontSize: 8,
    color: colors.muted,
    margin: 0,
  });
}

function renderCover(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent, template: DeckTemplate) {
  if (template === "editorialLight") {
    page.addText(slide.kicker || "DeckEvo", {
      x: 0.82,
      y: 1.02,
      w: 2.8,
      h: 0.24,
      fontSize: 8,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText(slide.title, {
      x: 0.82,
      y: 1.56,
      w: 7.15,
      h: 1.72,
      fit: "shrink",
      fontFace: "Microsoft YaHei",
      fontSize: 39,
      bold: true,
      color: colors.text,
      margin: 0,
    });
    page.addText(slide.subtitle || "", {
      x: 0.86,
      y: 3.48,
      w: 6.05,
      h: 0.48,
      fit: "shrink",
      fontSize: 13,
      color: colors.muted,
      margin: 0,
    });
    page.addShape("rect", {
      x: 8.4,
      y: 1.2,
      w: 3.75,
      h: 4.65,
      fill: { color: colors.panel2, transparency: 0 },
      line: { color: colors.line, transparency: 0 },
    });
    addBulletPanel(page, slide.body || [], 8.78, 2.0, 2.72, accent);
    return;
  }

  if (template === "academicPaper") {
    page.addText(slide.title, {
      x: 1.28,
      y: 1.68,
      w: 10.05,
      h: 1.42,
      fit: "shrink",
      fontFace: "Microsoft YaHei",
      fontSize: 34,
      bold: true,
      color: colors.text,
      margin: 0,
      align: "center",
    });
    page.addShape("line", {
      x: 3.8,
      y: 3.32,
      w: 5.7,
      h: 0,
      line: { color: colors[accent], transparency: 0, width: 1 },
    });
    page.addText(slide.subtitle || "", {
      x: 2.35,
      y: 3.62,
      w: 8.8,
      h: 0.44,
      fit: "shrink",
      fontSize: 13,
      color: colors.muted,
      margin: 0,
      align: "center",
    });
    addBulletPanel(page, slide.body || [], 3.36, 4.55, 5.75, accent);
    return;
  }

  if (template === "productNeon" || template === "dataGrid") {
    page.addShape("rect", {
      x: 0.78,
      y: 1.0,
      w: 0.13,
      h: 4.75,
      fill: { color: colors[accent] },
      line: { color: colors[accent] },
    });
  }

  page.addText(slide.title, {
    x: 0.72,
    y: 1.55,
    w: 10.9,
    h: 1.55,
    fit: "shrink",
    fontFace: "Microsoft YaHei",
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

function renderContent(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent, template: DeckTemplate) {
  if (template === "editorialLight" || template === "academicPaper") {
    page.addText(slide.title, {
      x: 0.86,
      y: 1.16,
      w: 10.4,
      h: 0.76,
      fit: "shrink",
      fontFace: "Microsoft YaHei",
      fontSize: template === "academicPaper" ? 24 : 27,
      bold: true,
      color: colors.text,
      margin: 0,
    });
    if (slide.subtitle) {
      page.addText(slide.subtitle, {
        x: 0.88,
        y: 2.0,
        w: 8.4,
        h: 0.34,
        fontSize: 11,
        color: colors.muted,
        margin: 0,
      });
    }
    addBulletPanel(page, slide.body || [], 0.92, 2.72, 6.2, accent);
    addMetricCard(page, slide.metric?.label || "Focus", slide.metric?.value || "01", slide.metric?.context || slide.visual, accent);
    addTakeaway(page, slide.takeaway, accent);
    return;
  }

  page.addText(slide.title, {
    x: 0.72,
    y: 1.05,
    w: 7.9,
    h: 0.88,
    fit: "shrink",
    fontFace: "Microsoft YaHei",
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

function renderSection(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent, template: DeckTemplate) {
  if (template === "editorialLight" || template === "academicPaper") {
    page.addShape("rect", {
      x: 0.86,
      y: 1.2,
      w: 11.4,
      h: 4.6,
      fill: { color: colors.panel, transparency: template === "academicPaper" ? 2 : 0 },
      line: { color: colors.line, transparency: 0 },
    });
    page.addText(slide.kicker || "Section", {
      x: 1.28,
      y: 1.72,
      w: 2.6,
      h: 0.24,
      fontSize: 9,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText(slide.title, {
      x: 1.26,
      y: 2.25,
      w: 8.8,
      h: 1.18,
      fit: "shrink",
      fontFace: "Microsoft YaHei",
      fontSize: 31,
      bold: true,
      color: colors.text,
      margin: 0,
    });
    page.addText(slide.subtitle || slide.takeaway || "", {
      x: 1.3,
      y: 3.72,
      w: 7.3,
      h: 0.48,
      fit: "shrink",
      fontSize: 13,
      color: colors.muted,
      margin: 0,
    });
    return;
  }

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
    fontFace: "Microsoft YaHei",
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
    fontFace: "Microsoft YaHei",
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

function renderHeroMetric(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent, template: DeckTemplate) {
  page.addText(slide.kicker || "Key signal", {
    x: 0.78,
    y: 1.05,
    w: 2.6,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: colors[accent],
    margin: 0,
  });
  page.addText(slide.title, {
    x: 0.76,
    y: 1.48,
    w: 6.25,
    h: 1.15,
    fit: "shrink",
    fontFace: "Microsoft YaHei",
    fontSize: template === "academicPaper" ? 25 : 31,
    bold: true,
    color: colors.text,
    margin: 0,
  });
  if (slide.subtitle) {
    page.addText(slide.subtitle, {
      x: 0.78,
      y: 2.86,
      w: 5.65,
      h: 0.38,
      fit: "shrink",
      fontSize: 11,
      color: colors.muted,
      margin: 0,
    });
  }

  page.addShape("rect", {
    x: 7.4,
    y: 1.48,
    w: 4.45,
    h: 3.7,
    fill: { color: colors.panel2, transparency: 4 },
    line: { color: colors[accent], transparency: 16, width: 1.2 },
  });
  page.addText(slide.metric?.label || "Primary signal", {
    x: 7.82,
    y: 1.92,
    w: 2.6,
    h: 0.26,
    fontSize: 9,
    bold: true,
    color: colors[accent],
    margin: 0,
  });
  page.addText(slide.metric?.value || "01", {
    x: 7.78,
    y: 2.48,
    w: 3.45,
    h: 0.9,
    fit: "shrink",
    fontFace: "Microsoft YaHei",
    fontSize: 39,
    bold: true,
    color: colors.text,
    margin: 0,
  });
  page.addText(slide.metric?.context || slide.visual || "decision-grade evidence", {
    x: 7.84,
    y: 3.58,
    w: 3.15,
    h: 0.56,
    fit: "shrink",
    fontSize: 11,
    color: colors.muted,
    margin: 0,
  });

  addBulletPanel(page, slide.body || [], 0.8, 3.78, 5.15, accent);
  addTakeaway(page, slide.takeaway, accent);
}

function renderProcess(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  if (slide.subtitle) {
    page.addText(slide.subtitle, {
      x: 0.76,
      y: 1.88,
      w: 7.8,
      h: 0.32,
      fit: "shrink",
      fontSize: 11,
      color: colors.muted,
      margin: 0,
    });
  }

  const steps = (slide.body || ["Input", "Transform", "Review", "Deliver"]).slice(0, 5);
  const startX = 0.78;
  const cardW = steps.length > 4 ? 2.14 : 2.58;
  const gap = steps.length > 4 ? 0.18 : 0.32;
  const y = 3.05;

  steps.forEach((step, i) => {
    const x = startX + i * (cardW + gap);
    if (i > 0) {
      page.addShape("line", {
        x: x - gap + 0.02,
        y: y + 0.72,
        w: gap - 0.04,
        h: 0,
        line: { color: colors[accent], transparency: 18, width: 1.2 },
      });
    }
    page.addShape("rect", {
      x,
      y,
      w: cardW,
      h: 1.45,
      fill: { color: i === 0 ? colors[accent] : colors.panel2, transparency: i === 0 ? 0 : 5 },
      line: { color: i === 0 ? colors[accent] : colors.line, transparency: 14 },
    });
    page.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.22,
      y: y + 0.22,
      w: 0.42,
      h: 0.2,
      fontSize: 9,
      bold: true,
      color: i === 0 ? colors.bg : colors[accent],
      margin: 0,
    });
    page.addText(step, {
      x: x + 0.24,
      y: y + 0.72,
      w: cardW - 0.48,
      h: 0.42,
      fit: "shrink",
      fontSize: 12,
      bold: true,
      color: i === 0 ? colors.bg : colors.text,
      margin: 0,
    });
  });

  addTakeaway(page, slide.takeaway, accent);
}

function renderCaseStudy(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  const labels = ["Situation", "Move", "Result"];
  const items = (slide.body || ["Current constraint", "Recommended intervention", "Expected outcome"]).slice(0, 3);

  labels.forEach((label, i) => {
    const x = 0.82 + i * 3.95;
    page.addShape("rect", {
      x,
      y: 2.42,
      w: 3.35,
      h: 2.4,
      fill: { color: colors.panel2, transparency: 4 },
      line: { color: i === 2 ? colors[accent] : colors.line, transparency: 14 },
    });
    page.addShape("rect", {
      x,
      y: 2.42,
      w: 3.35,
      h: 0.42,
      fill: { color: i === 2 ? colors[accent] : colors.panel, transparency: i === 2 ? 0 : 2 },
      line: { color: i === 2 ? colors[accent] : colors.line, transparency: 100 },
    });
    page.addText(label, {
      x: x + 0.28,
      y: 2.54,
      w: 1.8,
      h: 0.16,
      fit: "shrink",
      fontSize: 8,
      bold: true,
      color: i === 2 ? colors.bg : colors[accent],
      margin: 0,
    });
    page.addText(items[i] || "", {
      x: x + 0.3,
      y: 3.22,
      w: 2.62,
      h: 0.92,
      fit: "shrink",
      fontSize: 15,
      bold: true,
      color: colors.text,
      margin: 0,
    });
  });

  if (slide.metric) {
    page.addText(`${slide.metric.label}: ${slide.metric.value}`, {
      x: 0.9,
      y: 5.18,
      w: 5.4,
      h: 0.28,
      fit: "shrink",
      fontSize: 11,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
  }
  addTakeaway(page, slide.takeaway, accent);
}

function renderQuote(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent, template: DeckTemplate) {
  page.addShape("rect", {
    x: 0.9,
    y: 1.42,
    w: 0.12,
    h: 4.3,
    fill: { color: colors[accent] },
    line: { color: colors[accent] },
  });
  page.addText(slide.kicker || "Recommendation", {
    x: 1.34,
    y: 1.48,
    w: 2.6,
    h: 0.22,
    fontSize: 9,
    bold: true,
    color: colors[accent],
    margin: 0,
  });
  page.addText(slide.title, {
    x: 1.32,
    y: 2.02,
    w: 9.4,
    h: 1.68,
    fit: "shrink",
    fontFace: "Microsoft YaHei",
    fontSize: template === "academicPaper" ? 25 : 31,
    bold: true,
    color: colors.text,
    margin: 0,
  });
  const support = slide.subtitle || slide.body?.[0] || slide.takeaway || "";
  page.addText(support, {
    x: 1.36,
    y: 4.1,
    w: 7.2,
    h: 0.48,
    fit: "shrink",
    fontSize: 13,
    color: colors.muted,
    margin: 0,
  });
  if (slide.metric) {
    addMetricCard(page, slide.metric.label, slide.metric.value, slide.metric.context, accent);
  } else {
    page.addShape("rect", {
      x: 9.5,
      y: 4.05,
      w: 2.15,
      h: 0.9,
      fill: { color: colors.panel2, transparency: 5 },
      line: { color: colors.line, transparency: 16 },
    });
    page.addText("Decision", {
      x: 9.82,
      y: 4.26,
      w: 1.3,
      h: 0.18,
      fontSize: 8,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText("Now", {
      x: 9.82,
      y: 4.55,
      w: 1.3,
      h: 0.24,
      fontSize: 14,
      bold: true,
      color: colors.text,
      margin: 0,
    });
  }
}

function renderDashboard(page: PptxGenJS.Slide, slide: DeckSlide, accent: Accent) {
  page.addText(slide.title, titleOptions());
  const cards = buildDashboardCards(slide);

  cards.forEach((card, i) => {
    const x = 0.82 + (i % 2) * 3.28;
    const y = 2.18 + Math.floor(i / 2) * 1.42;
    page.addShape("rect", {
      x,
      y,
      w: 2.75,
      h: 1.03,
      fill: { color: colors.panel2, transparency: 4 },
      line: { color: i === 0 ? colors[accent] : colors.line, transparency: 14 },
    });
    page.addText(card.label, {
      x: x + 0.26,
      y: y + 0.16,
      w: 2.16,
      h: 0.18,
      fit: "shrink",
      fontSize: 7.2,
      bold: true,
      color: colors[accent],
      margin: 0,
    });
    page.addText(card.value, {
      x: x + 0.26,
      y: y + 0.42,
      w: 2.18,
      h: 0.42,
      fit: "shrink",
      fontSize: 10,
      bold: false,
      color: colors.text,
      margin: 0,
      breakLine: false,
    });
  });

  const labels = slide.chart?.labels || cards.map((card) => card.label);
  const values = slide.chart?.values || cards.map((_, i) => 55 + i * 11);
  const max = Math.max(...values, 1);
  page.addShape("rect", {
    x: 7.72,
    y: 2.0,
    w: 3.9,
    h: 3.35,
    fill: { color: colors.panel2, transparency: 7 },
    line: { color: colors.line, transparency: 16 },
  });
  page.addText(slide.chart?.title || "Operating signal", {
    x: 8.05,
    y: 2.32,
    w: 2.7,
    h: 0.22,
    fit: "shrink",
    fontSize: 9,
    bold: true,
    color: colors[accent],
    margin: 0,
  });
  values.slice(0, 5).forEach((value, i) => {
    const w = 2.7 * (value / max);
    const y = 2.9 + i * 0.42;
    page.addText(labels[i] || "", {
      x: 8.05,
      y: y - 0.03,
      w: 0.72,
      h: 0.16,
      fit: "shrink",
      fontSize: 6,
      color: colors.muted,
      margin: 0,
    });
    page.addShape("rect", {
      x: 8.88,
      y,
      w,
      h: 0.16,
      fill: { color: i === values.length - 1 ? colors[accent] : colors.cyan, transparency: 3 },
      line: { color: colors.line, transparency: 100 },
    });
  });

  addTakeaway(page, slide.takeaway, accent);
}

function buildDashboardCards(slide: DeckSlide) {
  const body = slide.body || [];
  const cards = [
    { label: slide.metric?.label || "Primary", value: slide.metric?.value || body[0] || "01" },
    { label: "Momentum", value: body[1] || "On track" },
    { label: "Constraint", value: body[2] || "Known risk" },
    { label: "Next move", value: body[3] || "Owner set" },
  ];
  return cards.map((card) => ({
    label: compactText(card.label, 18),
    value: compactText(card.value, 52),
  }));
}

function compactText(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
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
    fontFace: "Microsoft YaHei",
    fontSize: 28,
    bold: true,
    color: colors.text,
    margin: 0,
  };
}

