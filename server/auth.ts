import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { supabaseAddCredits, supabaseConsumeCredits, supabaseFindUserBySession, supabaseGetUserById, supabaseLogin, supabaseLogout, useSupabaseStore } from "./supabaseStore";
import { sendLoginCodeEmail } from "./email";

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
const sessionDays = 90;
const loginCodeMinutes = 15;
const maxCodeAttempts = 5;
const loginCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

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

export async function requestLoginCode(email: string) {
  const normalized = normalizeEmail(email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  loginCodes.set(normalized, {
    code,
    expiresAt: Date.now() + loginCodeMinutes * 60 * 1000,
    attempts: 0,
  });

  const delivery = await sendLoginCodeEmail(normalized, code);
  return {
    email: normalized,
    expiresInSeconds: loginCodeMinutes * 60,
    delivery: delivery.sent ? "email" : "development",
    provider: delivery.provider,
    devCode: delivery.devCode,
  };
}

export async function verifyLoginCode(email: string, code: string, res: Response) {
  const normalized = normalizeEmail(email);
  const inputCode = String(code || "").trim();
  if (!/^\d{6}$/.test(inputCode)) {
    throw new Error("请输入 6 位验证码。");
  }

  const record = loginCodes.get(normalized);
  if (!record || record.expiresAt < Date.now()) {
    loginCodes.delete(normalized);
    throw new Error("验证码已过期，请重新获取。");
  }

  record.attempts += 1;
  if (record.attempts > maxCodeAttempts) {
    loginCodes.delete(normalized);
    throw new Error("验证码尝试次数过多，请重新获取。");
  }

  if (record.code !== inputCode) {
    throw new Error("验证码不正确。");
  }

  loginCodes.delete(normalized);
  return loginWithEmail(normalized, res);
}

async function loginWithEmail(email: string, res: Response) {
  const normalized = normalizeEmail(email);

  if (useSupabaseStore()) {
    const result = await supabaseLogin(normalized, getDefaultCredits(), sessionDays);
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
  res.clearCookie(cookieName, getCookieOptions());
}

export async function consumeCredits(userId: string, amount: number) {
  if (useSupabaseStore()) {
    await supabaseConsumeCredits(userId, amount);
    return;
  }

  const { getDb } = await import("./db");
  getDb().prepare("UPDATE users SET credits_used = credits_used + ? WHERE id = ?").run(amount, userId);
}

export async function addCredits(userId: string, amount: number, source: string, referenceId: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Credit amount must be positive.");
  }

  if (useSupabaseStore()) {
    await supabaseAddCredits(userId, Math.round(amount), source, referenceId);
    return;
  }

  const { getDb } = await import("./db");
  const db = getDb();
  const payment = db.prepare("SELECT id FROM credit_payments WHERE reference_id = ?").get(referenceId) as { id: string } | undefined;
  if (payment) return;

  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO credit_payments (id, user_id, amount, source, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), userId, Math.round(amount), source, referenceId, now);
  db.prepare("UPDATE users SET credits_total = credits_total + ? WHERE id = ?").run(Math.round(amount), userId);
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
    ...getCookieOptions(),
    expires: expiresAt,
  });
}

function getCookieOptions() {
  const sameSite = (process.env.COOKIE_SAME_SITE || (process.env.FRONTEND_ORIGIN ? "none" : "lax")).toLowerCase() as "lax" | "none" | "strict";
  return {
    httpOnly: true,
    sameSite,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    path: "/",
  };
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
