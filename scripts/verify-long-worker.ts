import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8787";
const slides = Number(process.env.VERIFY_SLIDES || 30);
const outDir = path.resolve(process.cwd(), "output/playwright");
const outPath = path.join(outDir, `verify-${slides}-slide-worker.pptx`);

await fs.mkdir(outDir, { recursive: true });

const cookie = await login();
const form = new FormData();
form.append("source", "outline");
form.append("purpose", "sales");
form.append("style", "consulting");
form.append("slides", String(slides));
form.append("language", "简体中文");
form.append("audience", "CEO / 董事会");
form.append(
  "prompt",
  [
    "为一家企业级 AI 知识库产品制作董事会级销售方案。",
    "重点覆盖：客户现状、行业趋势、痛点、解决方案、部署路径、安全与权限、ROI、成功案例、竞争差异、采购决策、实施计划、风险控制。",
    "要求每页有明确结论，不要空泛口号。",
  ].join("\n"),
);

const response = await fetch(`${apiBase}/api/generate-ppt`, {
  method: "POST",
  headers: { Cookie: cookie },
  body: form,
});

if (response.status !== 202) {
  throw new Error(`Expected queued response, got ${response.status}: ${await response.text()}`);
}

const payload = (await response.json()) as { id?: string };
if (!payload.id) {
  throw new Error("Queued generation did not return an id.");
}

for (let attempt = 0; attempt < 120; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const status = await fetch(`${apiBase}/api/generations/${payload.id}/status`, { headers: { Cookie: cookie } });
  if (!status.ok) continue;
  const body = (await status.json()) as { status?: "pending" | "ready"; record?: { id: string; slideCount: number } };
  if (body.status !== "ready" || !body.record?.id) continue;

  const download = await fetch(`${apiBase}/api/generations/${payload.id}/download`, { headers: { Cookie: cookie } });
  if (!download.ok) {
    throw new Error(`Download failed: ${download.status}`);
  }
  await fs.writeFile(outPath, Buffer.from(await download.arrayBuffer()));
  const slideCount = await countSlides(outPath);
  if (slideCount < slides) {
    throw new Error(`Expected at least ${slides} slides, got ${slideCount}.`);
  }
  console.log(`Long worker verification passed: ${outPath} (${slideCount} slides)`);
  process.exit(0);
}

throw new Error("Timed out waiting for long worker generation.");

async function login() {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ email: `long-worker-${Date.now()}@deckpilot.local` }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { user?: { id: string } };
  if (process.env.BOOST_SQLITE_CREDITS === "1" && body.user?.id) {
    const { DatabaseSync } = await import("node:sqlite");
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "output", "deckpilot.sqlite");
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE users SET credits_total = 1000 WHERE id = ?").run(body.user.id);
    db.close();
  }

  const sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!sessionCookie) {
    throw new Error("Login did not return a session cookie.");
  }

  return sessionCookie;
}

async function countSlides(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
}
