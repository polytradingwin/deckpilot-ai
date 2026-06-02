import { randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { supabaseConsumeCredits, supabaseFindUserBySession, supabaseGetUserById, supabaseLogin, supabaseLogout, useSupabaseStore } from "./supabaseStore";

export type UserAccount = {
  id: string;
  email: string;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
};

type UserRow = {
  id: string;
  email: string;
  credits_total: number;
  credits_used: number;
};

const cookieName = "deckpilot_session";
const sessionDays = 30;

export function getDefaultCredits() {
  return Number(process.env.FREE_CREDITS || 200);
}

export function getCreditCost(slides: number) {
  const perSlide = Number(process.env.CREDIT_COST_PER_SLIDE || 5);
  return Math.max(perSlide, Math.round(slides) * perSlide);
}

export async function findUserBySession(req: Request): Promise<UserAccount | null> {
  const token = readCookie(req, cookieName);
  if (!token) return null;

  if (useSupabaseStore()) {
    return supabaseFindUserBySession(token);
  }

  const { getDb } = await import("./db");
  const row = getDb()
    .prepare(
      `
      SELECT users.id, users.email, users.credits_total, users.credits_used
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > ?
    `,
    )
    .get(token, new Date().toISOString()) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export async function requireUser(req: Request, res: Response) {
  const user = await findUserBySession(req);
  if (!user) {
    res.status(401).json({ error: "请先登录后再生成 PPT。" });
    return null;
  }
  return user;
}

export async function loginWithEmail(email: string, res: Response) {
  const normalized = normalizeEmail(email);

  if (useSupabaseStore()) {
    const result = await supabaseLogin(normalized, getDefaultCredits());
    setSessionCookie(res, result.token, new Date(result.expiresAt));
    return result.user;
  }

  const { getDb } = await import("./db");
  const db = getDb();
  const now = new Date().toISOString();
  let row = db.prepare("SELECT id, email, credits_total, credits_used FROM users WHERE email = ?").get(normalized) as UserRow | undefined;

  if (!row) {
    const id = randomUUID();
    db.prepare("INSERT INTO users (id, email, credits_total, credits_used, created_at) VALUES (?, ?, ?, 0, ?)").run(
      id,
      normalized,
      getDefaultCredits(),
      now,
    );
    row = db.prepare("SELECT id, email, credits_total, credits_used FROM users WHERE id = ?").get(id) as UserRow;
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    row.id,
    now,
    expiresAt.toISOString(),
  );

  setSessionCookie(res, token, expiresAt);

  return mapUser(row);
}

export async function logout(req: Request, res: Response) {
  const token = readCookie(req, cookieName);
  if (token) {
    if (useSupabaseStore()) {
      await supabaseLogout(token);
    } else {
      const { getDb } = await import("./db");
      getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
  }
  res.clearCookie(cookieName, { path: "/" });
}

export async function consumeCredits(userId: string, amount: number) {
  if (useSupabaseStore()) {
    await supabaseConsumeCredits(userId, amount);
    return;
  }

  const { getDb } = await import("./db");
  getDb().prepare("UPDATE users SET credits_used = credits_used + ? WHERE id = ?").run(amount, userId);
}

export async function getUserById(userId: string) {
  if (useSupabaseStore()) {
    return supabaseGetUserById(userId);
  }

  const { getDb } = await import("./db");
  const row = getDb().prepare("SELECT id, email, credits_total, credits_used FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

function mapUser(row: UserRow): UserAccount {
  return {
    id: row.id,
    email: row.email,
    creditsTotal: row.credits_total,
    creditsUsed: row.credits_used,
    creditsRemaining: Math.max(0, row.credits_total - row.credits_used),
  };
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("请输入有效的邮箱地址。");
  }
  return normalized;
}

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie;
  if (!raw) return "";

  for (const item of raw.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return "";
}
