import type { GenerationJobRecord, GenerationJobStatus, GenerationRecord } from "./store";
import type { UserAccount } from "./auth";

type SupabaseLoginResult = {
  user: UserAccount;
  token: string;
  expiresAt: string;
};

type SupabaseGenerationRecord = GenerationRecord & {
  storedFilename: string;
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

async function callSupabaseBackend<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_BACKEND_SECRET;

  if (!url || !anonKey || !secret) {
    throw new Error("Supabase is selected but SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_BACKEND_SECRET is missing.");
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/deckpilot_backend`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, payload, app_secret: secret }),
  });

  if (!response.ok) {
    throw new Error(`Supabase persistence failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}
