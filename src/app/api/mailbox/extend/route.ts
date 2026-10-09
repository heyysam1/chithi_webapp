import { NextRequest } from "next/server";
import { ExtendMailboxSchema } from "@/lib/schemas";
import { EXTEND_DURATIONS } from "@/lib/constants";
import { extendMailboxExpiry } from "@/lib/mailbox";
import { requireMailboxOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, parseJsonBody, rateLimitHeaders } from "@/lib/api";
import { incrMetric } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);

    // Rate limit: 10 extensions / hour per IP — owner-only, so this is
    // just a bound on write amplification, never a legit-use blocker.
    const rl = await checkRateLimit("extend", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const url = new URL(req.url);
    const username = url.searchParams.get("username");

    if (!username) {
      throw new ApiError("VALIDATION_FAILED", "errors.validation.usernameRequired", 400);
    }

    const { mailbox } = await requireMailboxOwner(req, username);
    const input = await parseJsonBody(req, ExtendMailboxSchema);

    const result = await extendMailboxExpiry(mailbox, EXTEND_DURATIONS[input.durationKey]);

    // Aggregate metric for the admin dashboard (fire-and-forget).
    void incrMetric("feat_extend");

    return apiOk(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/mailbox/extend error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
