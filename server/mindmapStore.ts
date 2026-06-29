import { randomUUID } from "node:crypto";
import type { MindMapGenerationRecord, MindMapRequest, MindMapSpec } from "../src/shared/mindmap";
import { readGeneratedFile, saveGeneratedFile } from "./fileStorage";
import {
  supabaseFindMindMapGeneration,
  supabaseListMindMapGenerations,
  supabaseSaveMindMapGeneration,
  useSupabaseStore,
} from "./supabaseStore";

type MindMapGenerationRow = {
  id: string;
  title: string;
  stored_filename: string;
  created_at: string;
  audience: string;
  delivery_mode: MindMapGenerationRecord["deliveryMode"];
  style: MindMapGenerationRecord["style"];
  node_count: number;
  size: number;
  credit_cost: number;
};

export type MindMapGeneration = {
  record: MindMapGenerationRecord;
  spec: MindMapSpec;
};

export async function saveMindMapGeneration(
  userId: string,
  input: MindMapRequest,
  spec: MindMapSpec,
  creditCost: number,
  options: { id?: string } = {},
) {
  const id = options.id || randomUUID();
  const file = Buffer.from(JSON.stringify(spec, null, 2), "utf8");
  const storedFilename = `mindmaps/${userId}/${id}.json`;
  const createdAt = new Date().toISOString();

  await saveGeneratedFile(storedFilename, file, "application/json; charset=utf-8");

  const record: MindMapGenerationRecord = {
    id,
    title: spec.title || "动态脑图汇报",
    createdAt,
    audience: input.audience,
    deliveryMode: input.deliveryMode,
    style: input.style,
    nodeCount: countMindMapNodes(spec),
    size: file.byteLength,
    creditCost,
  };

  if (useSupabaseStore()) {
    await supabaseSaveMindMapGeneration({ ...record, userId, storedFilename });
    return record;
  }

  const { getDb } = await import("./db");
  getDb()
    .prepare(
      `
      INSERT INTO mindmap_generations (
        id, user_id, title, stored_filename, created_at, audience,
        delivery_mode, style, node_count, size, credit_cost
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      record.id,
      userId,
      record.title,
      storedFilename,
      record.createdAt,
      record.audience,
      record.deliveryMode,
      record.style,
      record.nodeCount,
      record.size,
      record.creditCost,
    );

  return record;
}

export async function listMindMapGenerations(userId: string): Promise<MindMapGenerationRecord[]> {
  if (useSupabaseStore()) {
    return supabaseListMindMapGenerations(userId);
  }

  const { getDb } = await import("./db");
  const rows = getDb()
    .prepare(
      `
      SELECT id, title, stored_filename, created_at, audience, delivery_mode,
        style, node_count, size, credit_cost
      FROM mindmap_generations
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `,
    )
    .all(userId) as MindMapGenerationRow[];

  return rows.map(mapMindMapGeneration);
}

export async function findMindMapGeneration(userId: string, id: string): Promise<MindMapGeneration | null> {
  if (useSupabaseStore()) {
    const record = await supabaseFindMindMapGeneration(userId, id);
    if (!record) return null;
    const { storedFilename, ...publicRecord } = record;
    return { record: publicRecord, spec: await readMindMapSpec(storedFilename) };
  }

  const { getDb } = await import("./db");
  const row = getDb()
    .prepare(
      `
      SELECT id, title, stored_filename, created_at, audience, delivery_mode,
        style, node_count, size, credit_cost
      FROM mindmap_generations
      WHERE user_id = ? AND id = ?
    `,
    )
    .get(userId, id) as MindMapGenerationRow | undefined;

  if (!row) return null;
  return { record: mapMindMapGeneration(row), spec: await readMindMapSpec(row.stored_filename) };
}

export function countMindMapNodes(spec: MindMapSpec) {
  return spec.nodes.reduce((total, node) => total + 1 + node.children.length, 0);
}

async function readMindMapSpec(storedFilename: string) {
  return JSON.parse((await readGeneratedFile(storedFilename)).toString("utf8")) as MindMapSpec;
}

function mapMindMapGeneration(row: MindMapGenerationRow): MindMapGenerationRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    audience: row.audience,
    deliveryMode: row.delivery_mode,
    style: row.style,
    nodeCount: row.node_count,
    size: row.size,
    creditCost: row.credit_cost,
  };
}
