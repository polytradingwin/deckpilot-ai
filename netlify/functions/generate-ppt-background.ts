import type { Handler } from "@netlify/functions";
import type { PresentationRequest } from "../../src/shared/deck";
import { generateAndSaveDeck } from "../../server/generateTask";
import { readPptxFile } from "../../server/fileStorage";
import { extractTextFromPptx } from "../../server/pptxReader";

type QueuedSourceFile = {
  storedFilename: string;
  originalName: string;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  const payload = JSON.parse(event.body || "{}") as {
    secret?: string;
    userId?: string;
    input?: PresentationRequest;
    sourceFile?: QueuedSourceFile;
  };

  if (!payload.secret || payload.secret !== process.env.SUPABASE_BACKEND_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized." }) };
  }

  if (!payload.userId || !payload.input) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing generation payload." }) };
  }

  const input = payload.sourceFile ? await withUploadedPptxText(payload.input, payload.sourceFile) : payload.input;
  await generateAndSaveDeck(payload.userId, input);

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

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
