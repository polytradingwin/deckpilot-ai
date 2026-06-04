import type { PresentationRequest } from "../src/shared/deck";
import { consumeCredits, getCreditCost, getUserById } from "./auth";
import { createDeckWithAI } from "./openai";
import { renderDeckToPptx } from "./pptx";
import { extractTextFromPptx } from "./pptxReader";
import { saveGeneration } from "./store";

export async function generateAndSaveDeck(userId: string, input: PresentationRequest, options: { id?: string } = {}) {
  const creditCost = getCreditCost(input.slides);
  const { deck, file } = await createRenderedDeckWithValidation(input);
  const filename = safeFilename(deck.title || "deckevo-presentation");
  const record = await saveGeneration(userId, input, deck, file, filename, creditCost, { id: options.id });
  await consumeCredits(userId, creditCost);
  const updatedUser = await getUserById(userId);

  return {
    deck,
    file,
    filename,
    asciiFilename: safeAsciiFilename(filename),
    record,
    updatedUser,
  };
}

async function createRenderedDeckWithValidation(input: PresentationRequest) {
  let nextInput = input;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const deck = await createDeckWithAI(nextInput);
      const file = await renderDeckToPptx(deck);
      await validateRenderedSourceAnchors(file, input);
      return { deck, file };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("PPT generation failed.");
      if (input.source !== "ppt" || !lastError.message.includes("Rendered PPT is missing source anchors")) {
        throw lastError;
      }
      nextInput = {
        ...input,
        prompt: [
          input.prompt,
          "",
          `Previous rendered PPT failed validation: ${lastError.message}`,
          "Regenerate the deck and include every listed source anchor as visible slide text or speaker notes, exactly as written.",
        ].join("\n"),
      };
    }
  }

  throw lastError || new Error("PPT generation failed.");
}

async function validateRenderedSourceAnchors(file: Buffer, input: PresentationRequest) {
  if (input.source !== "ppt") return;
  const anchors = input.sourceAnchors?.length ? input.sourceAnchors.slice(0, 16) : extractRequiredSourceAnchors(input.prompt);
  if (!anchors.length) return;

  const rendered = await extractTextFromPptx(file);
  const missing = anchors.filter((anchor) => !rendered.text.includes(anchor));
  if (missing.length) {
    throw new Error(`Rendered PPT is missing source anchors: ${missing.join(", ")}`);
  }
}

function extractRequiredSourceAnchors(text: string) {
  const anchors = new Set<string>();
  for (const match of text.matchAll(/(?:RAG|ROI|RBAC|ABAC|SSO|AD|API|ERP|MES|PLM|CRM|EHS|CIO|CEO|AI)/g)) {
    anchors.add(match[0]);
  }
  for (const match of text.matchAll(/\d+\s*(?:天|周|个月|月|年)/g)) {
    anchors.add(match[0].replace(/\s+/g, " "));
  }
  for (const match of text.matchAll(/\d+\s*[–-]\s*\d+\s*(?:天|周|个月|月|年)/g)) {
    anchors.add(match[0].replace(/\s+/g, " "));
  }
  return Array.from(anchors).slice(0, 16);
}

export function safeFilename(name: string) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "deckevo-presentation";
}

export function safeAsciiFilename(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "deckevo-presentation"
  );
}
