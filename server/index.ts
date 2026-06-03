import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getCreditCost, loginWithEmail, logout, requireUser, findUserBySession } from "./auth";
import { createSignedPptxUpload, savePptxFile } from "./fileStorage";
import { generateAndSaveDeck, safeAsciiFilename } from "./generateTask";
import { extractTextFromPptx } from "./pptxReader";
import { createGenerationJob, findGeneration, findGenerationJob, listGenerations } from "./store";
import { getAIProvider, getConfiguredPrimaryModel } from "./openai";
import type { PresentationRequest } from "../src/shared/deck";

const appRoot = process.cwd();
dotenv.config({ path: path.resolve(appRoot, ".env"), override: true });
dotenv.config({ path: path.resolve(appRoot, ".env.local"), override: true });
if (process.env.FORCE_MOCK_OPENAI === "1") {
  process.env.MOCK_OPENAI = "1";
}
if (process.env.FORCE_SQLITE_STORE === "1") {
  process.env.DATA_STORE = "sqlite";
}

const app = express();
const port = Number(process.env.PORT || 8787);
const isNetlifyRuntime = process.env.DEPLOY_TARGET === "netlify" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
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
    provider: getAIProvider(),
    model: getConfiguredPrimaryModel(),
    modelCandidates: process.env.OPENAI_MODEL_CANDIDATES || null,
    mock: process.env.MOCK_OPENAI === "1",
    keyConfigured: getAIProvider() === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.OPENAI_API_KEY),
    baseURLConfigured: Boolean(process.env.OPENAI_BASE_URL),
    dataStore: process.env.DATA_STORE === "supabase" ? "supabase" : "sqlite",
    generationMode: getGenerationMode(),
    maxSlides: getRuntimeMaxSlides(),
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

app.post("/api/uploads/pptx", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const originalName = String(req.body?.filename || "source.pptx").trim();
    const contentType = String(req.body?.contentType || "");
    const size = Number(req.body?.size || 0);
    if (!originalName.toLowerCase().endsWith(".pptx")) {
      res.status(400).json({ error: "只支持上传 .pptx 文件。" });
      return;
    }
    if (contentType && contentType !== "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
      res.status(400).json({ error: "只支持上传 .pptx 文件。" });
      return;
    }
    if (!Number.isFinite(size) || size <= 0 || size > 50 * 1024 * 1024) {
      res.status(400).json({ error: "PPT 文件大小需要在 50MB 以内。" });
      return;
    }

    const storedFilename = `sources/${user.id}/${randomUUID()}.pptx`;
    const signed = await createSignedPptxUpload(storedFilename);
    res.json({ ...signed, originalName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建上传地址失败。";
    console.error(error);
    res.status(400).json({ error: message });
  }
});

app.post("/api/generate-ppt", upload.single("file"), async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const signedSourceFile = parseSignedSourceFile(user.id, req.body);
    const requestedInput = await validateRequest(req.body, req.file, {
      extractUploadedPptx: !isNetlifyRuntime,
      sourceFileProvided: Boolean(signedSourceFile),
    });
    const maxSlides = getRuntimeMaxSlides();
    const input = requestedInput.slides > maxSlides ? { ...requestedInput, slides: maxSlides } : requestedInput;
    const creditCost = getCreditCost(input.slides);
    if (user.creditsRemaining < creditCost) {
      res.status(402).json({
        error: `当前额度不足。本次需要 ${creditCost} credits，你还剩 ${user.creditsRemaining} credits。`,
        user,
      });
      return;
    }

    if (isQueuedGenerationRuntime()) {
      const jobId = randomUUID();
      const uploadedFile = req.file;
      const sourceFile =
        signedSourceFile ||
        (uploadedFile
          ? {
            storedFilename: `source-${randomUUID()}.pptx`,
            originalName: uploadedFile.originalname,
          }
          : null);

      if (sourceFile && uploadedFile) {
        await savePptxFile(sourceFile.storedFilename, uploadedFile.buffer);
      }

      await createGenerationJob(user.id, jobId);
      await enqueueBackgroundGeneration(req, user.id, input, sourceFile, jobId);
      res.status(202).json({ status: "queued", id: jobId });
      return;
    }

    const { deck, file, filename, asciiFilename, record, updatedUser } = await generateAndSaveDeck(user.id, input);

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

app.get("/api/generations/:id/status", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const id = String(req.params.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(404).json({ error: "Generation not found." });
    return;
  }

  const generation = await findGeneration(user.id, id);
  if (!generation) {
    const job = await findGenerationJob(user.id, id);
    if (job?.status === "failed") {
      res.json({ status: "failed", error: job.error || "Generation failed." });
      return;
    }
    res.json({ status: job?.status || "pending" });
    return;
  }

  res.json({ status: "ready", record: generation.record });
});

const distDir = path.resolve(appRoot, "dist");
app.use(express.static(distDir));
app.use((_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const entrypoint = process.argv[1]?.replace(/\\/g, "/") || "";
const isDirectRun = entrypoint.endsWith("/server/index.ts") || entrypoint.endsWith("/server/index.js");

if (isDirectRun) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`DeckPilot API listening on http://127.0.0.1:${port}`);
  });
}

export default app;

async function validateRequest(
  body: Partial<PresentationRequest>,
  file?: Express.Multer.File,
  options: { extractUploadedPptx?: boolean; sourceFileProvided?: boolean } = { extractUploadedPptx: true },
): Promise<PresentationRequest> {
  const source = parseEnum(body.source, ["ppt", "outline", "topic"], "source");
  const purpose = parseEnum(body.purpose, ["fundraising", "sales", "training", "report"], "purpose");
  const style = parseEnum(body.style, ["consulting", "product", "brand", "academic"], "style");
  const slides = Number(body.slides);
  let prompt = String(body.prompt || "").trim();

  if (file && options.extractUploadedPptx !== false) {
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

  if (source === "ppt" && !file && !options.sourceFileProvided && prompt.length < 8) {
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

function parseSignedSourceFile(userId: string, body: Record<string, unknown>) {
  const raw = body.sourceFile;
  if (!raw) return null;

  const sourceFile = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!sourceFile || typeof sourceFile !== "object") {
    throw new Error("Invalid uploaded source file reference.");
  }

  const storedFilename = String((sourceFile as { storedFilename?: unknown }).storedFilename || "");
  const originalName = String((sourceFile as { originalName?: unknown }).originalName || "source.pptx");
  const expectedPrefix = `sources/${userId}/`;
  if (!storedFilename.startsWith(expectedPrefix) || !storedFilename.endsWith(".pptx")) {
    throw new Error("Invalid uploaded source file reference.");
  }

  return { storedFilename, originalName };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Invalid uploaded source file reference.");
  }
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  throw new Error(`Invalid ${field}.`);
}

function getGenerationMode() {
  if (process.env.GENERATION_WORKER_URL) return "external-worker";
  if (isNetlifyRuntime && useNetlifyBackgroundWorker()) return "netlify-background-worker";
  if (isNetlifyRuntime) return "netlify-worker";
  return "direct";
}

function isQueuedGenerationRuntime() {
  return Boolean(process.env.GENERATION_WORKER_URL) || isNetlifyRuntime;
}

function getRuntimeMaxSlides() {
  const configured = Number(process.env.MAX_GENERATION_SLIDES);
  if (Number.isFinite(configured) && configured >= 4) {
    return Math.min(30, Math.round(configured));
  }

  return process.env.GENERATION_WORKER_URL || !isNetlifyRuntime || useNetlifyBackgroundWorker() ? 30 : 6;
}

function useNetlifyBackgroundWorker() {
  return process.env.NETLIFY_BACKGROUND_GENERATION !== "0";
}

async function enqueueBackgroundGeneration(
  req: express.Request,
  userId: string,
  input: PresentationRequest,
  sourceFile: { storedFilename: string; originalName: string } | null,
  jobId: string,
) {
  const secret = process.env.WORKER_SHARED_SECRET || process.env.SUPABASE_BACKEND_SECRET;
  if (!secret) {
    throw new Error("WORKER_SHARED_SECRET or SUPABASE_BACKEND_SECRET is required for queued generation.");
  }

  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) {
    throw new Error("Unable to resolve Netlify function host.");
  }

  const netlifyWorkerName = useNetlifyBackgroundWorker() ? "generate-ppt-background" : "generate-ppt-worker";
  const workerUrl = process.env.GENERATION_WORKER_URL || `${proto}://${host}/.netlify/functions/${netlifyWorkerName}`;
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, userId, input, sourceFile, jobId }),
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`Failed to queue background generation: ${response.status} ${await response.text()}`);
  }
}
