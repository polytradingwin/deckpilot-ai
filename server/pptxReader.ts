import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

type ParsedTextNode = string | number | boolean | null | ParsedTextNode[] | { [key: string]: ParsedTextNode };
type ExtractedSlide = {
  number: number;
  text: string;
  notes?: string;
  charCount: number;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: "text",
});

export async function extractTextFromPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => getSlideNumber(a) - getSlideNumber(b));

  if (!slideFiles.length) {
    throw new Error("No slides were found in the uploaded PowerPoint file.");
  }

  const slides: ExtractedSlide[] = [];

  for (const fileName of slideFiles) {
    const xml = await zip.files[fileName]?.async("text");
    if (!xml) continue;
    const number = getSlideNumber(fileName);
    const text = extractOrderedText(xml);
    const notesXml = await zip.files[`ppt/notesSlides/notesSlide${number}.xml`]?.async("text");
    const notes = notesXml ? extractOrderedText(notesXml) : "";
    const combined = [text, notes ? `Speaker notes: ${notes}` : ""].filter(Boolean).join("\n");

    slides.push({
      number,
      text: combined,
      notes: notes || undefined,
      charCount: countMeaningfulChars(combined),
    });
  }

  const extractableSlides = slides.filter((slide) => slide.charCount >= 8);
  const extractableCharCount = slides.reduce((total, slide) => total + slide.charCount, 0);
  const minimumChars = Math.max(120, Math.min(360, slideFiles.length * 24));
  if (extractableCharCount < minimumChars || extractableSlides.length < Math.min(2, slideFiles.length)) {
    throw new Error(
      "上传的 PPT 可提取文字太少，无法可靠按原稿改写。请上传包含可选中文本的 .pptx，或在说明里粘贴每页主要内容。",
    );
  }

  const combined = slides
    .map((slide) => [`Slide ${slide.number}:`, slide.text || "(No extractable text on this slide.)"].join("\n"))
    .join("\n\n");

  return {
    slideCount: slideFiles.length,
    extractableSlideCount: extractableSlides.length,
    extractableCharCount,
    slides,
    text: combined.slice(0, 28000),
  };
}

function getSlideNumber(fileName: string) {
  const match = fileName.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

function collectText(node: ParsedTextNode): string[] {
  if (node == null) return [];
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectText);
  }

  const chunks: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "t" || key === "text") {
      chunks.push(...collectText(value));
      continue;
    }
    if (typeof value === "object") {
      chunks.push(...collectText(value));
    }
  }
  return chunks;
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function extractOrderedText(xml: string) {
  const paragraphs = Array.from(xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g))
    .map((match) => extractTextRuns(match[0]).join(""))
    .map(cleanText)
    .filter(Boolean);

  const text = paragraphs.length ? paragraphs.join("\n") : extractTextRuns(xml).map(cleanText).filter(Boolean).join("\n");
  const altText = extractAltText(xml);
  return [...dedupeLines(text.split("\n")), ...altText].join("\n").trim();
}

function extractTextRuns(xml: string) {
  const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g));
  if (matches.length) {
    return matches.map((match) => decodeXml(match[1]));
  }

  const parsed = parser.parse(xml) as ParsedTextNode;
  return collectText(parsed).map(cleanText).filter(Boolean);
}

function extractAltText(xml: string) {
  const chunks: string[] = [];
  for (const match of xml.matchAll(/<(?:p:)?cNvPr\b[^>]*(?:name|title|descr)="([^"]+)"[^>]*>/g)) {
    const value = cleanText(decodeXml(match[1]));
    if (value && !/^(Picture|Rectangle|Shape|Text|Title|Subtitle|Content Placeholder|.*Placeholder) \d+$/i.test(value)) {
      chunks.push(`Alt text: ${value}`);
    }
  }
  return dedupeLines(chunks);
}

function dedupeLines(lines: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines.map(cleanText).filter(Boolean)) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function countMeaningfulChars(text: string) {
  return text.replace(/\s+/g, "").length;
}
