import { NextRequest } from "next/server";
import { ReactFeedSchema } from "@/lib/schemas";
import { reactToFeedItem } from "@/lib/feed";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, getViewerHash, parseJsonBody, rateLimitHeaders } from "@/lib/api";
import { incrMetric } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const rateKey = getRateKey(req);
    const viewerHash = getViewerHash(req);

    // Rate limit: 30 reacts / min per IP (§10.1)
    const rl = await checkRateLimit("react", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const input = await parseJsonBody(req, ReactFeedSchema);
    const result = await reactToFeedItem(id, input.reaction, viewerHash);

    // Aggregate metric for the admin dashboard (fire-and-forget).
    void incrMetric("feat_reaction");

    return apiOk(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/feed/[id]/react error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
