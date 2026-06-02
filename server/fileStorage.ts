import fs from "node:fs/promises";
import path from "node:path";
import { useSupabaseStore } from "./supabaseStore";

const storeDir = path.resolve(process.cwd(), "output/generated");
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "deckpilot-pptx";

export async function savePptxFile(storedFilename: string, file: Buffer) {
  if (useSupabaseStore()) {
    await uploadToSupabaseStorage(storedFilename, file);
    return;
  }

  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(path.join(storeDir, storedFilename), file);
}

export async function readPptxFile(storedFilename: string) {
  if (useSupabaseStore()) {
    return downloadFromSupabaseStorage(storedFilename);
  }

  return fs.readFile(path.join(storeDir, storedFilename));
}

export function getLocalPptxPath(storedFilename: string) {
  return path.join(storeDir, storedFilename);
}

async function uploadToSupabaseStorage(storedFilename: string, file: Buffer) {
  const response = await fetch(`${getSupabaseUrl()}/storage/v1/object/${bucketName}/${storedFilename}`, {
    method: "POST",
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "x-upsert": "false",
    },
    body: new Uint8Array(file),
  });

  if (!response.ok) {
    throw new Error(`Supabase Storage upload failed: ${response.status} ${await response.text()}`);
  }
}

async function downloadFromSupabaseStorage(storedFilename: string) {
  const response = await fetch(`${getSupabaseUrl()}/storage/v1/object/${bucketName}/${storedFilename}`, {
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase Storage download failed: ${response.status} ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is missing.");
  return url.replace(/\/$/, "");
}

function getSupabaseAnonKey() {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_ANON_KEY is missing.");
  return key;
}
