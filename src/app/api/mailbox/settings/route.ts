import { NextRequest } from "next/server";
import { UpdateSettingsSchema } from "@/lib/schemas";
import { updateMailboxSettings } from "@/lib/mailbox";
import { requireMailboxOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, parseJsonBody, rateLimitHeaders } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);

    // Rate limit: 20 settings writes / hour per IP — owner-only, so this is
    // just a bound on write amplification, never a legit-use blocker.
    const rl = await checkRateLimit("settings", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const url = new URL(req.url);
    const username = url.searchParams.get("username");

    if (!username) {
      throw new ApiError("VALIDATION_FAILED", "errors.validation.usernameRequired", 400);
    }

    const { mailbox } = await requireMailboxOwner(req, username);
    const input = await parseJsonBody(req, UpdateSettingsSchema);

    const result = await updateMailboxSettings(mailbox, input);
    return apiOk(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[PATCH /api/mailbox/settings error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
