// @ts-expect-error The local CJS wrapper forces Netlify to use pptxgenjs' require export.
import PptxGenJSModule from "./pptxgenjs.cjs";
import type PptxGenJS from "pptxgenjs";
import type { DeckSlide, DeckSpec } from "../src/shared/deck";
import type { RenderAssets } from "./pptx";
import type { SourceImageAsset } from "./pptxReader";

const PptxGen = ((PptxGenJSModule as unknown as { default?: typeof PptxGenJS }).default || PptxGenJSModule) as typeof PptxGenJS;

const W = 1920;
const H = 1080;

type Theme = {
  bg: string;
  panel: string;
  panel2: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  line: string;
  dark: boolean;
};

export async function renderHighQualityDeckToPptx(deck: DeckSpec, assets: RenderAssets = {}) {
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "DeckEvo";
  pptx.company = "DeckEvo";
  pptx.subject = deck.subtitle;
  pptx.title = deck.title;
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

  const theme = resolveTheme(deck);
  deck.slides.forEach((slide, index) => {
    const page = pptx.addSlide();
    const image = pickSourceImage(slide, index, assets.sourceImages);
    const visualLayout = chooseVisualLayout(slide, index, deck.slides.length, Boolean(image));
    const svg = renderSlideSvg(deck, slide, index, theme, image, visualLayout);
    page.addImage({
      data: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
    });
    addSourceImageLayer(page, image, visualLayout);
    if (slide.speakerNotes) page.addNotes(slide.speakerNotes);
  });

  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" });
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function renderSlideSvg(deck: DeckSpec, slide: DeckSlide, index: number, theme: Theme, image: SourceImageAsset | null, layout: string) {
  const titleLines = wrapText(slide.title || deck.title, layout === "poster" ? 17 : 23, layout === "poster" ? 3 : 2);
  const subtitle = slide.subtitle || slide.takeaway || "";
  const body = (slide.body || []).slice(0, layout === "dashboard" ? 4 : 5);
  const pageNo = `${String(index + 1).padStart(2, "0")} / ${String(deck.slides.length).padStart(2, "0")}`;
  const imageSvg = image ? imageElement(image, layout, theme) : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    defs(theme),
    background(theme, index),
    `<text x="88" y="74" ${textStyle(22, 800, theme.accent)}>${escapeXml(slide.kicker || deck.audience || "DeckEvo")}</text>`,
    `<text x="1744" y="74" ${textStyle(22, 600, theme.muted)} text-anchor="end">${pageNo}</text>`,
    layout === "poster"
      ? renderPoster(slide, titleLines, subtitle, body, imageSvg, theme)
      : layout === "split"
        ? renderSplit(slide, titleLines, subtitle, body, imageSvg, theme)
        : layout === "dashboard"
          ? renderDashboard(slide, titleLines, body, imageSvg, theme)
          : renderEditorial(slide, titleLines, subtitle, body, imageSvg, theme),
    footer(slide.takeaway, theme),
    "</svg>",
  ].join("");
}

function renderPoster(slide: DeckSlide, titleLines: string[], subtitle: string, body: string[], imageSvg: string, theme: Theme) {
  return [
    `<rect x="82" y="128" width="1756" height="840" rx="34" fill="${theme.panel}" opacity="0.86"/>`,
    `<circle cx="1520" cy="270" r="250" fill="${theme.accent}" opacity="0.20"/>`,
    `<circle cx="1680" cy="800" r="190" fill="${theme.accent2}" opacity="0.18"/>`,
    textBlock(titleLines, 128, 258, 90, 104, 900, theme.text),
    subtitle ? `<text x="132" y="${322 + titleLines.length * 104}" ${textStyle(34, 500, theme.muted)}>${escapeXml(compact(subtitle, 72))}</text>` : "",
    imageSvg,
    renderPills(body, 132, 704, theme),
  ].join("");
}

function renderSplit(slide: DeckSlide, titleLines: string[], subtitle: string, body: string[], imageSvg: string, theme: Theme) {
  return [
    `<rect x="88" y="132" width="780" height="778" rx="30" fill="${theme.panel}" opacity="0.92"/>`,
    `<rect x="932" y="132" width="780" height="778" rx="30" fill="${theme.panel2}" opacity="0.90"/>`,
    `<rect x="128" y="176" width="10" height="120" rx="5" fill="${theme.accent}"/>`,
    textBlock(titleLines, 162, 222, 58, 70, 900, theme.text),
    subtitle ? `<text x="162" y="${270 + titleLines.length * 70}" ${textStyle(27, 500, theme.muted)}>${escapeXml(compact(subtitle, 58))}</text>` : "",
    bulletList(body, 162, 472, 560, theme),
    imageSvg || visualFallback(slide, 1010, 250, 560, 380, theme),
  ].join("");
}

function renderDashboard(slide: DeckSlide, titleLines: string[], body: string[], imageSvg: string, theme: Theme) {
  const metric = slide.metric;
  return [
    textBlock(titleLines, 92, 176, 54, 66, 900, theme.text),
    metric
      ? `<rect x="104" y="350" width="540" height="250" rx="26" fill="${theme.panel}" opacity="0.94"/>
         <text x="144" y="424" ${textStyle(26, 800, theme.accent)}>${escapeXml(metric.label)}</text>
         <text x="144" y="526" ${textStyle(72, 900, theme.text)}>${escapeXml(compact(metric.value, 12))}</text>
         <text x="144" y="576" ${textStyle(24, 500, theme.muted)}>${escapeXml(compact(metric.context || "", 36))}</text>`
      : "",
    ...body.slice(0, 4).map((item, i) => statCard(item, 724 + (i % 2) * 430, 318 + Math.floor(i / 2) * 220, theme, i)),
    imageSvg,
  ].join("");
}

function renderEditorial(slide: DeckSlide, titleLines: string[], subtitle: string, body: string[], imageSvg: string, theme: Theme) {
  return [
    `<rect x="98" y="144" width="1724" height="788" rx="28" fill="${theme.panel}" opacity="0.88"/>`,
    `<path d="M98 242 C520 118 810 164 1058 74 S1542 20 1822 134 L1822 320 C1430 240 1190 316 850 282 S420 244 98 364 Z" fill="${theme.accent}" opacity="0.13"/>`,
    textBlock(titleLines, 142, 240, 62, 76, 900, theme.text),
    subtitle ? `<text x="146" y="${292 + titleLines.length * 76}" ${textStyle(28, 500, theme.muted)}>${escapeXml(compact(subtitle, 68))}</text>` : "",
    imageSvg || visualFallback(slide, 1080, 315, 540, 300, theme),
    bulletList(body, 148, 560, 760, theme),
  ].join("");
}

function imageElement(image: SourceImageAsset, layout: string, theme: Theme) {
  const box = imageBox(layout);
  return [
    `<rect x="${box.x - 18}" y="${box.y - 18}" width="${box.w + 36}" height="${box.h + 36}" rx="30" fill="${theme.dark ? "#111827" : "#ffffff"}" opacity="0.72" stroke="${theme.line}" stroke-width="2"/>`,
    `<image href="${image.dataUri}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid meet"/>`,
  ].join("");
}

function addSourceImageLayer(page: PptxGenJS.Slide, image: SourceImageAsset | null, layout: string) {
  if (!image) return;
  const box = imageBox(layout);
  page.addImage({
    data: image.dataUri,
    x: (box.x / W) * 13.333,
    y: (box.y / H) * 7.5,
    w: (box.w / W) * 13.333,
    h: (box.h / H) * 7.5,
    sizing: {
      type: "contain",
      x: (box.x / W) * 13.333,
      y: (box.y / H) * 7.5,
      w: (box.w / W) * 13.333,
      h: (box.h / H) * 7.5,
    },
    altText: `Source image from uploaded slide ${image.slideNumber}`,
  });
}

function imageBox(layout: string) {
  if (layout === "poster") return { x: 1155, y: 260, w: 560, h: 380 };
  if (layout === "split") return { x: 1010, y: 232, w: 560, h: 430 };
  if (layout === "dashboard") return { x: 1166, y: 724, w: 520, h: 160 };
  return { x: 1048, y: 310, w: 560, h: 330 };
}

function renderPills(items: string[], x: number, y: number, theme: Theme) {
  return items.slice(0, 3).map((item, i) => {
    const top = y + i * 72;
    return `<rect x="${x}" y="${top}" width="760" height="52" rx="26" fill="${theme.panel2}" opacity="0.9"/>
      <circle cx="${x + 28}" cy="${top + 26}" r="8" fill="${theme.accent}"/>
      <text x="${x + 54}" y="${top + 34}" ${textStyle(25, 700, theme.text)}>${escapeXml(compact(item, 42))}</text>`;
  }).join("");
}

function bulletList(items: string[], x: number, y: number, width: number, theme: Theme) {
  return items.slice(0, 5).map((item, i) => {
    const top = y + i * 76;
    return `<circle cx="${x + 8}" cy="${top - 8}" r="7" fill="${i === 0 ? theme.accent : theme.accent2}"/>
      <text x="${x + 34}" y="${top}" ${textStyle(29, i === 0 ? 800 : 600, theme.text)}>${escapeXml(compact(item, width > 700 ? 56 : 42))}</text>`;
  }).join("");
}

function statCard(item: string, x: number, y: number, theme: Theme, index: number) {
  const parts = item.split(/[：:]/);
  const label = compact(parts[0] || `Signal ${index + 1}`, 16);
  const value = compact(parts.slice(1).join(":") || item, 30);
  return `<rect x="${x}" y="${y}" width="370" height="156" rx="24" fill="${theme.panel}" opacity="0.92" stroke="${theme.line}" stroke-width="2"/>
    <text x="${x + 28}" y="${y + 48}" ${textStyle(23, 800, theme.accent)}>${escapeXml(label)}</text>
    <text x="${x + 28}" y="${y + 104}" ${textStyle(30, 800, theme.text)}>${escapeXml(value)}</text>`;
}

function visualFallback(slide: DeckSlide, x: number, y: number, w: number, h: number, theme: Theme) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="${theme.panel2}" opacity="0.88" stroke="${theme.line}" stroke-width="2"/>
    <path d="M${x + 54} ${y + h - 70} L${x + 160} ${y + h - 178} L${x + 276} ${y + h - 124} L${x + 402} ${y + 86} L${x + w - 58} ${y + 142}" fill="none" stroke="${theme.accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.86"/>
    <text x="${x + 54}" y="${y + 74}" ${textStyle(24, 800, theme.accent)}>${escapeXml(slide.visual || "Visual system")}</text>`;
}

function footer(takeaway: string | undefined, theme: Theme) {
  if (!takeaway) return "";
  return `<rect x="92" y="992" width="1728" height="2" fill="${theme.line}" opacity="0.9"/>
    <text x="110" y="1038" ${textStyle(24, 600, theme.muted)}>${escapeXml(compact(takeaway, 96))}</text>`;
}

function background(theme: Theme, index: number) {
  const rotate = index % 2 === 0 ? 0 : 1;
  return `<rect width="${W}" height="${H}" fill="${theme.bg}"/>
    <circle cx="${rotate ? 1700 : 220}" cy="${rotate ? 140 : 920}" r="420" fill="${theme.accent}" opacity="0.14"/>
    <circle cx="${rotate ? 280 : 1660}" cy="${rotate ? 870 : 160}" r="290" fill="${theme.accent2}" opacity="0.11"/>`;
}

function defs(theme: Theme) {
  return `<defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="${theme.dark ? "0.32" : "0.14"}"/></filter>
  </defs>`;
}

function textBlock(lines: string[], x: number, y: number, size: number, lineHeight: number, weight: number, color: string) {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * lineHeight}" ${textStyle(size, weight, color)}>${escapeXml(line)}</text>`).join("");
}

function resolveTheme(deck: DeckSpec): Theme {
  const primary = `#${cleanHex(deck.theme?.brandPrimary) || (deck.theme?.accent === "cyan" ? "4CC9F0" : deck.theme?.accent === "sage" ? "8FB66B" : "D7B981")}`;
  const secondary = `#${cleanHex(deck.theme?.brandSecondary) || (deck.theme?.template === "brandGradient" ? "7C3AED" : "73D2DE")}`;
  const light = deck.theme?.template === "editorialLight" || deck.theme?.template === "academicPaper" || deck.theme?.template === "corporateClean" || deck.theme?.template === "internalOps" || deck.theme?.template === "creativePitch";
  return {
    bg: light ? "#F7F3EA" : "#070A12",
    panel: light ? "#FFFFFF" : "#111827",
    panel2: light ? "#EFE7D9" : "#1B2233",
    text: light ? "#171512" : "#F8F5EE",
    muted: light ? "#6F6A62" : "#AAB3C2",
    accent: primary,
    accent2: secondary,
    line: light ? "#D8CEC0" : "#2D3748",
    dark: !light,
  };
}

function chooseVisualLayout(slide: DeckSlide, index: number, total: number, hasImage: boolean) {
  if (index === 0 || slide.layout === "cover" || slide.layout === "section") return "poster";
  if (slide.layout === "dashboard" || slide.layout === "heroMetric" || slide.metric) return "dashboard";
  if (hasImage || slide.layout === "splitStory" || slide.layout === "comparison" || slide.layout === "beforeAfter") return "split";
  if (index === total - 1 || slide.layout === "closing" || slide.layout === "quote") return "poster";
  return "editorial";
}

function pickSourceImage(slide: DeckSlide, index: number, sourceImages: SourceImageAsset[] | undefined) {
  if (!sourceImages?.length) return null;
  const sourceSlides = slide.sourceSlides?.length ? slide.sourceSlides : [index + 1];
  for (const sourceSlide of sourceSlides) {
    const match = sourceImages.find((image) => image.slideNumber === sourceSlide);
    if (match) return match;
  }
  return sourceImages[index % sourceImages.length] || null;
}

function wrapText(text: string, maxChars: number, maxLines: number) {
  const chars = Array.from(String(text || "").replace(/\s+/g, " ").trim());
  const lines: string[] = [];
  let current = "";
  for (const char of chars) {
    if (visualLength(current + char) > maxChars && current) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines) break;
      continue;
    }
    current += char;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && chars.join("").length > lines.join("").length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。,.、;；:：]$/, "")}...`;
  }
  return lines.length ? lines : ["Untitled"];
}

function compact(text: string | undefined, maxChars: number) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (visualLength(normalized) <= maxChars) return normalized;
  let output = "";
  for (const char of Array.from(normalized)) {
    if (visualLength(`${output}${char}`) > maxChars - 3) break;
    output += char;
  }
  return `${output}...`;
}

function visualLength(text: string) {
  return Array.from(String(text || "")).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 1.7 : 1), 0);
}

function textStyle(size: number, weight: number, color: string) {
  return `font-family="Microsoft YaHei, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}"`;
}

function cleanHex(value: string | undefined) {
  const match = String(value || "").match(/^#?([0-9a-fA-F]{6})$/);
  return match ? match[1].toUpperCase() : undefined;
}

function escapeXml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
