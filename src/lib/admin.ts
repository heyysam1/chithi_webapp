import { env } from "./env";
import { getRedis } from "./redis";
import { keys } from "./keys";
import { hashWithPepper, sha256, timingSafeEqual } from "./crypto";
import { extractAuthToken, getSessionUsername } from "./auth";
import { isPermanentMailbox } from "./mailbox";
import { checkRateLimit } from "./ratelimit";
import type { MailboxRecord } from "./types";

/**
 * Admin authentication for the /admin dashboard.
 *
 * Design (per product requirement): there is NO separate admin credential or
 * token system. The admin IS the permanent owner mailbox — the same username
 * + 6-digit passcode the owner uses on the normal site also unlocks /admin.
 * A successful admin login issues the exact same `chithi_s_*` httpOnly
 * session cookie as every other login in the app.
 *
 * Privacy boundary: admin APIs built on requireAdmin must never return
 * letter bodies, passcode hashes, or tokens.
 */

export type AdminAuthErrorCode =
  | "NO_ADMIN_SESSION"
  | "NOT_OWNER_MAILBOX"
  | "ADMIN_NOT_CONFIGURED";

export class AdminAuthError extends Error {
  readonly status: 401 | 403;
  readonly code: AdminAuthErrorCode;

  constructor(code: AdminAuthErrorCode, status: 401 | 403, message?: string) {
    super(message ?? code);
    this.name = "AdminAuthError";
    this.code = code;
    this.status = status;
  }
}

/** True iff the permanent owner mailbox is configured in the environment. */
export function isAdminConfigured(): boolean {
  return (
    env.PERMANENT_MAILBOX_ENABLED === "true" &&
    !!(env.PERMANENT_MAILBOX_USERNAME || "").trim()
  );
}

/** Lowercased configured owner username ("" when not configured). */
export function getOwnerUsernameLower(): string {
  return (env.PERMANENT_MAILBOX_USERNAME || "").trim().toLowerCase();
}

/**
 * Side-effect-free owner passcode check. Uses the same timing-safe
 * SHA-256 comparison as the recovery flow (`recoverPermanentMailbox`).
 * Returns false (never throws) on any mismatch — no user enumeration.
 */
export async function verifyOwnerPasscode(
  username: string,
  passcode: string
): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  if (username.trim().toLowerCase() !== getOwnerUsernameLower()) return false;
  const expected = (env.PERMANENT_MAILBOX_PASSCODE || "").trim();
  if (!expected) return false;
  return timingSafeEqual(sha256(passcode), sha256(expected));
}

/**
 * Guard for all /api/admin/* routes. Resolves the session from the
 * `chithi_s_*` cookie (or Bearer header), then verifies the session belongs
 * to the permanent owner mailbox. Throws typed AdminAuthError on failure.
 */
export async function requireAdmin(req: Request): Promise<MailboxRecord> {
  if (!isAdminConfigured()) {
    throw new AdminAuthError("ADMIN_NOT_CONFIGURED", 403);
  }

  const ownerLower = getOwnerUsernameLower();

  // The disambiguator picks the owner's cookie when several mailboxes are
  // logged in; falls back to the first cookie (→ 403 below) or null (→ 401).
  const sessionUsername = getSessionUsername(req, ownerLower);
  if (!sessionUsername) {
    throw new AdminAuthError("NO_ADMIN_SESSION", 401);
  }
  if (sessionUsername !== ownerLower) {
    throw new AdminAuthError("NOT_OWNER_MAILBOX", 403);
  }

  const token = extractAuthToken(req, ownerLower);
  if (!token) {
    throw new AdminAuthError("NO_ADMIN_SESSION", 401);
  }

  const redis = getRedis();
  const raw = await redis.get<string | MailboxRecord>(keys.mailbox(ownerLower));
  if (!raw) {
    throw new AdminAuthError("NO_ADMIN_SESSION", 401);
  }
  const mailbox: MailboxRecord =
    typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!mailbox.isPermanent || !isPermanentMailbox(mailbox.username)) {
    throw new AdminAuthError("NOT_OWNER_MAILBOX", 403);
  }

  const valid = timingSafeEqual(
    hashWithPepper(token),
    mailbox.accessTokenHash
  );
  if (!valid) {
    throw new AdminAuthError("NO_ADMIN_SESSION", 401);
  }

  return mailbox;
}

/**
 * Rate limit for destructive admin actions (ban, mailbox delete/expire,
 * letter delete, maintenance toggle): 60/min per admin identity.
 * Single trusted user, so this only binds a compromised session.
 * Returns true when the request may proceed, false when throttled.
 */
export async function checkAdminActionRateLimit(): Promise<boolean> {
  const rl = await checkRateLimit(
    "admin_action",
    `admin:${getOwnerUsernameLower()}`
  );
  return rl.success;
}
