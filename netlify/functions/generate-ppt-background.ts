import type { PresentationRequest } from "../../src/shared/deck";
import { generateAndSaveDeck } from "../../server/generateTask";
import { readPptxFile } from "../../server/fileStorage";
import { extractTextFromPptx } from "../../server/pptxReader";

type QueuedSourceFile = {
  storedFilename: string;
  originalName: string;
};

export default async function handler(request: Request) {
  try {
    console.log("deckpilot background start", request.method);
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405 });
    }

    const payload = (await request.json()) as {
      secret?: string;
      userId?: string;
      input?: PresentationRequest;
      sourceFile?: QueuedSourceFile;
    };

    if (!payload.secret || payload.secret !== process.env.SUPABASE_BACKEND_SECRET) {
      console.log("deckpilot background unauthorized");
      return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 });
    }

    if (!payload.userId || !payload.input) {
      console.log("deckpilot background missing payload");
      return new Response(JSON.stringify({ error: "Missing generation payload." }), { status: 400 });
    }

    console.log("deckpilot background generating", payload.userId, payload.input.source, payload.input.slides, Boolean(payload.sourceFile));
    const input = payload.sourceFile ? await withUploadedPptxText(payload.input, payload.sourceFile) : payload.input;
    await generateAndSaveDeck(payload.userId, input);
    console.log("deckpilot background done", payload.userId);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error("deckpilot background failed", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Background generation failed." }), { status: 500 });
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
