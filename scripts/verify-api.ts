import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { extractTextFromPptx } from "../server/pptxReader";

const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8787";
const outDir = path.resolve(process.cwd(), "output/playwright");

await fs.mkdir(outDir, { recursive: true });

const textDeckPath = path.join(outDir, "verify-text-generated.pptx");
const uploadDeckPath = path.join(outDir, "verify-upload-redesign.pptx");
const cookie = await login();

await requestDeck(
  `${apiBase}/api/generate-ppt`,
  {
    source: "outline",
    purpose: "sales",
    style: "consulting",
    slides: "5",
    language: "简体中文",
    audience: "制造业 CIO",
    prompt: "为企业 AI 知识库产品制作销售演示，强调部署效率、权限安全和 ROI。",
  },
  textDeckPath,
);

await verifyPptx(textDeckPath);
await verifyHistoryDownload(path.join(outDir, "verify-history-download.pptx"));

const uploaded = await fs.readFile(textDeckPath);
const sourceAnchors = await pickSourceAnchors(uploaded);
const sourceFile = await uploadSourcePptx(uploaded, "source.pptx");

await requestDeck(
  `${apiBase}/api/generate-ppt`,
  {
    source: "ppt",
    purpose: "report",
    style: "product",
    slides: "5",
    language: "简体中文",
    audience: "CEO / 管理层",
    prompt: "请把旧稿改成管理层汇报版本。",
    sourceFile: JSON.stringify(sourceFile),
  },
  uploadDeckPath,
);
await verifyPptx(uploadDeckPath);
await verifyOutputKeepsSourceAnchors(uploadDeckPath, sourceAnchors);

console.log(`API verification passed:
- ${textDeckPath}
- ${path.join(outDir, "verify-history-download.pptx")}
- ${uploadDeckPath}`);

async function requestDeck(url: string, body: Record<string, string> | FormData, outPath: string) {
  const init: RequestInit =
    body instanceof FormData
      ? { method: "POST", body, headers: { Cookie: cookie } }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8", Cookie: cookie },
          body: JSON.stringify(body),
        };

  const response = await fetch(url, init);
  if (response.status === 202) {
    const payload = (await response.json()) as { id?: string };
    if (!payload.id) {
      throw new Error("Queued generation did not return an id.");
    }
    await downloadQueuedGeneration(outPath, payload.id);
    return;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status} ${message}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

async function uploadSourcePptx(buffer: Buffer, filename: string) {
  const signed = await fetch(`${apiBase}/api/uploads/pptx`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Cookie: cookie },
    body: JSON.stringify({
      filename,
      size: buffer.byteLength,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
  });

  const payload = (await signed.json().catch(() => ({}))) as {
    uploadUrl?: string;
    storedFilename?: string;
    originalName?: string;
    error?: string;
  };
  if (!signed.ok || !payload.uploadUrl || !payload.storedFilename) {
    throw new Error(`Signed upload failed: ${signed.status} ${payload.error || ""}`);
  }

  const uploaded = await fetch(payload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    body: new Uint8Array(buffer),
  });
  if (!uploaded.ok) {
    throw new Error(`Storage upload failed: ${uploaded.status} ${await uploaded.text()}`);
  }

  return {
    storedFilename: payload.storedFilename,
    originalName: payload.originalName || filename,
  };
}

async function downloadQueuedGeneration(outPath: string, id: string) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await fetch(`${apiBase}/api/generations/${id}/status`, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) continue;

    const payload = (await response.json()) as { status?: "pending" | "queued" | "running" | "ready" | "failed"; record?: { id: string }; error?: string };
    if (payload.status === "failed") {
      throw new Error(payload.error || "Background generation failed.");
    }
    if (payload.status !== "ready" || !payload.record?.id) continue;

    const download = await fetch(`${apiBase}/api/generations/${payload.record.id}/download`, {
      headers: { Cookie: cookie },
    });
    if (!download.ok) continue;

    const buffer = Buffer.from(await download.arrayBuffer());
    await fs.writeFile(outPath, buffer);
    return;
  }

  throw new Error("Timed out waiting for background generation.");
}

async function login() {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ email: `verify-${Date.now()}@deckpilot.local` }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const rawCookie = response.headers.get("set-cookie");
  const sessionCookie = rawCookie?.split(";")[0];
  if (!sessionCookie) {
    throw new Error("Login did not return a session cookie.");
  }

  const session = await fetch(`${apiBase}/api/session`, { headers: { Cookie: sessionCookie } });
  if (!session.ok) {
    throw new Error(`Session check failed: ${session.status}`);
  }

  return sessionCookie;
}

async function verifyPptx(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  const hasContentTypes = names.includes("[Content_Types].xml");
  const slideCount = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;

  if (!hasContentTypes || slideCount < 4) {
    throw new Error(`Invalid PPTX output: ${filePath}`);
  }
}

async function verifyOutputKeepsSourceAnchors(filePath: string, anchors: string[]) {
  const extracted = await extractTextFromPptx(await fs.readFile(filePath));
  const missing = anchors.filter((anchor) => !extracted.text.includes(anchor));
  if (missing.length) {
    throw new Error(`Uploaded PPT redesign lost source anchors: ${missing.join(", ")}`);
  }
}

async function pickSourceAnchors(buffer: Buffer) {
  const extracted = await extractTextFromPptx(buffer);
  const anchors = new Set<string>();
  for (const match of extracted.text.matchAll(/(?:RAG|ROI|RBAC|ABAC|SSO|AD|API|ERP|MES|PLM|CRM|EHS|CIO|CEO|AI)/g)) {
    anchors.add(match[0]);
  }
  if (extracted.text.includes("权限")) anchors.add("权限");
  if (extracted.text.includes("安全")) anchors.add("安全");
  const picked = Array.from(anchors).slice(0, 4);
  if (!picked.length) {
    throw new Error("Source PPT did not contain stable anchors for content verification.");
  }
  return picked;
}

async function verifyHistoryDownload(outPath: string) {
  const response = await fetch(`${apiBase}/api/generations`, { headers: { Cookie: cookie } });
  if (!response.ok) {
    throw new Error(`History endpoint failed: ${response.status}`);
  }

  const payload = (await response.json()) as { records?: Array<{ id: string }> };
  const latest = payload.records?.[0];
  if (!latest?.id) {
    throw new Error("History endpoint did not return the latest generation.");
  }

  const download = await fetch(`${apiBase}/api/generations/${latest.id}/download`, { headers: { Cookie: cookie } });
  if (!download.ok) {
    throw new Error(`History download failed: ${download.status}`);
  }

  await fs.writeFile(outPath, Buffer.from(await download.arrayBuffer()));
  await verifyPptx(outPath);
}
