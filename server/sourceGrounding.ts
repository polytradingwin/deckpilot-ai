export const SOURCE_START = "USER_SOURCE_MATERIAL_START";
export const SOURCE_END = "USER_SOURCE_MATERIAL_END";

const stopTerms = new Set([
  "用户",
  "文案",
  "内容",
  "生成",
  "需要",
  "可以",
  "这个",
  "那个",
  "我们",
  "他们",
  "进行",
  "通过",
  "以及",
  "相关",
  "部分",
  "页面",
  "幻灯片",
  "ppt",
  "powerpoint",
]);

export type SourceSection = {
  title: string;
  body: string[];
};

export function wrapSourceMaterial(sourceMaterial: string, extraInstruction = "") {
  return [
    SOURCE_START,
    sourceMaterial.trim() || "(用户未输入正文)",
    SOURCE_END,
    extraInstruction.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractUserSourceMaterial(prompt: string) {
  const match = String(prompt || "").match(new RegExp(`${SOURCE_START}\\s*([\\s\\S]*?)\\s*${SOURCE_END}`));
  return (match?.[1] || prompt || "").trim();
}

export function extractUserInstructions(prompt: string) {
  const text = String(prompt || "");
  if (!text.includes(SOURCE_START) || !text.includes(SOURCE_END)) return "";
  return text
    .replace(new RegExp(`${SOURCE_START}\\s*[\\s\\S]*?\\s*${SOURCE_END}`), "")
    .trim();
}

export function extractExplicitSourceSections(text: string): SourceSection[] {
  const lines = String(text || "").split(/\r?\n/);
  const sections: SourceSection[] = [];
  let current: SourceSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^\s*#{1,3}\s*(?:\d+[.、]\s*)?(.+?)\s*$/);
    const numbered = line.match(/^\s*(?:第[一二三四五六七八九十\d]+[章节部分]|[一二三四五六七八九十\d]+[.、])\s*(.+?)\s*$/);
    if (heading || numbered) {
      current = { title: (heading?.[1] || numbered?.[1] || "").trim(), body: [] };
      if (current.title) sections.push(current);
      continue;
    }
    if (current && line) {
      current.body.push(stripBullet(line));
    }
  }

  return sections;
}

export function extractSourceOutlineUnits(text: string, maxUnits = 14) {
  const sections = extractExplicitSourceSections(text);
  if (sections.length) return sections.slice(0, maxUnits);

  const lines = String(text || "")
    .split(/\r?\n|[。！？!?]\s*/)
    .map((line) => stripBullet(line.trim()))
    .filter((line) => meaningfulLength(line) >= 8);

  return lines.slice(0, maxUnits).map((line) => ({
    title: compactSourceText(line, 34),
    body: [line],
  }));
}

export function extractSourceAnchors(text: string, maxAnchors = 24) {
  const source = extractUserSourceMaterial(text);
  const anchors = new Set<string>();

  for (const match of source.matchAll(/(?:RAG|ROI|RBAC|ABAC|SSO|AD|API|ERP|MES|PLM|CRM|EHS|CIO|CEO|AI|AIGC|LLM|SaaS|ARR|MRR|GPT|Claude|Canva)/g)) {
    anchors.add(match[0]);
  }
  for (const match of source.matchAll(/[#＃][0-9a-fA-F]{6}\b/g)) {
    anchors.add(match[0].replace("＃", "#"));
  }
  for (const match of source.matchAll(/\d+(?:[,.，]\d+)*(?:\.\d+)?\s*(?:%|％|倍|x|X|万|亿|人|天|周|个月|月|年|元|美元|条|次|家|页|MB|GB|分钟|小时|万元|亿元)/g)) {
    anchors.add(match[0].replace(/\s+/g, ""));
  }
  for (const match of source.matchAll(/[“"「『《]([^”"」』》]{2,24})[”"」』》]/g)) {
    anchors.add(match[1].trim());
  }

  const units = extractSourceOutlineUnits(source, 18);
  for (const unit of units) {
    const candidates = [unit.title, ...unit.body].flatMap(extractMeaningfulTerms);
    for (const candidate of candidates.slice(0, 4)) {
      anchors.add(candidate);
    }
  }

  return Array.from(anchors)
    .map((anchor) => anchor.trim())
    .filter((anchor) => meaningfulLength(anchor) >= 2 && !stopTerms.has(anchor.toLowerCase()))
    .slice(0, maxAnchors);
}

export function normalizeComparableText(value: string) {
  return String(value || "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*\d+[.、\s]+/gm, "")
    .replace(/[\s:：，,。；;《》“”"「」『』（）()【】\[\]_-]/g, "")
    .toLowerCase();
}

export function sourceTermCovered(deckText: string, term: string) {
  const normalized = normalizeComparableText(term);
  if (!normalized) return true;
  if (deckText.includes(normalized)) return true;
  const simplified = normalized.replace(/什么是|入门|基础|概述|介绍|定义|核心|关键|主要|的/g, "");
  return simplified.length >= 2 && deckText.includes(simplified);
}

export function compactSourceText(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function extractMeaningfulTerms(text: string) {
  const terms: string[] = [];
  const normalized = stripBullet(text)
    .replace(/[例子示例包括如下分别首先其次最后因此所以但是以及并且或者中的一个一种这个那个我们他们进行通过需要可以]/g, " ")
    .trim();

  for (const match of normalized.matchAll(/[A-Za-z][A-Za-z0-9.+#-]{1,24}/g)) {
    terms.push(match[0]);
  }
  for (const match of normalized.matchAll(/[\u4e00-\u9fffA-Za-z0-9][\u4e00-\u9fffA-Za-z0-9·&＋+/-]{1,18}/g)) {
    const term = match[0].trim();
    if (/^\d+$/.test(term) || /[0-9]/.test(term)) continue;
    if (/[在为与和及]$/.test(term)) continue;
    if (term.length >= 2 && !stopTerms.has(term.toLowerCase())) terms.push(term);
  }

  return Array.from(new Set(terms)).slice(0, 8);
}

function stripBullet(line: string) {
  return line.replace(/^\s*[-*•●◦]\s*/, "").replace(/^\s*\d+[.、]\s*/, "").trim();
}

function meaningfulLength(text: string) {
  return String(text || "").replace(/\s+/g, "").length;
}
