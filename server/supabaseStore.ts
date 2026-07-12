import type { GenerationJobRecord, GenerationJobStatus, GenerationRecord } from "./store";
import type { UserAccount } from "./auth";
import type { MindMapGenerationRecord } from "../src/shared/mindmap";

type SupabaseLoginResult = {
  user: UserAccount;
  token: string;
  expiresAt: string;
};

type SupabaseGenerationRecord = GenerationRecord & {
  storedFilename: string;
};

type SupabaseMindMapGenerationRecord = MindMapGenerationRecord & {
  storedFilename: string;
};

export type CreditPaymentRecord = {
  id: string;
  amount: number;
  source: string;
  referenceId: string;
  createdAt: string;
};

export function useSupabaseStore() {
  return process.env.DATA_STORE === "supabase";
}

export async function supabaseLogin(email: string, defaultCredits: number, sessionDays: number) {
  return callSupabaseBackend<SupabaseLoginResult>("login", { email, defaultCredits, sessionDays });
}

export async function supabaseFindUserBySession(token: string) {
  const result = await callSupabaseBackend<{ user: UserAccount | null }>("find_user_by_session", { token });
  return result.user;
}

export async function supabaseLogout(token: string) {
  await callSupabaseBackend<{ ok: boolean }>("logout", { token });
}

export async function supabaseConsumeCredits(userId: string, amount: number) {
  await callSupabaseBackend<{ ok: boolean }>("consume_credits", { userId, amount });
}

export async function supabaseAddCredits(userId: string, amount: number, source: string, referenceId: string) {
  await callSupabaseAddCredits<{ ok: boolean }>({ userId, amount, source, referenceId });
}

export async function supabaseListCreditPayments(userId: string) {
  const result = await callSupabaseAddCredits<{ payments: CreditPaymentRecord[] }>({ action: "list", userId });
  return result.payments || [];
}

export async function supabaseGetUserById(userId: string) {
  const result = await callSupabaseBackend<{ user: UserAccount | null }>("get_user_by_id", { userId });
  return result.user;
}

export async function supabaseSaveGeneration(record: GenerationRecord & { userId: string; storedFilename: string }) {
  await callSupabaseBackend<{ ok: boolean }>("save_generation", {
    id: record.id,
    userId: record.userId,
    title: record.title,
    filename: record.filename,
    storedFilename: record.storedFilename,
    createdAt: record.createdAt,
    slideCount: record.slideCount,
    source: record.source,
    purpose: record.purpose,
    style: record.style,
    language: record.language,
    audience: record.audience,
    size: record.size,
    creditCost: record.creditCost,
  });
}

export async function supabaseListGenerations(userId: string) {
  const result = await callSupabaseBackend<{ records: GenerationRecord[] }>("list_generations", { userId });
  return result.records || [];
}

export async function supabaseFindGeneration(userId: string, id: string) {
  const result = await callSupabaseBackend<{ record: SupabaseGenerationRecord | null }>("find_generation", { userId, id });
  return result.record;
}

export async function supabaseCreateGenerationJob(userId: string, id: string) {
  await callSupabaseBackend<{ ok: boolean }>("create_generation_job", { userId, id });
}

export async function supabaseUpdateGenerationJob(userId: string, id: string, status: GenerationJobStatus, error?: string) {
  await callSupabaseBackend<{ ok: boolean }>("update_generation_job", { userId, id, status, error: error || null });
}

export async function supabaseFindGenerationJob(userId: string, id: string) {
  const result = await callSupabaseBackend<{ job: GenerationJobRecord | null }>("find_generation_job", { userId, id });
  return result.job;
}

export async function supabaseSaveMindMapGeneration(record: MindMapGenerationRecord & { userId: string; storedFilename: string }) {
  await callSupabaseMindMapBackend<{ ok: boolean }>("save_mindmap_generation", {
    id: record.id,
    userId: record.userId,
    title: record.title,
    storedFilename: record.storedFilename,
    createdAt: record.createdAt,
    audience: record.audience,
    deliveryMode: record.deliveryMode,
    style: record.style,
    nodeCount: record.nodeCount,
    size: record.size,
    creditCost: record.creditCost,
  });
}

export async function supabaseListMindMapGenerations(userId: string) {
  const result = await callSupabaseMindMapBackend<{ records: MindMapGenerationRecord[] }>("list_mindmap_generations", { userId });
  return result.records || [];
}

export async function supabaseFindMindMapGeneration(userId: string, id: string) {
  const result = await callSupabaseMindMapBackend<{ record: SupabaseMindMapGenerationRecord | null }>("find_mindmap_generation", {
    userId,
    id,
  });
  return result.record;
}

async function callSupabaseBackend<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  return callSupabaseRpc<T>("deckpilot_backend", { action, payload, app_secret: getSupabaseSecret() });
}

async function callSupabaseMindMapBackend<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  return callSupabaseRpc<T>("deckpilot_mindmap_backend", { action, payload, app_secret: getSupabaseSecret() });
}

async function callSupabaseAddCredits<T>(payload: Record<string, unknown>): Promise<T> {
  return callSupabaseRpc<T>("deckpilot_add_credits", { payload, app_secret: getSupabaseSecret() });
}

function getSupabaseSecret() {
  const secret = process.env.SUPABASE_BACKEND_SECRET;
  if (!secret) {
    throw new Error("Supabase is selected but SUPABASE_BACKEND_SECRET is missing.");
  }
  return secret;
}

async function callSupabaseRpc<T>(rpcName: string, body: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase is selected but SUPABASE_URL or SUPABASE_ANON_KEY is missing.");
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Supabase persistence failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}
