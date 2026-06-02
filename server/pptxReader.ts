import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

type ParsedTextNode = string | number | boolean | null | ParsedTextNode[] | { [key: string]: ParsedTextNode };

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

  const slides: string[] = [];

  for (const fileName of slideFiles) {
    const xml = await zip.files[fileName]?.async("text");
    if (!xml) continue;
    const parsed = parser.parse(xml) as ParsedTextNode;
    const text = collectText(parsed)
      .map(cleanText)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) slides.push(text);
  }

  const combined = slides.map((slide, index) => `Slide ${index + 1}: ${slide}`).join("\n");
  if (combined.length < 8) {
    throw new Error("The uploaded PowerPoint did not contain enough extractable text.");
  }

  return {
    slideCount: slideFiles.length,
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
