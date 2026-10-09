import { NextRequest } from "next/server";
import { CreateMailboxSchema } from "@/lib/schemas";
import { createMailbox, isPermanentMailbox } from "@/lib/mailbox";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, getRequestBaseUrl, isLocalRequest, parseJsonBody, rateLimitHeaders } from "@/lib/api";
import { DURATIONS } from "@/lib/constants";
import { incrMetric } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);

    // Rate limit: 3 creates per hour per IP (§10.1)
    const rl = await checkRateLimit("create", rateKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const input = await parseJsonBody(req, CreateMailboxSchema);

    // Reserve the permanent owner username: reject exactly like a taken name
    // (no signal that it is specially reserved).
    if (isPermanentMailbox(input.username)) {
      throw new ApiError("USERNAME_TAKEN", "errors.usernameTaken", 409);
    }

    const created = await createMailbox(input);

    // Aggregate metric for the admin dashboard (fire-and-forget).
    void incrMetric("mailboxes_created");

    const baseUrl = getRequestBaseUrl(req);
    // SECURITY TRADEOFF (documented, not fixed): the private inbox link
    // carries the raw access token as ?key=. It leaks via browser history,
    // shoulder-surfing, and screenshots. Mitigations in place:
    // Referrer-Policy: no-referrer on mailbox pages, and the token is
    // rotated on logout/recovery. A single-use exchange flow would be
    // stronger but is out of scope for this change.
    const inboxUrl = `${baseUrl}/inbox/${created.username}?key=${encodeURIComponent(created.accessToken)}`;
    const publicUrl = `${baseUrl}/${created.username}`;

    const maxAgeSeconds = DURATIONS[input.durationKey];
    const usernameLower = created.username.toLowerCase();

    const response = apiOk({
      name: input.name.trim(),
      username: created.username,
      accessToken: created.accessToken,
      recoveryPasscode: created.recoveryPasscode,
      expiresAt: created.expiresAt,
      inboxUrl,
      publicUrl,
    });

    // Set authentication session cookie (§8.2)
    const isLocal = isLocalRequest(req);
    response.cookies.set({
      name: `chithi_s_${usernameLower}`,
      value: created.accessToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !isLocal,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/mailbox/create error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
