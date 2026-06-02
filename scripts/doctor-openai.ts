import dotenv from "dotenv";
import path from "node:path";
import { configureOpenAIProxy, getModelCandidates } from "../server/openai";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true, quiet: true });

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com";
const candidates = getModelCandidates();
const proxy = process.env.OPENAI_HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

configureOpenAIProxy();

console.log("OpenAI diagnostics");
console.log(`- key: ${apiKey ? maskKey(apiKey) : "missing"}`);
console.log(`- base URL: ${baseURL}`);
console.log(`- model candidates: ${candidates.join(", ")}`);
console.log(`- proxy: ${proxy ? "configured" : "not configured"}`);

if (!apiKey) {
  console.error("OPENAI_API_KEY is missing. Add it to .env.local or .env.");
  process.exit(1);
}

await checkModelsList(apiKey, baseURL);

let succeeded = false;
for (const model of candidates) {
  const ok = await checkResponseCreate(apiKey, baseURL, model);
  if (ok) {
    succeeded = true;
    break;
  }
}

if (!succeeded) {
  console.error("No OpenAI model candidate succeeded.");
  process.exit(1);
}

function maskKey(key: string) {
  if (key.length <= 12) return "<set>";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

async function checkModelsList(apiKey: string, baseURL: string) {
  const response = await fetch(`${baseURL}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    console.log(`- model list: ${response.status} ${await readError(response)}`);
    return;
  }

  const body = (await response.json()) as { data?: Array<{ id: string }> };
  const models = (body.data || [])
    .map((model) => model.id)
    .filter((id) => id.startsWith("gpt-"))
    .slice(0, 8)
    .join(", ");
  console.log(`- model list: ok${models ? ` (${models})` : ""}`);
}

async function checkResponseCreate(apiKey: string, baseURL: string, model: string) {
  const response = await fetch(`${baseURL}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: "Reply with exactly: OK",
      max_output_tokens: 16,
    }),
  });

  if (!response.ok) {
    console.log(`- ${model}: ${response.status} ${await readError(response)}`);
    return false;
  }

  const body = (await response.json()) as { output_text?: string };
  console.log(`- ${model}: ok (${(body.output_text || "").slice(0, 24)})`);
  return true;
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string; type?: string; code?: string } };
    return body.error?.message || JSON.stringify(body).slice(0, 300);
  } catch {
    return response.statusText;
  }
}
