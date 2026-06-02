import type { Context } from "@netlify/functions";
import type { PresentationRequest } from "../../src/shared/deck";
import { generateAndSaveDeck } from "../../server/generateTask";
import { readPptxFile } from "../../server/fileStorage";
import { extractTextFromPptx } from "../../server/pptxReader";

type QueuedSourceFile = {
  storedFilename: string;
  originalName: string;
};

type QueuedGenerationPayload = {
  secret?: string;
  userId?: string;
  input?: PresentationRequest;
  sourceFile?: QueuedSourceFile;
};

type ValidQueuedGenerationPayload = Omit<QueuedGenerationPayload, "userId" | "input"> & {
  userId: string;
  input: PresentationRequest;
};

export default async function handler(request: Request, context: Context) {
  console.log("deckpilot worker request", request.method);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const payload = (await request.json()) as QueuedGenerationPayload;
  if (!payload.secret || payload.secret !== process.env.SUPABASE_BACKEND_SECRET) {
    console.log("deckpilot worker unauthorized");
    return json({ error: "Unauthorized." }, 401);
  }

  if (!payload.userId || !payload.input) {
    console.log("deckpilot worker missing payload");
    return json({ error: "Missing generation payload." }, 400);
  }

  context.waitUntil(runGeneration({ ...payload, userId: payload.userId, input: payload.input }));
  return json({ status: "queued" }, 202);
}

async function runGeneration(payload: ValidQueuedGenerationPayload) {
  try {
    console.log("deckpilot worker generating", payload.userId, payload.input.source, payload.input.slides, Boolean(payload.sourceFile));
    const input = payload.sourceFile ? await withUploadedPptxText(payload.input, payload.sourceFile) : payload.input;
    await generateAndSaveDeck(payload.userId, input);
    console.log("deckpilot worker done", payload.userId);
  } catch (error) {
    console.error("deckpilot worker failed", error);
  }
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

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
