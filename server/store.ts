import { randomUUID } from "node:crypto";
import type { DeckSpec, PresentationRequest } from "../src/shared/deck";
import { getLocalPptxPath, readPptxFile, savePptxFile } from "./fileStorage";
import {
  supabaseCreateGenerationJob,
  supabaseFindGeneration,
  supabaseFindGenerationJob,
  supabaseListGenerations,
  supabaseSaveGeneration,
  supabaseUpdateGenerationJob,
  useSupabaseStore,
} from "./supabaseStore";

export type GenerationRecord = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  slideCount: number;
  source: PresentationRequest["source"];
  purpose: PresentationRequest["purpose"];
  style: PresentationRequest["style"];
  language: string;
  audience: string;
  size: number;
  creditCost: number;
};

export type GenerationJobStatus = "queued" | "running" | "ready" | "failed";

export type GenerationJobRecord = {
  id: string;
  userId: string;
  status: GenerationJobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type GenerationJobRow = {
  id: string;
  user_id: string;
  status: GenerationJobStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type GenerationRow = {
  id: string;
  title: string;
  filename: string;
  stored_filename: string;
  created_at: string;
  slide_count: number;
  source: PresentationRequest["source"];
  purpose: PresentationRequest["purpose"];
  style: PresentationRequest["style"];
  language: string;
  audience: string;
  size: number;
  credit_cost: number;
};

export async function saveGeneration(
  userId: string,
  input: PresentationRequest,
  deck: DeckSpec,
  file: Buffer,
  filename: string,
  creditCost: number,
  options: { id?: string } = {},
) {
  const id = options.id || randomUUID();
  const storedFilename = `${id}.pptx`;
  await savePptxFile(storedFilename, file);
  const createdAt = new Date().toISOString();

  const record: GenerationRecord = {
    id,
    title: deck.title || filename,
    filename: `${filename}.pptx`,
    createdAt,
    slideCount: deck.slides.length,
    source: input.source,
    purpose: input.purpose,
    style: input.style,
    language: input.language,
    audience: input.audience,
    size: file.byteLength,
    creditCost,
  };

  if (useSupabaseStore()) {
    await supabaseSaveGeneration({ ...record, userId, storedFilename });
    await updateGenerationJob(userId, id, "ready");
    return record;
  }

  const { getDb } = await import("./db");
  getDb()
    .prepare(
      `
      INSERT INTO generations (
        id, user_id, title, filename, stored_filename, created_at, slide_count,
        source, purpose, style, language, audience, size, credit_cost
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      record.id,
      userId,
      record.title,
      record.filename,
      storedFilename,
      record.createdAt,
      record.slideCount,
      record.source,
      record.purpose,
      record.style,
      record.language,
      record.audience,
      record.size,
      record.creditCost,
    );

  await updateGenerationJob(userId, id, "ready");
  return record;
}

export async function createGenerationJob(userId: string, id: string) {
  if (useSupabaseStore()) {
    await supabaseCreateGenerationJob(userId, id);
    return;
  }

  const now = new Date().toISOString();
  const { getDb } = await import("./db");
  getDb()
    .prepare(
      `
      INSERT OR REPLACE INTO generation_jobs (id, user_id, status, error, created_at, updated_at)
      VALUES (?, ?, 'queued', NULL, ?, ?)
    `,
    )
    .run(id, userId, now, now);
}

export async function updateGenerationJob(userId: string, id: string, status: GenerationJobStatus, error?: string) {
  if (useSupabaseStore()) {
    await supabaseUpdateGenerationJob(userId, id, status, error);
    return;
  }

  const { getDb } = await import("./db");
  getDb()
    .prepare(
      `
      UPDATE generation_jobs
      SET status = ?, error = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    )
    .run(status, error || null, new Date().toISOString(), id, userId);
}

export async function findGenerationJob(userId: string, id: string): Promise<GenerationJobRecord | null> {
  if (useSupabaseStore()) {
    return supabaseFindGenerationJob(userId, id);
  }

  const { getDb } = await import("./db");
  const row = getDb()
    .prepare(
      `
      SELECT id, user_id, status, error, created_at, updated_at
      FROM generation_jobs
      WHERE user_id = ? AND id = ?
    `,
    )
    .get(userId, id) as GenerationJobRow | undefined;

  return row ? mapGenerationJob(row) : null;
}

export async function listGenerations(userId: string): Promise<GenerationRecord[]> {
  if (useSupabaseStore()) {
    return supabaseListGenerations(userId);
  }

  const { getDb } = await import("./db");
  const rows = getDb()
    .prepare(
      `
      SELECT id, title, filename, stored_filename, created_at, slide_count, source,
        purpose, style, language, audience, size, credit_cost
      FROM generations
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `,
    )
    .all(userId) as GenerationRow[];

  return rows.map(mapGeneration);
}

export async function findGeneration(userId: string, id: string) {
  if (useSupabaseStore()) {
    const record = await supabaseFindGeneration(userId, id);
    if (!record) return null;

    const { storedFilename: _storedFilename, ...publicRecord } = record;
    return { record: publicRecord, file: await readPptxFile(record.storedFilename) };
  }

  const { getDb } = await import("./db");
  const row = getDb()
    .prepare(
      `
      SELECT id, title, filename, stored_filename, created_at, slide_count, source,
        purpose, style, language, audience, size, credit_cost
      FROM generations
      WHERE user_id = ? AND id = ?
    `,
    )
    .get(userId, id) as GenerationRow | undefined;

  if (!row) return null;

  return { record: mapGeneration(row), filePath: getLocalPptxPath(row.stored_filename) };
}

function mapGeneration(row: GenerationRow): GenerationRecord {
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    createdAt: row.created_at,
    slideCount: row.slide_count,
    source: row.source,
    purpose: row.purpose,
    style: row.style,
    language: row.language,
    audience: row.audience,
    size: row.size,
    creditCost: row.credit_cost,
  };
}

function mapGenerationJob(row: GenerationJobRow): GenerationJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
