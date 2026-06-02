import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { runQueuedGeneration, validateQueuedPayload, type QueuedGenerationPayload } from "./queuedGeneration";

const appRoot = process.cwd();
dotenv.config({ path: path.resolve(appRoot, ".env"), override: true });
dotenv.config({ path: path.resolve(appRoot, ".env.local"), override: true });
if (process.env.FORCE_MOCK_OPENAI === "1") {
  process.env.MOCK_OPENAI = "1";
}
if (process.env.FORCE_SQLITE_STORE === "1") {
  process.env.DATA_STORE = "sqlite";
}
process.env.DECKPILOT_LONG_WORKER = "1";

const app = express();
const port = Number(process.env.WORKER_PORT || process.env.PORT || 8790);

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    role: "deckpilot-worker",
    maxSlides: 30,
    provider: process.env.AI_PROVIDER || "openai",
  });
});

app.post("/jobs", async (req, res) => {
  let payload;
  try {
    payload = validateQueuedPayload(req.body as QueuedGenerationPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload.";
    res.status(message === "Unauthorized." ? 401 : 400).json({ error: message });
    return;
  }

  setImmediate(() => {
    void runQueuedGeneration(payload).catch((error) => {
      console.error("deckpilot long worker failed", payload.jobId, error);
    });
  });

  res.status(202).json({ status: "queued", id: payload.jobId });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`DeckPilot long worker listening on http://0.0.0.0:${port}`);
});
