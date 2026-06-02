import type { Context } from "@netlify/functions";
import { runQueuedGeneration, validateQueuedPayload, type QueuedGenerationPayload } from "../../server/queuedGeneration";

export default async function handler(request: Request, context: Context) {
  console.log("deckpilot worker request", request.method);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let payload;
  try {
    payload = validateQueuedPayload((await request.json()) as QueuedGenerationPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload.";
    if (message === "Unauthorized.") {
      console.log("deckpilot worker unauthorized");
      return json({ error: message }, 401);
    }
    console.log("deckpilot worker missing payload");
    return json({ error: message }, 400);
  }

  context.waitUntil(
    runQueuedGeneration(payload).catch((error) => {
      console.error("deckpilot worker failed", payload.jobId, error);
    }),
  );
  return json({ status: "queued", id: payload.jobId }, 202);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
