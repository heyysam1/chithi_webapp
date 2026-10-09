import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiErr, ApiError, parseJsonBody } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
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
 * - kind "user": writes abuse:block:user:{usernameLower}. Enforcement for
 *   user-kind bans (a check inside requireMailboxOwner) is a separate
 *   future step — the key and metadata are recorded now.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

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
      blockKey = `abuse:block:user:${usernameLower}`;
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
      note:
        input.kind === "user"
          ? "User-kind ban recorded. Request-time enforcement is a future step."
          : undefined,
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
