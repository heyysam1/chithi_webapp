import { NextRequest } from "next/server";
import { SendLetterSchema } from "@/lib/schemas";
import { sendLetter } from "@/lib/letters";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiOk, apiErr, ApiError, getRateKey, getViewerHash, parseJsonBody, rateLimitHeaders } from "@/lib/api";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { hashWithPepper, timingSafeEqual } from "@/lib/crypto";
import { MailboxRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);
    const viewerHash = getViewerHash(req);
    const input = await parseJsonBody(req, SendLetterSchema);

    // Prevent Self-Letter Sending Guard per SEC-02.
    // The guard must cover every credential channel, not just cookies: a
    // mailbox owner authenticating via Authorization: Bearer presents no
    // chithi_s_* cookie, so check the bearer token against the recipient's
    // access token hash as well.
    const recipientLower = input.recipient.toLowerCase();
    const allCookies = req.cookies.getAll();
    const selfCookie = allCookies.find((c) => {
      if (!c.name.startsWith("chithi_s_")) return false;
      const cookieUsername = c.name.slice("chithi_s_".length).toLowerCase();
      return cookieUsername === recipientLower;
    });

    const presentedTokens: string[] = [];
    if (selfCookie?.value) {
      try {
        presentedTokens.push(decodeURIComponent(selfCookie.value.trim()));
      } catch {
        // Malformed cookie value can never be a valid token; ignore it.
      }
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const bearerToken = authHeader.slice(7).trim();
      if (bearerToken) presentedTokens.push(bearerToken);
    }

    if (presentedTokens.length > 0) {
      const redis = getRedis();
      const rawRecipient = await redis.get<string | MailboxRecord>(keys.mailbox(recipientLower));
      if (rawRecipient) {
        const mb: MailboxRecord =
          typeof rawRecipient === "string" ? JSON.parse(rawRecipient) : rawRecipient;
        for (const token of presentedTokens) {
          const incomingHash = hashWithPepper(token);
          if (timingSafeEqual(incomingHash, mb.accessTokenHash)) {
            return apiErr("FORBIDDEN", "errors.cannotSendToSelf", 403);
          }
        }
      }
    }

    // Rate limit: 8 / 10m on rateKey + ":" + recipient (§10.1)
    const rateLimitKey = `${rateKey}:${recipientLower}`;
    const rl = await checkRateLimit("send", rateLimitKey);
    if (!rl.success) {
      return apiErr("RATE_LIMITED", "errors.rateLimited", 429, undefined, rateLimitHeaders(rl));
    }

    const result = await sendLetter(input, viewerHash);
    return apiOk(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/letters/send error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
