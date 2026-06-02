import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { consumeCredits, getCreditCost, getUserById, loginWithEmail, logout, requireUser, findUserBySession } from "./auth";
import { createDeckWithOpenAI } from "./openai";
import { extractTextFromPptx } from "./pptxReader";
import { renderDeckToPptx } from "./pptx";
import { findGeneration, listGenerations, saveGeneration } from "./store";
import type { PresentationRequest } from "../src/shared/deck";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });
if (process.env.FORCE_MOCK_OPENAI === "1") {
  process.env.MOCK_OPENAI = "1";
}

const app = express();
const port = Number(process.env.PORT || 8787);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      file.originalname.toLowerCase().endsWith(".pptx")
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .pptx files are supported right now."));
  },
});

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "openai",
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    modelCandidates: process.env.OPENAI_MODEL_CANDIDATES || null,
    mock: process.env.MOCK_OPENAI === "1",
    keyConfigured: Boolean(process.env.OPENAI_API_KEY),
    baseURLConfigured: Boolean(process.env.OPENAI_BASE_URL),
    dataStore: process.env.DATA_STORE === "supabase" ? "supabase" : "sqlite",
  });
});

app.get("/api/session", async (req, res) => {
  res.json({ user: await findUserBySession(req) });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const user = await loginWithEmail(String(req.body?.email || ""), res);
    res.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败。";
    res.status(400).json({ error: message });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  await logout(req, res);
  res.json({ ok: true });
});

app.get("/api/generations", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const records = await listGenerations(user.id);
  res.json({ records });
});

app.get("/api/generations/:id/download", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const id = String(req.params.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(404).json({ error: "Generation not found." });
    return;
  }

  const generation = await findGeneration(user.id, id);
  if (!generation) {
    res.status(404).json({ error: "Generation not found." });
    return;
  }

  const asciiFilename = safeAsciiFilename(generation.record.filename.replace(/\.pptx$/i, ""));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFilename}.pptx"; filename*=UTF-8''${encodeURIComponent(generation.record.filename)}`,
  );
  if ("file" in generation) {
    res.send(generation.file);
    return;
  }
  res.sendFile(generation.filePath);
});

app.post("/api/generate-ppt", upload.single("file"), async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const input = await validateRequest(req.body, req.file);
    const creditCost = getCreditCost(input.slides);
    if (user.creditsRemaining < creditCost) {
      res.status(402).json({
        error: `当前额度不足。本次需要 ${creditCost} credits，你还剩 ${user.creditsRemaining} credits。`,
        user,
      });
      return;
    }

    const deck = await createDeckWithOpenAI(input);
    const file = await renderDeckToPptx(deck);
    const filename = safeFilename(deck.title || "deckpilot-presentation");
    const asciiFilename = safeAsciiFilename(filename);
    const record = await saveGeneration(user.id, input, deck, file, filename, creditCost);
    await consumeCredits(user.id, creditCost);
    const updatedUser = await getUserById(user.id);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFilename}.pptx"; filename*=UTF-8''${encodeURIComponent(`${filename}.pptx`)}`,
    );
    res.setHeader("X-Generation-Id", record.id);
    res.setHeader("X-Deck-Title", encodeURIComponent(deck.title));
    res.setHeader("X-Deck-Slides", String(deck.slides.length));
    if (updatedUser) {
      res.setHeader("X-Credits-Remaining", String(updatedUser.creditsRemaining));
    }
    res.send(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PPT.";
    console.error(error);
    res.status(400).json({ error: message });
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!error) {
    next();
    return;
  }
  res.status(400).json({ error: error.message || "Request failed." });
});

const distDir = path.resolve(__dirname, "../dist");
app.use(express.static(distDir));
app.use((_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`DeckPilot API listening on http://127.0.0.1:${port}`);
  });
}

export default app;

async function validateRequest(body: Partial<PresentationRequest>, file?: Express.Multer.File): Promise<PresentationRequest> {
  const source = parseEnum(body.source, ["ppt", "outline", "topic"], "source");
  const purpose = parseEnum(body.purpose, ["fundraising", "sales", "training", "report"], "purpose");
  const style = parseEnum(body.style, ["consulting", "product", "brand", "academic"], "style");
  const slides = Number(body.slides);
  let prompt = String(body.prompt || "").trim();

  if (file) {
    const extracted = await extractTextFromPptx(file.buffer);
    prompt = [
      `Uploaded PowerPoint: ${file.originalname}`,
      `Extracted source slide count: ${extracted.slideCount}`,
      "Extracted slide text:",
      extracted.text,
      prompt ? ["Additional user direction:", prompt].join("\n") : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (source === "ppt" && !file && prompt.length < 8) {
    throw new Error("Please upload a .pptx file or provide source text to redesign.");
  }

  if (source !== "ppt" && prompt.length < 8) {
    throw new Error("Please provide at least 8 characters of source material.");
  }

  return {
    source,
    purpose,
    style,
    slides: Number.isFinite(slides) ? Math.max(4, Math.min(30, Math.round(slides))) : 12,
    language: String(body.language || "简体中文"),
    audience: String(body.audience || "高管 / 客户决策层"),
    prompt,
  };
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  throw new Error(`Invalid ${field}.`);
}

function safeFilename(name: string) {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "deckpilot-presentation";
}

function safeAsciiFilename(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "deckpilot-presentation"
  );
}
