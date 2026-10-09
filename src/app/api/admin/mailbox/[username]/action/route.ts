import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiErr, ApiError, parseJsonBody } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { EXTEND_DURATIONS } from "@/lib/constants";
import {
  extendMailboxExpiry,
  purgeInactiveMailbox,
} from "@/lib/mailbox";
import type { MailboxRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  action: z.enum(["extend", "expire", "delete"]),
  durationKey: z.enum(["24h", "3d", "5d", "7d"]).optional(),
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
 * POST /api/admin/mailbox/[username]/action
 * Body: { action: "extend" | "expire" | "delete", durationKey?: "24h"|"3d"|"5d"|"7d" }
 *
 * - extend: same rules as the user-facing extend API — respects
 *   MAX_EXTENSIONS_PER_MAILBOX and the platform lifetime cap. Permanent
 *   mailboxes are rejected by extendMailboxExpiry itself.
 * - expire: terminates the mailbox immediately (expiresAt = now, removed from
 *   active index and bottle pools; the cleanup job purges its data).
 * - delete: full purge via purgeInactiveMailbox (record, letters, indexes,
 *   reservation — no orphan keys).
 *
 * The permanent owner mailbox can never be expired or deleted through this
 * endpoint (400/403). Extend on it is rejected by the domain logic.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    await requireAdmin(req);

    const { username } = await params;
    const usernameLower = (username || "").trim().toLowerCase();
    if (!usernameLower) {
      throw new ApiError("VALIDATION_FAILED", "Username is required.", 400);
    }

    const input = await parseJsonBody(req, ActionSchema);

    const redis = getRedis();
    const raw = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));
    if (!raw) {
      throw new ApiError("NOT_FOUND", "errors.mailboxNotFound", 404);
    }
    const mailbox: MailboxRecord =
      typeof raw === "string" ? JSON.parse(raw) : raw;

    if (input.action === "extend") {
      if (!input.durationKey) {
        throw new ApiError(
          "VALIDATION_FAILED",
          "durationKey is required for the extend action.",
          400
        );
      }
      const result = await extendMailboxExpiry(
        mailbox,
        EXTEND_DURATIONS[input.durationKey]
      );
      return apiOk({ action: "extend", ...result });
    }

    if (input.action === "expire") {
      if (mailbox.isPermanent) {
        throw new ApiError(
          "VALIDATION_FAILED",
          "The permanent owner mailbox cannot be force-expired.",
          400
        );
      }
      mailbox.expiresAt = Date.now();
      const pipeline = redis.pipeline();
      // Keep the record briefly so the 410-expired path reads cleanly.
      pipeline.set(keys.mailbox(usernameLower), JSON.stringify(mailbox), { ex: 120 });
      pipeline.zrem(keys.activeIndex(), usernameLower);
      pipeline.zrem(keys.bottlePool("any"), usernameLower);
      pipeline.zrem(keys.bottlePool("male"), usernameLower);
      pipeline.zrem(keys.bottlePool("female"), usernameLower);
      pipeline.zrem(keys.bottlePool("other"), usernameLower);
      await pipeline.exec();
      return apiOk({ action: "expire", expired: true, username: mailbox.username });
    }

    // delete
    if (mailbox.isPermanent) {
      throw new ApiError(
        "FORBIDDEN",
        "The permanent owner mailbox cannot be deleted.",
        403
      );
    }
    await purgeInactiveMailbox(usernameLower);
    return apiOk({ action: "delete", deleted: true, username: mailbox.username });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[POST /api/admin/mailbox/[username]/action error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
