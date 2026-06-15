import type { PresentationRequest } from "../src/shared/deck";
import { generateAndSaveDeck } from "./generateTask";
import { readPptxFile } from "./fileStorage";
import { extractTextFromPptx } from "./pptxReader";
import { extractSourceAnchors, wrapSourceMaterial } from "./sourceGrounding";
import { updateGenerationJob } from "./store";
import { toUserFacingError } from "./userErrors";

export type QueuedSourceFile = {
  storedFilename: string;
  originalName: string;
};

export type QueuedGenerationPayload = {
  secret?: string;
  jobId?: string;
  userId?: string;
  input?: PresentationRequest;
  sourceFile?: QueuedSourceFile | null;
};

export type ValidQueuedGenerationPayload = Omit<QueuedGenerationPayload, "jobId" | "userId" | "input"> & {
  jobId: string;
  userId: string;
  input: PresentationRequest;
};

export function getWorkerSecret() {
  return process.env.WORKER_SHARED_SECRET || process.env.SUPABASE_BACKEND_SECRET || "";
}

export function validateQueuedPayload(payload: QueuedGenerationPayload): ValidQueuedGenerationPayload {
  if (!payload.secret || payload.secret !== getWorkerSecret()) {
    throw new Error("Unauthorized.");
  }

  if (!payload.jobId || !payload.userId || !payload.input) {
    throw new Error("Missing generation payload.");
  }

  return { ...payload, jobId: payload.jobId, userId: payload.userId, input: payload.input };
}

export async function runQueuedGeneration(payload: ValidQueuedGenerationPayload) {
  console.log("deckpilot worker generating", payload.jobId, payload.userId, payload.input.source, payload.input.slides, Boolean(payload.sourceFile));
  await updateGenerationJob(payload.userId, payload.jobId, "running");
  try {
    const prepared = payload.sourceFile ? await withUploadedPptxText(payload.input, payload.sourceFile) : { input: payload.input, assets: undefined };
    await generateAndSaveDeck(payload.userId, prepared.input, { id: payload.jobId, assets: prepared.assets });
    console.log("deckpilot worker done", payload.jobId, payload.userId);
  } catch (error) {
    await updateGenerationJob(payload.userId, payload.jobId, "failed", toUserFacingError(error));
    throw error;
  }
}

export async function withUploadedPptxText(input: PresentationRequest, sourceFile: QueuedSourceFile) {
  const file = await readPptxFile(sourceFile.storedFilename);
  const extracted = await extractTextFromPptx(file);
  const sourceAnchors = extractSourceAnchors(extracted.text, 24);
  const sourceMaterial = [
    `Uploaded PowerPoint: ${sourceFile.originalName}`,
    `Extracted source slide count: ${extracted.slideCount}`,
    `Slides with extractable text: ${extracted.extractableSlideCount}`,
    `Extractable text characters: ${extracted.extractableCharCount}`,
    extracted.brandColors.length ? `Detected source deck brand colors: ${extracted.brandColors.map((color) => `#${color}`).join(", ")}` : "",
    extracted.sourceImages.length ? `Reusable source images by slide: ${summarizeSourceImages(extracted.sourceImages)}` : "",
    `Required source anchors to preserve exactly: ${sourceAnchors.join(", ") || "(none)"}`,
    "",
    "Source preservation contract:",
    "- Treat the uploaded PowerPoint as the canonical source material.",
    "- Preserve the actual subject, entities, facts, section flow, and conclusions from the uploaded deck.",
    "- If requested slide count equals the source slide count, map output slide N to source slide N unless the user explicitly asks to restructure.",
    "- If restructuring is needed, merge or split source slides but do not introduce unrelated business scenarios.",
    "- Do not replace the user's deck with a generic AI, SaaS, fundraising, sales, or consulting template.",
    "",
    "Extracted slide-by-slide source material:",
    extracted.text,
  ]
    .filter(Boolean)
    .join("\n\n");
  const prompt = wrapSourceMaterial(sourceMaterial, input.prompt ? ["Additional user direction:", input.prompt].join("\n") : "");

  return {
    input: { ...input, prompt, sourceAnchors },
    assets: { sourceImages: extracted.sourceImages },
  };
}

function summarizeSourceImages(images: Array<{ slideNumber: number; name: string; byteLength: number }>) {
  const bySlide = new Map<number, number>();
  for (const image of images) {
    bySlide.set(image.slideNumber, (bySlide.get(image.slideNumber) || 0) + 1);
  }
  return Array.from(bySlide.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([slideNumber, count]) => `slide ${slideNumber}: ${count} image${count > 1 ? "s" : ""}`)
    .join("; ");
}
