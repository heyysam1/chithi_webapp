import { NextRequest } from "next/server";
import { ReportSchema } from "@/lib/schemas";
import { reportContent } from "@/lib/feed";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, getViewerHash, parseJsonBody, rateLimitHeaders } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);

    // Rate limit: 10 reports / hour per IP (§10.1)
    const rl = await checkRateLimit("report", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const input = await parseJsonBody(req, ReportSchema);
    // Pass the privacy-preserving viewer hash so reportContent can count
    // DISTINCT reporters (C-3 fix): without it, one actor could quarantine
    // any feed item by reporting 3 times.
    const result = await reportContent(
      input.targetType,
      input.targetId,
      input.reason,
      input.note,
      getViewerHash(req)
    );

    return apiOk(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/report error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
