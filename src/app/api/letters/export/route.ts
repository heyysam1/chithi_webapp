import { NextRequest } from "next/server";
import { getLettersForExport } from "@/lib/letters";
import { getSessionUsername, requireMailboxOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, rateLimitHeaders } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/letters/export?username= — owner-only full export of every letter
 * with bodies (for the .txt download). Burned letters are excluded.
 */
export async function GET(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);
    const rl = await checkRateLimit("read", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const url = new URL(req.url);
    const usernameParam = url.searchParams.get("username");
    const username = getSessionUsername(req, usernameParam) || usernameParam;

    if (!username) {
      throw new ApiError("UNAUTHORIZED", "errors.unauthorized", 401);
    }

    const { mailbox } = await requireMailboxOwner(req, username);
    const letters = await getLettersForExport(mailbox.usernameLower);

    return apiOk({ letters });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[GET /api/letters/export error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
