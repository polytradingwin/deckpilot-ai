import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getCreditCost, loginWithEmail, logout, requireUser, findUserBySession } from "./auth";
import { savePptxFile } from "./fileStorage";
import { generateAndSaveDeck, safeAsciiFilename } from "./generateTask";
import { extractTextFromPptx } from "./pptxReader";
import { findGeneration, listGenerations } from "./store";
import type { PresentationRequest } from "../src/shared/deck";

const appRoot = process.cwd();
dotenv.config({ path: path.resolve(appRoot, ".env"), override: true });
dotenv.config({ path: path.resolve(appRoot, ".env.local"), override: true });
if (process.env.FORCE_MOCK_OPENAI === "1") {
  process.env.MOCK_OPENAI = "1";
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

    const input = await validateRequest(req.body, req.file, { extractUploadedPptx: !isNetlifyRuntime });
    const creditCost = getCreditCost(input.slides);
    if (user.creditsRemaining < creditCost) {
      res.status(402).json({
        error: `当前额度不足。本次需要 ${creditCost} credits，你还剩 ${user.creditsRemaining} credits。`,
        user,
      });
      return;
    }

    if (isNetlifyRuntime) {
      const uploadedFile = req.file;
      const sourceFile = uploadedFile
        ? {
            storedFilename: `source-${randomUUID()}.pptx`,
            originalName: uploadedFile.originalname,
          }
        : null;

      if (sourceFile && uploadedFile) {
        await savePptxFile(sourceFile.storedFilename, uploadedFile.buffer);
      }

      await enqueueNetlifyBackgroundGeneration(req, user.id, input, sourceFile);
      res.status(202).json({ status: "queued" });
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
  options: { extractUploadedPptx?: boolean } = { extractUploadedPptx: true },
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

async function enqueueNetlifyBackgroundGeneration(
  req: express.Request,
  userId: string,
  input: PresentationRequest,
  sourceFile: { storedFilename: string; originalName: string } | null,
) {
  const secret = process.env.SUPABASE_BACKEND_SECRET;
  if (!secret) {
    throw new Error("SUPABASE_BACKEND_SECRET is required for Netlify background generation.");
  }

  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) {
    throw new Error("Unable to resolve Netlify function host.");
  }

  const response = await fetch(`${proto}://${host}/.netlify/functions/generate-ppt-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, userId, input, sourceFile }),
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`Failed to queue background generation: ${response.status} ${await response.text()}`);
  }
}
