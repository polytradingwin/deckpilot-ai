import type { PresentationRequest } from "../src/shared/deck";
import { generateAndSaveDeck } from "./generateTask";
import { readPptxFile } from "./fileStorage";
import { extractTextFromPptx } from "./pptxReader";

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
  const input = payload.sourceFile ? await withUploadedPptxText(payload.input, payload.sourceFile) : payload.input;
  await generateAndSaveDeck(payload.userId, input, { id: payload.jobId });
  console.log("deckpilot worker done", payload.jobId, payload.userId);
}

async function withUploadedPptxText(input: PresentationRequest, sourceFile: QueuedSourceFile): Promise<PresentationRequest> {
  const file = await readPptxFile(sourceFile.storedFilename);
  const extracted = await extractTextFromPptx(file);
  const prompt = [
    `Uploaded PowerPoint: ${sourceFile.originalName}`,
    `Extracted source slide count: ${extracted.slideCount}`,
    "Extracted slide text:",
    extracted.text,
    input.prompt ? ["Additional user direction:", input.prompt].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { ...input, prompt };
}
