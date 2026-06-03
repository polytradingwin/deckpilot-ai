import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import JSZip from "jszip";
import type { PresentationRequest, DeckSpec } from "../src/shared/deck";
import { createDeckWithAI } from "../server/openai";
import { renderDeckToPptx } from "../server/pptx";
import { extractTextFromPptx } from "../server/pptxReader";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
process.env.DECKPILOT_LONG_WORKER ||= "1";

const outDir = path.resolve(process.cwd(), "output/quality-samples");
const sampleLimit = Number(process.env.QUALITY_SAMPLE_LIMIT || 4);

const samples: Array<{ name: string; input: PresentationRequest; anchors: string[] }> = [
  {
    name: "product-sales",
    input: {
      source: "outline",
      purpose: "sales",
      style: "product",
      slides: 6,
      language: "简体中文",
      audience: "制造业 CIO / 信息化负责人",
      prompt:
        "为企业 AI 知识库产品制作销售演示。核心材料：支持 ERP、MES、PLM、CRM 文档接入；权限支持 RBAC、ABAC、SSO；部署周期 30 天；目标是降低知识检索时间并提升一线问题解决效率。",
      sourceAnchors: ["ERP", "MES", "RBAC", "30 天"],
    },
    anchors: ["ERP", "MES", "RBAC", "30 天"],
  },
  {
    name: "board-report",
    input: {
      source: "outline",
      purpose: "report",
      style: "consulting",
      slides: 7,
      language: "简体中文",
      audience: "CEO / 董事会",
      prompt:
        "生成季度经营复盘：收入增长 18%，毛利率承压 4 个百分点；欧洲渠道库存偏高；新产品线已完成 beta；下一季度重点是现金流、渠道去库存和关键客户续约。",
      sourceAnchors: ["18%", "4 个百分点", "beta"],
    },
    anchors: ["18%", "4 个百分点", "beta"],
  },
  {
    name: "brand-launch",
    input: {
      source: "outline",
      purpose: "sales",
      style: "brand",
      slides: 6,
      language: "简体中文",
      audience: "品牌负责人 / 代理商团队",
      prompt:
        "为一款高端户外咖啡设备做新品发布 PPT。卖点：轻量化、低温稳定萃取、模块化清洁；核心人群是自驾露营和城市周末户外用户；需要有高级感和故事性。",
      sourceAnchors: ["轻量化", "低温稳定萃取", "模块化清洁"],
    },
    anchors: ["轻量化", "低温稳定萃取", "模块化清洁"],
  },
  {
    name: "academic-method",
    input: {
      source: "outline",
      purpose: "training",
      style: "academic",
      slides: 6,
      language: "简体中文",
      audience: "研究生 / 课题组",
      prompt:
        "制作一份研究方法课件：主题是如何评估 RAG 系统。内容包括数据集构建、检索召回率、答案忠实度、人工评审协议、错误归因和实验局限。",
      sourceAnchors: ["RAG", "召回率", "忠实度"],
    },
    anchors: ["RAG", "召回率", "忠实度"],
  },
];

await fs.mkdir(outDir, { recursive: true });

const selected = samples.slice(0, Math.max(1, Math.min(samples.length, sampleLimit)));
const reports = [];

for (const sample of selected) {
  const deck = await createDeckWithAI(sample.input);
  const pptx = await renderDeckToPptx(deck);
  const pptxPath = path.join(outDir, `${sample.name}.pptx`);
  const jsonPath = path.join(outDir, `${sample.name}.json`);

  await fs.writeFile(pptxPath, pptx);
  await fs.writeFile(jsonPath, JSON.stringify(deck, null, 2));

  reports.push(await inspectSample(sample.name, deck, pptx, sample.anchors));
}

const templates = new Set(reports.map((report) => report.template));
const failed = reports.filter((report) => report.score < 80 || report.errors.length > 0);
if (templates.size < Math.min(3, selected.length)) {
  failed.push({
    name: "template-diversity",
    template: "n/a",
    accent: "n/a",
    layoutCount: 0,
    slideCount: 0,
    genericTitleCount: 0,
    missingAnchors: [],
    errors: [`Only ${templates.size} template(s) used across ${selected.length} samples.`],
    score: 0,
  });
}

const reportPath = path.join(outDir, "quality-report.json");
await fs.writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));

console.log(`Quality samples generated in ${outDir}`);
for (const report of reports) {
  console.log(`- ${report.name}: score ${report.score}, template ${report.template}, layouts ${report.layoutCount}`);
}

if (failed.length) {
  throw new Error(`Quality sample check failed:\n${failed.map((item) => `${item.name}: ${item.errors.join("; ")}`).join("\n")}`);
}

async function inspectSample(name: string, deck: DeckSpec, pptx: Buffer, anchors: string[]) {
  const zip = await JSZip.loadAsync(pptx);
  const slideCount = Object.keys(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/.test(file)).length;
  const extracted = await extractTextFromPptx(pptx);
  const layouts = new Set(deck.slides.map((slide) => slide.layout));
  const missingAnchors = anchors.filter((anchor) => !extracted.text.includes(anchor));
  const genericTitleCount = deck.slides.filter((slide) => isGenericTitle(slide.title)).length;
  const errors: string[] = [];

  if (slideCount !== deck.slides.length) errors.push(`Rendered slide count ${slideCount} does not match deck JSON ${deck.slides.length}.`);
  if (layouts.size < 3) errors.push(`Only ${layouts.size} layout type(s) used.`);
  if (genericTitleCount > 1) errors.push(`${genericTitleCount} generic slide title(s) found.`);
  if (!deck.theme?.template) errors.push("Missing theme.template.");
  if (missingAnchors.length) errors.push(`Missing source anchors: ${missingAnchors.join(", ")}`);

  const score =
    100 -
    Math.max(0, 3 - layouts.size) * 12 -
    genericTitleCount * 8 -
    missingAnchors.length * 10 -
    (deck.theme?.template ? 0 : 18) -
    (slideCount === deck.slides.length ? 0 : 20);

  return {
    name,
    template: deck.theme?.template || "missing",
    accent: deck.theme?.accent || "missing",
    layoutCount: layouts.size,
    slideCount,
    genericTitleCount,
    missingAnchors,
    errors,
    score: Math.max(0, score),
  };
}

function isGenericTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  return [
    "overview",
    "problem",
    "solution",
    "market",
    "next steps",
    "introduction",
    "总结",
    "目录",
    "问题",
    "方案",
    "下一步",
  ].includes(normalized);
}
