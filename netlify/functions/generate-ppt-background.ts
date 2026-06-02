import type { Handler } from "@netlify/functions";
import type { PresentationRequest } from "../../src/shared/deck";
import { generateAndSaveDeck } from "../../server/generateTask";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  const payload = JSON.parse(event.body || "{}") as {
    secret?: string;
    userId?: string;
    input?: PresentationRequest;
  };

  if (!payload.secret || payload.secret !== process.env.SUPABASE_BACKEND_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized." }) };
  }

  if (!payload.userId || !payload.input) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing generation payload." }) };
  }

  await generateAndSaveDeck(payload.userId, payload.input);

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
