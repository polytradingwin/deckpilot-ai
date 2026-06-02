import { runQueuedGeneration, validateQueuedPayload, type QueuedGenerationPayload } from "../../server/queuedGeneration";

export default async function handler(request: Request) {
  console.log("deckpilot background worker request", request.method);
  if (request.method !== "POST") {
    console.log("deckpilot background worker ignored non-POST request");
    return;
  }

  let payload;
  try {
    payload = validateQueuedPayload((await request.json()) as QueuedGenerationPayload);
  } catch (error) {
    console.error("deckpilot background worker invalid payload", error);
    return;
  }

  await runQueuedGeneration(payload).catch((error) => {
    console.error("deckpilot background worker failed", payload.jobId, error);
  });
}
