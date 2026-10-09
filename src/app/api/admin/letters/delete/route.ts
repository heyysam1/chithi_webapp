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

const DeleteSchema = z.object({
  letterId: z.string().min(1).max(128),
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
 * POST /api/admin/letters/delete
 * Body: { letterId }
 *
 * Deletes a letter by ID: removes the letter JSON, its reactions, its
 * mailbox index entry, and decrements the unread counter (via the shared
 * deleteLetter domain logic), plus any abuse report filed against it.
 * Returns 404 when the letter does not exist.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const input = await parseJsonBody(req, DeleteSchema);

    const redis = getRedis();
    const raw = await redis.get<string | LetterRecord>(keys.letter(input.letterId));
    if (!raw) {
      throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
    }
    const letter: LetterRecord =
      typeof raw === "string" ? JSON.parse(raw) : raw;

    await deleteLetter(letter.recipient, input.letterId);

    // Drop any abuse report filed against this letter.
    await redis.del(keys.report("letter", input.letterId));

    return apiOk({ deleted: true, letterId: input.letterId });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[POST /api/admin/letters/delete error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
