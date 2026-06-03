import { resolveMx } from "node:dns/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const siteUrl = (process.env.SITE_URL || "https://deckevo.com").replace(/\/$/, "");
const execFileAsync = promisify(execFile);

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

await checkHealth();
await checkFrontendBundle();
await checkAuthCode();
await checkEmailDns();

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  throw new Error(`Pre-payment audit failed: ${failed.map((check) => check.name).join(", ")}`);
}

async function checkHealth() {
  try {
    const response = await fetch(`${siteUrl}/api/health`);
    const payload = (await response.json()) as { ok?: boolean; model?: string; maxSlides?: number; dataStore?: string };
    checks.push({
      name: "API health",
      ok: response.ok && payload.ok === true && Boolean(payload.model) && payload.maxSlides === 30,
      detail: `model=${payload.model || "missing"}, maxSlides=${payload.maxSlides || "missing"}, dataStore=${payload.dataStore || "missing"}`,
    });
  } catch (error) {
    checks.push({ name: "API health", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function checkFrontendBundle() {
  try {
    const html = await fetchText(`${siteUrl}/`);
    const match = html.match(/assets\/[^"']+\.js/);
    if (!match) {
      checks.push({ name: "Frontend bundle", ok: false, detail: "missing JS bundle" });
      return;
    }

    const bundle = await fetchText(`${siteUrl}/${match[0]}`);
    const required = [
      "PowerPoint 文件",
      "文稿或大纲",
      "给人讲",
      "给人看",
      "Terms of Service",
      "Privacy Policy",
      "Refund Policy",
      "发送验证码",
      "service@deckevo.com",
    ];
    const missing = required.filter((item) => !bundle.includes(item));
    checks.push({
      name: "Frontend requirements",
      ok: missing.length === 0,
      detail: missing.length ? `missing ${missing.join(", ")}` : "legal links, source choices, purpose choices, and login code copy present",
    });
  } catch (error) {
    checks.push({ name: "Frontend requirements", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function checkAuthCode() {
  const email = `audit-${Date.now()}@deckpilot.local`;
  try {
    const codeResponse = await fetch(`${siteUrl}/api/auth/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ email }),
    });
    const codePayload = (await codeResponse.json().catch(() => ({}))) as { delivery?: string; devCode?: string; error?: string };
    const loginResponse =
      codePayload.devCode &&
      (await fetch(`${siteUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ email, code: codePayload.devCode }),
      }));

    checks.push({
      name: "Verified email login",
      ok: codeResponse.ok && Boolean(loginResponse && loginResponse.ok),
      detail: `delivery=${codePayload.delivery || "missing"}${codePayload.error ? `, error=${codePayload.error}` : ""}`,
    });
  } catch (error) {
    checks.push({ name: "Verified email login", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function checkEmailDns() {
  try {
    const mx = await resolveMailExchangeRecords();
    checks.push({
      name: "service@deckevo.com mailbox",
      ok: mx.length > 0,
      detail: mx.length
        ? `MX=${mx.map((record) => `${record.exchange} priority ${record.priority}`).join("; ")}`
        : "missing MX records; configure Cloudflare Email Routing or an email provider before real mailbox use",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({
      name: "service@deckevo.com mailbox",
      ok: false,
      detail: message.includes("ENODATA") || message.includes("ENOTFOUND") ? "missing MX records" : message,
    });
  }
}

async function resolveMailExchangeRecords() {
  try {
    return await resolveMx("deckevo.com");
  } catch {
    try {
      const response = await fetch("https://dns.google/resolve?name=deckevo.com&type=MX");
      if (!response.ok) throw new Error(`DNS lookup returned ${response.status}`);
      const payload = (await response.json()) as { Answer?: Array<{ data?: string }> };
      return (payload.Answer || [])
        .map((answer) => {
          const parts = String(answer.data || "").trim().split(/\s+/);
          return {
            priority: Number(parts[0] || 0),
            exchange: parts.slice(1).join(" ").replace(/\.$/, ""),
          };
        })
        .filter((record) => record.exchange);
    } catch {
      const { stdout } = await execFileAsync("nslookup", ["-type=mx", "deckevo.com"]);
      return stdout
        .split(/\r?\n/)
        .map((line) => {
          const exchange = line.match(/mail exchanger =\s*(.+)$/i)?.[1]?.trim().replace(/\.$/, "");
          const priority = Number(line.match(/MX preference =\s*(\d+)/i)?.[1] || 0);
          return exchange ? { exchange, priority } : null;
        })
        .filter((record): record is { exchange: string; priority: number } => Boolean(record));
    }
  }
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}
