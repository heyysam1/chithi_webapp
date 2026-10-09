import { MailboxRecord } from "./types";
import { getRedis } from "./redis";
import { keys } from "./keys";
import { hashWithPepper, timingSafeEqual } from "./crypto";
import { ApiError } from "./api";
import { touchMailboxLogin } from "./mailbox";

/**
 * Extracts authentication token from Authorization Bearer header first,
 * then falls back to httpOnly session cookie chithi_s_{usernameLower}.
 * URL query parameters are strictly forbidden per SEC-01.
 */
export function extractAuthToken(req: Request, usernameLower: string): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const tokenVal = authHeader.slice(7).trim();
    if (tokenVal) return tokenVal;
  }

  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookieName = `chithi_s_${usernameLower}`;
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`));

    if (match) {
      const tokenVal = match.slice(cookieName.length + 1).trim();
      if (tokenVal) {
        try {
          return decodeURIComponent(tokenVal);
        } catch {
          // Malformed cookie value (e.g. a bare "%") — treat as absent
          // rather than throwing a 500.
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Derives the active session username from chithi_s_* cookies.
 * Accepts optional disambiguator when multiple session cookies are present.
 * Never trusts unauthenticated client-supplied username headers per SEC-07.
 */
export function getSessionUsername(req: Request, disambiguator?: string | null): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const prefix = "chithi_s_";
  const cookieUsernames: string[] = [];

  for (const c of cookieHeader.split(";")) {
    const trimmed = c.trim();
    if (trimmed.startsWith(prefix)) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > prefix.length) {
        const u = trimmed.slice(prefix.length, eqIdx).trim().toLowerCase();
        if (u && !cookieUsernames.includes(u)) {
          cookieUsernames.push(u);
        }
      }
    }
  }

  if (cookieUsernames.length === 0) return null;

  if (disambiguator) {
    const cleanDisambiguator = disambiguator.trim().toLowerCase();
    if (cookieUsernames.includes(cleanDisambiguator)) {
      return cleanDisambiguator;
    }
  }

  return cookieUsernames[0] ?? null;
}

/**
 * Guard for all owner-only route operations. Throws typed ApiError on failures.
 */
export async function requireMailboxOwner(
  req: Request,
  username: string
): Promise<{ mailbox: MailboxRecord; token: string }> {
  const usernameLower = username.toLowerCase();
  const token = extractAuthToken(req, usernameLower);

  if (!token) {
    throw new ApiError("UNAUTHORIZED", "errors.unauthorized", 401);
  }

  const redis = getRedis();
  const rawMailbox = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));

  if (!rawMailbox) {
    throw new ApiError("NOT_FOUND", "errors.mailboxNotFound", 404);
  }

  const mailbox: MailboxRecord =
    typeof rawMailbox === "string" ? JSON.parse(rawMailbox) : rawMailbox;

  // Confirm mailbox is still within lifetime
  if (Date.now() > mailbox.expiresAt) {
    throw new ApiError("GONE", "errors.mailboxExpired", 410);
  }

  const incomingHash = hashWithPepper(token);
  const isValid = timingSafeEqual(incomingHash, mailbox.accessTokenHash);

  if (!isValid) {
    throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
  }

  // Enforce admin user-kind bans (abuse:block:user:{usernameLower}).
  // The ban key carries a TTL, so expiry is automatic — presence alone
  // is sufficient to deny access.
  const userBan = await redis.get(keys.abuseBlockUser(usernameLower));
  if (userBan !== null && userBan !== undefined) {
    throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
  }

  // Touch activity index for observability (§PERF-02)
  await touchMailboxLogin(mailbox);

  return { mailbox, token };
}
