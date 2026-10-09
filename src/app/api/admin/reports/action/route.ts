import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiErr, ApiError, parseJsonBody } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { deleteLetter } from "@/lib/letters";
import type { LetterRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  key: z.string().regex(/^report:(letter|feed):.+$/, "Invalid report key."),
  action: z.enum(["dismiss", "delete_target"]),
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
 * POST /api/admin/reports/action
 * Body: { key: "report:<letter|feed>:<id>", action: "dismiss" | "delete_target" }
 *
 * - dismiss: removes the report key (report cleared, content untouched).
 * - delete_target: deletes the reported letter (via shared deleteLetter
 *   domain logic) or the reported feed item (feed record + both indexes),
 *   then removes the report key.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const input = await parseJsonBody(req, ActionSchema);

    const redis = getRedis();
    const exists = await redis.get<string | number>(input.key);
    // Reports are hashes; a plain GET returning null means the key is gone
    // (GET on a hash key returns null via Upstash REST type coercion).
    const hashData = await redis.hgetall<Record<string, string | number>>(input.key);
    if (!exists && (!hashData || Object.keys(hashData).length === 0)) {
      throw new ApiError("NOT_FOUND", "Report not found.", 404);
    }

    const [, targetType, ...rest] = input.key.split(":");
    const targetId = rest.join(":");

    let targetDeleted = false;

    if (input.action === "delete_target") {
      if (targetType === "letter") {
        const raw = await redis.get<string | LetterRecord>(keys.letter(targetId));
        if (raw) {
          const letter: LetterRecord =
            typeof raw === "string" ? JSON.parse(raw) : raw;
          await deleteLetter(letter.recipient, targetId);
          targetDeleted = true;
        }
      } else {
        // feed target: remove the feed record and both indexes.
        const pipeline = redis.pipeline();
        pipeline.del(keys.feedItem(targetId));
        pipeline.zrem(keys.feedIds(), targetId);
        pipeline.zrem(keys.feedTrending(), targetId);
        await pipeline.exec();
        targetDeleted = true;
      }
    }

    await redis.del(input.key);

    return apiOk({ action: input.action, key: input.key, targetDeleted });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[POST /api/admin/reports/action error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
