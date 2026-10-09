import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiErr, ApiError, parseJsonBody } from "@/lib/api";
import { requireAdmin, AdminAuthError, checkAdminActionRateLimit } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BAN_TTL_S = 86400; // 24h
const MAX_BAN_TTL_S = 2592000; // 30d

const BanSchema = z.object({
  identifier: z.string().min(1).max(200),
  kind: z.enum(["ip", "user"]),
  ttlSeconds: z.number().int().min(60).max(MAX_BAN_TTL_S).optional(),
  reason: z.string().max(200).optional(),
});

function adminErrorMessage(code: string): string {
  switch (code) {
    case "NO_ADMIN_SESSION":
      return "Admin login required.";
    case "NOT_OWNER_MAILBOX":
      return "This session is not the owner admin mailbox.";
    case "ADMIN_NOT_CONFIGURED":
      return "Admin panel is not configured on this server.";
    default:
      return code;
  }
}

/**
 * POST /api/admin/ban
 * Body: { identifier, kind: "ip" | "user", ttlSeconds?, reason? }
 *
 * - kind "ip": the raw IP is hashed (same salted scheme as the rate
 *   limiter) and the block is written to abuse:block:{rateKey}, which the
 *   existing checkAbuseBlock() enforcement reads. Raw IPs are never stored.
 * - kind "user": writes abuse:block:user:{usernameLower}. Enforcement happens
 *   in requireMailboxOwner (src/lib/auth.ts), which denies access while the
 *   ban key exists. The key carries a TTL, so bans expire automatically.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    // Bound high-speed abuse if the owner session is ever compromised.
    if (!(await checkAdminActionRateLimit())) {
      return apiErr("RATE_LIMITED", "Too many admin actions. Slow down.", 429);
    }

    const input = await parseJsonBody(req, BanSchema);
    const ttl = input.ttlSeconds ?? DEFAULT_BAN_TTL_S;

    let blockKey: string;
    if (input.kind === "ip") {
      const ip = input.identifier.trim();
      // Minimal sanity check — full validation is unnecessary since the
      // value is hashed, never stored or displayed raw.
      if (ip.length < 3 || ip.length > 100) {
        throw new ApiError("VALIDATION_FAILED", "Invalid IP identifier.", 400);
      }
      const rateKey = sha256(`${ip}:${env.IP_SALT}`).slice(0, 32);
      blockKey = keys.abuseBlock(rateKey);
    } else {
      const usernameLower = input.identifier.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_.-]{1,48}$/.test(usernameLower)) {
        throw new ApiError("VALIDATION_FAILED", "Invalid username identifier.", 400);
      }
      blockKey = keys.abuseBlockUser(usernameLower);
    }

    const redis = getRedis();
    await redis.set(
      blockKey,
      JSON.stringify({
        reason: input.reason?.trim() || null,
        kind: input.kind,
        by: "admin",
        at: Date.now(),
      }),
      { ex: ttl }
    );

    return apiOk({
      banned: true,
      kind: input.kind,
      ttlSeconds: ttl,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[POST /api/admin/ban error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}

export interface BanInfo {
  key: string;
  kind: "ip" | "user";
  /** Human-readable identifier: username for user-kind, truncated hash for ip-kind (raw IPs are never stored). */
  identifier: string;
  reason: string | null;
  by: string | null;
  at: number | null;
  ttlSeconds: number | null;
}

const USER_BAN_PREFIX = "abuse:block:user:";
const IP_BAN_PREFIX = "abuse:block:";

/**
 * GET /api/admin/ban
 * Lists active bans (scan of abuse:block:*). IP identifiers are hashes —
 * only a truncated fingerprint is shown, never a raw IP.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const redis = getRedis();
    const bans: BanInfo[] = [];
    let cursor: number | string = 0;
    for (;;) {
      const [next, batch] = await redis.scan(cursor, {
        match: `${IP_BAN_PREFIX}*`,
        count: 200,
      });
      for (const key of batch) {
        let meta: {
          reason?: string | null;
          kind?: string;
          by?: string;
          at?: number;
        } = {};
        try {
          const raw = await redis.get<string>(key);
          if (raw) meta = JSON.parse(raw) as typeof meta;
        } catch {
          // Corrupt payload — still list the ban.
        }
        const ttl = await redis.ttl(key);
        const isUser = key.startsWith(USER_BAN_PREFIX);
        bans.push({
          key,
          kind: isUser ? "user" : "ip",
          identifier: isUser
            ? key.slice(USER_BAN_PREFIX.length)
            : `${key.slice(IP_BAN_PREFIX.length, IP_BAN_PREFIX.length + 12)}…`,
          reason: meta.reason ?? null,
          by: meta.by ?? null,
          at: typeof meta.at === "number" ? meta.at : null,
          ttlSeconds: ttl > 0 ? ttl : null,
        });
      }
      cursor = next;
      if (String(cursor) === "0") break;
    }
    bans.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    return apiOk({ bans });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    console.error("[GET /api/admin/ban error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}

const RevokeSchema = z.object({
  key: z.string().min(1).max(120),
});

/**
 * DELETE /api/admin/ban
 * Body: { key } — revokes one ban. The key must be an exact
 * abuse:block:* key (no patterns), so arbitrary keys can't be deleted.
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    const input = await parseJsonBody(req, RevokeSchema);
    const key = input.key.trim();
    if (!key.startsWith(IP_BAN_PREFIX) || /[*?\s]/.test(key)) {
      throw new ApiError("VALIDATION_FAILED", "Invalid ban key.", 400);
    }
    const redis = getRedis();
    await redis.del(key);
    return apiOk({ revoked: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[DELETE /api/admin/ban error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
