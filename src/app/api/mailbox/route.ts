import { NextRequest } from "next/server";
import { z } from "zod";
import { requireMailboxOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { purgeInactiveMailbox } from "@/lib/mailbox";
import { hashWithPepper, timingSafeEqual } from "@/lib/crypto";
import { keys } from "@/lib/keys";
import { getRedis } from "@/lib/redis";
import {
  apiOk,
  apiErr,
  ApiError,
  getRateKey,
  parseJsonBody,
  rateLimitHeaders,
} from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DeleteMailboxSchema = z
  .object({
    passcode: z
      .string()
      .length(6, "errors.validation.passcodeLength")
      .regex(/^\d{6}$/, "errors.validation.passcodeDigits"),
  })
  .strict();

/**
 * DELETE /api/mailbox?username={username}
 * Self-service permanent mailbox deletion ("Delete my account").
 *
 * - Owner session required (requireMailboxOwner).
 * - 6-digit recovery passcode re-verified timing-safe (generic 401 on mismatch).
 * - The permanent owner mailbox can never be self-deleted.
 * - Wipes the mailbox record, received letters, recovery hash, unread
 *   counter, username reservation, bottle-pool entries and flood/pair guard
 *   keys via purgeInactiveMailbox. Letters this user SENT stay in their
 *   recipients' inboxes; anonymous Benami Kham wall copies stay (untraceable).
 * - Clears the session cookie for this mailbox.
 */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("username");

    if (!username) {
      throw new ApiError(
        "VALIDATION_FAILED",
        "errors.validation.usernameRequired",
        400
      );
    }

    // Strict rate limit: 3 attempts / hour per IP. Destructive and
    // irreversible — the tight bound is deliberate.
    const rl = await checkRateLimit("delete_account", getRateKey(req));
    if (!rl.success) {
      return apiErr(
        "RATE_LIMITED",
        "errors.rateLimited",
        429,
        undefined,
        rateLimitHeaders(rl)
      );
    }

    const { mailbox } = await requireMailboxOwner(req, username);
    const usernameLower = username.toLowerCase();

    // The permanent owner mailbox can never be deleted — not even by itself.
    if (mailbox.isPermanent) {
      throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
    }

    // Re-verify the 6-digit recovery passcode (timing-safe). Deliberately
    // generic error — no hint whether the passcode or anything else failed.
    const input = await parseJsonBody(req, DeleteMailboxSchema);
    const redis = getRedis();
    const storedHash = await redis.get<string>(
      keys.mailboxRecovery(usernameLower)
    );
    const matches =
      storedHash != null &&
      timingSafeEqual(hashWithPepper(input.passcode), storedHash);
    if (!matches) {
      throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
    }

    await purgeInactiveMailbox(usernameLower);

    const response = apiOk({ deleted: true, username: mailbox.username });

    // Clear this mailbox's session cookie — the session is gone with it.
    response.cookies.set({
      name: `chithi_s_${usernameLower}`,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[DELETE /api/mailbox error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
