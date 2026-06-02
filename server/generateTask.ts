import type { PresentationRequest } from "../src/shared/deck";
import { consumeCredits, getCreditCost, getUserById } from "./auth";
import { createDeckWithOpenAI } from "./openai";
import { renderDeckToPptx } from "./pptx";
import { saveGeneration } from "./store";

export async function generateAndSaveDeck(userId: string, input: PresentationRequest) {
  const creditCost = getCreditCost(input.slides);
  const deck = await createDeckWithOpenAI(input);
  const file = await renderDeckToPptx(deck);
  const filename = safeFilename(deck.title || "deckpilot-presentation");
  const record = await saveGeneration(userId, input, deck, file, filename, creditCost);
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

export function safeFilename(name: string) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "deckpilot-presentation";
}

export function safeAsciiFilename(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "deckpilot-presentation"
  );
}
