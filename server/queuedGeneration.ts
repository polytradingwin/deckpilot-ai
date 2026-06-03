import type { PresentationRequest } from "../src/shared/deck";
import { generateAndSaveDeck } from "./generateTask";
import { readPptxFile } from "./fileStorage";
import { extractTextFromPptx } from "./pptxReader";
import { updateGenerationJob } from "./store";

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
    const input = payload.sourceFile ? await withUploadedPptxText(payload.input, payload.sourceFile) : payload.input;
    await generateAndSaveDeck(payload.userId, input, { id: payload.jobId });
    console.log("deckpilot worker done", payload.jobId, payload.userId);
  } catch (error) {
    await updateGenerationJob(payload.userId, payload.jobId, "failed", error instanceof Error ? error.message : "Generation failed.");
    throw error;
  }
}

export async function withUploadedPptxText(input: PresentationRequest, sourceFile: QueuedSourceFile): Promise<PresentationRequest> {
  const file = await readPptxFile(sourceFile.storedFilename);
  const extracted = await extractTextFromPptx(file);
  const sourceAnchors = extractSourceAnchors(extracted.text);
  const prompt = [
    `Uploaded PowerPoint: ${sourceFile.originalName}`,
    `Extracted source slide count: ${extracted.slideCount}`,
    `Slides with extractable text: ${extracted.extractableSlideCount}`,
    `Extractable text characters: ${extracted.extractableCharCount}`,
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
    input.prompt ? ["Additional user direction:", input.prompt].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { ...input, prompt, sourceAnchors };
}

function extractSourceAnchors(text: string) {
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
