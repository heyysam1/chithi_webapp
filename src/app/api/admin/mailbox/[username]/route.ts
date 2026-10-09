import { NextRequest } from "next/server";
import { apiOk, apiErr, ApiError } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import type { MailboxRecord, LetterRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_LETTER_LIMIT = 20;

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
 * GET /api/admin/mailbox/[username]
 * Full mailbox detail for moderation. Returns metadata only:
 * record fields (EXCLUDING accessTokenHash), letter count, and recent
 * letter METADATA (id, createdAt, source, lockKind, isOpened).
 * Letter bodies are NEVER returned.
 */
export async function GET(
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

    const redis = getRedis();
    const raw = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));
    if (!raw) {
      throw new ApiError("NOT_FOUND", "errors.mailboxNotFound", 404);
    }
    const mailbox: MailboxRecord =
      typeof raw === "string" ? JSON.parse(raw) : raw;

    const letterIds = await redis.zrange(
      keys.mailboxLetters(usernameLower),
      0,
      RECENT_LETTER_LIMIT - 1,
      { rev: true }
    );

    let recentLetters: Array<{
      id: string;
      createdAt: number;
      source: "direct" | "bottle";
      lockKind: "none" | "capsule" | "riddle";
      isOpened: boolean;
    }> = [];

    if (letterIds && letterIds.length > 0) {
      const raws = await redis.mget<unknown[]>(
        ...letterIds.map((id) => keys.letter(id))
      );
      recentLetters = [];
      for (let i = 0; i < letterIds.length; i++) {
        const r = raws[i];
        if (!r) continue;
        let letter: LetterRecord;
        try {
          letter =
            typeof r === "string" ? (JSON.parse(r) as LetterRecord) : (r as LetterRecord);
        } catch {
          continue;
        }
        recentLetters.push({
          id: letter.id,
          createdAt: letter.createdAt,
          source: letter.source,
          lockKind: letter.lock.kind,
          isOpened: letter.openedAt !== null,
        });
      }
    }

    const letterCount = await redis.zcard(keys.mailboxLetters(usernameLower));

    // Strip secrets before responding.
    const { accessTokenHash: _stripped, ...safeMailbox } = mailbox;

    return apiOk({
      mailbox: safeMailbox,
      letterCount,
      recentLetters,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[GET /api/admin/mailbox/[username] error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
