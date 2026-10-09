import { NextRequest } from "next/server";
import { ReactLetterSchema } from "@/lib/schemas";
import { reactToLetter } from "@/lib/letters";
import { requireMailboxOwner } from "@/lib/auth";
import { incrMetric } from "@/lib/metrics";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, parseJsonBody, rateLimitHeaders } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const rateKey = getRateKey(req);

    // Rate limit: 30 reacts / min per IP (§10.1) — matches the feed react route.
    const rl = await checkRateLimit("react", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const url = new URL(req.url);
    const username = url.searchParams.get("username");

    if (!username) {
      throw new ApiError("VALIDATION_FAILED", "errors.validation.usernameRequired", 400);
    }

    const { mailbox } = await requireMailboxOwner(req, username);
    const input = await parseJsonBody(req, ReactLetterSchema);

    const result = await reactToLetter(mailbox.usernameLower, id, input.reaction);

    // Aggregate metric for the admin dashboard (fire-and-forget).
    void incrMetric("feat_reaction");

    return apiOk(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/letters/[id]/react error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
