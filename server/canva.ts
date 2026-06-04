import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";
const CANVA_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DEFAULT_SCOPES = ["design:content:write", "design:content:read"];

type CanvaToken = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  obtained_at: number;
};

type CanvaOAuthState = {
  state: string;
  codeVerifier: string;
  createdAt: string;
  redirectUri: string;
};

type CanvaJobStatus = "in_progress" | "success" | "failed";

type CanvaImportJob = {
  id: string;
  status: CanvaJobStatus;
  result?: {
    designs?: Array<{ id?: string; urls?: { edit_url?: string; view_url?: string } }>;
  };
  error?: { code?: string; message?: string };
};

type CanvaExportJob = {
  id: string;
  status: CanvaJobStatus;
  urls?: string[];
  error?: { code?: string; message?: string };
};

export function isCanvaConfigured() {
  return Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET && getCanvaRedirectUri());
}

export function shouldProcessWithCanva() {
  return process.env.CANVA_OUTPUT_MODE === "import_export" || process.env.CANVA_ENABLED === "1";
}

export async function getCanvaRuntimeStatus() {
  const token = await readToken().catch(() => null);
  return {
    configured: isCanvaConfigured(),
    enabled: shouldProcessWithCanva(),
    required: process.env.CANVA_REQUIRED === "1",
    authorized: Boolean(token?.refresh_token),
    tokenExpiresAt: token ? new Date(token.obtained_at + token.expires_in * 1000).toISOString() : null,
  };
}

export async function createCanvaAuthorizationUrl() {
  assertCanvaConfigured();
  const state = randomUrlSafe(32);
  const codeVerifier = randomUrlSafe(96);
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  const redirectUri = getCanvaRedirectUri();
  if (!redirectUri) {
    throw new Error("CANVA_REDIRECT_URI is missing.");
  }

  await writeOAuthState({ state, codeVerifier, createdAt: new Date().toISOString(), redirectUri });

  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: "s256",
    scope: getCanvaScopes().join(" "),
    response_type: "code",
    client_id: getCanvaClientId(),
    state,
    redirect_uri: redirectUri,
  });

  return `${CANVA_AUTHORIZE_URL}?${params.toString()}`;
}

export async function handleCanvaOAuthCallback(code: string, state: string) {
  assertCanvaConfigured();
  const savedState = await readOAuthState();
  if (!savedState || savedState.state !== state) {
    throw new Error("Invalid Canva OAuth state.");
  }

  const ageMs = Date.now() - Date.parse(savedState.createdAt);
  if (!Number.isFinite(ageMs) || ageMs > 10 * 60 * 1000) {
    throw new Error("Canva OAuth state expired. Please start authorization again.");
  }

  const token = await requestCanvaToken({
    grant_type: "authorization_code",
    code,
    code_verifier: savedState.codeVerifier,
    redirect_uri: savedState.redirectUri,
  });
  await writeToken(token);
  await removeOAuthState();
  return token;
}

export async function processPptxWithCanva(file: Buffer, filename: string) {
  if (!shouldProcessWithCanva()) return file;
  if (!isCanvaConfigured()) {
    return handleCanvaBypassOrFailure("Canva is not configured.");
  }

  try {
    const token = await getValidAccessToken();
    const title = normalizeCanvaTitle(filename);
    const importJob = await createImportJob(token, file, title);
    const imported = await pollImportJob(token, importJob.id);
    const designId = imported.result?.designs?.[0]?.id;
    if (!designId) {
      throw new Error("Canva import completed without a design id.");
    }

    const exportJob = await createExportJob(token, designId);
    const exported = await pollExportJob(token, exportJob.id);
    const downloadUrl = exported.urls?.[0];
    if (!downloadUrl) {
      throw new Error("Canva export completed without a download URL.");
    }

    return await downloadExportedPptx(downloadUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Canva processing failed.";
    return handleCanvaBypassOrFailure(message, file);
  }
}

async function createImportJob(accessToken: string, file: Buffer, title: string) {
  const importMetadata = {
    title_base64: Buffer.from(title, "utf8").toString("base64"),
    mime_type: PPTX_MIME,
  };
  const response = await canvaFetch("/imports", accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Import-Metadata": JSON.stringify(importMetadata),
    },
    body: new Uint8Array(file),
  });
  const payload = (await response.json()) as { job?: CanvaImportJob };
  if (!payload.job?.id) {
    throw new Error("Canva did not return an import job id.");
  }
  return payload.job;
}

async function pollImportJob(accessToken: string, jobId: string) {
  return pollCanvaJob<CanvaImportJob>(async () => {
    const response = await canvaFetch(`/imports/${encodeURIComponent(jobId)}`, accessToken);
    const payload = (await response.json()) as { job?: CanvaImportJob };
    if (!payload.job) throw new Error("Canva import status response is missing job.");
    return payload.job;
  }, "Canva import");
}

async function createExportJob(accessToken: string, designId: string) {
  const response = await canvaFetch("/exports", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      design_id: designId,
      format: { type: "pptx" },
    }),
  });
  const payload = (await response.json()) as { job?: CanvaExportJob };
  if (!payload.job?.id) {
    throw new Error("Canva did not return an export job id.");
  }
  return payload.job;
}

async function pollExportJob(accessToken: string, jobId: string) {
  return pollCanvaJob<CanvaExportJob>(async () => {
    const response = await canvaFetch(`/exports/${encodeURIComponent(jobId)}`, accessToken);
    const payload = (await response.json()) as { job?: CanvaExportJob };
    if (!payload.job) throw new Error("Canva export status response is missing job.");
    return payload.job;
  }, "Canva export");
}

async function pollCanvaJob<T extends { status: CanvaJobStatus; error?: { code?: string; message?: string } }>(
  loadJob: () => Promise<T>,
  label: string,
) {
  const timeoutMs = Number(process.env.CANVA_JOB_TIMEOUT_MS || 8 * 60 * 1000);
  const deadline = Date.now() + timeoutMs;
  let delayMs = 1500;

  while (Date.now() < deadline) {
    const job = await loadJob();
    if (job.status === "success") return job;
    if (job.status === "failed") {
      const reason = job.error?.message || job.error?.code || "unknown error";
      throw new Error(`${label} failed: ${reason}`);
    }
    await sleep(delayMs);
    delayMs = Math.min(5000, Math.round(delayMs * 1.25));
  }

  throw new Error(`${label} timed out.`);
}

async function downloadExportedPptx(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Canva export download failed: ${response.status} ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function getValidAccessToken() {
  const token = await readToken();
  if (!token?.refresh_token) {
    throw new Error("Canva is not authorized.");
  }

  const expiresAt = token.obtained_at + token.expires_in * 1000;
  if (Date.now() < expiresAt - 2 * 60 * 1000) {
    return token.access_token;
  }

  const refreshed = await requestCanvaToken({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
  });
  await writeToken(refreshed);
  return refreshed.access_token;
}

async function requestCanvaToken(params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const response = await fetch(`${CANVA_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${getCanvaClientId()}:${getCanvaClientSecret()}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Canva token request failed: ${response.status} ${await response.text()}`);
  }

  const token = (await response.json()) as Omit<CanvaToken, "obtained_at">;
  if (!token.access_token || !token.refresh_token || !token.expires_in) {
    throw new Error("Canva token response is incomplete.");
  }
  return { ...token, obtained_at: Date.now() };
}

async function canvaFetch(pathname: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${CANVA_API_BASE}${pathname}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Canva API request failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

function handleCanvaBypassOrFailure(message: string, fallback?: Buffer) {
  if (process.env.CANVA_REQUIRED === "1" || !fallback) {
    throw new Error(message);
  }
  console.warn(`Canva processing bypassed: ${message}`);
  return fallback;
}

function assertCanvaConfigured() {
  if (!isCanvaConfigured()) {
    throw new Error("CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and CANVA_REDIRECT_URI are required.");
  }
}

function getCanvaClientId() {
  const value = process.env.CANVA_CLIENT_ID;
  if (!value) throw new Error("CANVA_CLIENT_ID is missing.");
  return value;
}

function getCanvaClientSecret() {
  const value = process.env.CANVA_CLIENT_SECRET;
  if (!value) throw new Error("CANVA_CLIENT_SECRET is missing.");
  return value;
}

function getCanvaRedirectUri() {
  if (process.env.CANVA_REDIRECT_URI) return process.env.CANVA_REDIRECT_URI;
  if (!process.env.APP_ORIGIN) return "";
  return `${String(process.env.APP_ORIGIN).replace(/\/$/, "")}/api/canva/oauth/callback`;
}

function getCanvaScopes() {
  return (process.env.CANVA_SCOPES || DEFAULT_SCOPES.join(" "))
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function getTokenPath() {
  return path.resolve(process.cwd(), process.env.CANVA_TOKEN_PATH || ".runtime/canva-token.json");
}

function getOAuthStatePath() {
  return path.resolve(process.cwd(), process.env.CANVA_OAUTH_STATE_PATH || ".runtime/canva-oauth-state.json");
}

async function readToken() {
  return readJsonFile<CanvaToken>(getTokenPath());
}

async function writeToken(token: CanvaToken) {
  await writeJsonFile(getTokenPath(), token);
}

async function readOAuthState() {
  return readJsonFile<CanvaOAuthState>(getOAuthStatePath());
}

async function writeOAuthState(state: CanvaOAuthState) {
  await writeJsonFile(getOAuthStatePath(), state);
}

async function removeOAuthState() {
  await fs.rm(getOAuthStatePath(), { force: true });
}

async function readJsonFile<T>(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonFile(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeCanvaTitle(filename: string) {
  return filename
    .replace(/\.pptx$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .trim()
    .slice(0, 50) || "DeckEvo Presentation";
}

function randomUrlSafe(size: number) {
  return base64Url(crypto.randomBytes(size));
}

function base64Url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
