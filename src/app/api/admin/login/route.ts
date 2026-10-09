import { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiOk,
  apiErr,
  ApiError,
  getRateKey,
  parseJsonBody,
  rateLimitHeaders,
} from "@/lib/api";
import { checkRateLimit } from "@/lib/ratelimit";
import { env } from "@/lib/env";
import { recoverPermanentMailbox } from "@/lib/mailbox";
import { getOwnerUsernameLower, isAdminConfigured } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AdminLoginSchema = z.object({
  username: z.string().trim().min(1).max(30),
  passcode: z.string().regex(/^\d{6}$/),
});

/**
 * Admin login. Uses the SAME username + 6-digit passcode as the owner's
 * normal mailbox login — no separate admin credential exists.
 *
 * Reuses `recoverPermanentMailbox` for the exact credential verification and
 * session issuance of the normal owner login. The passcode is NEVER rotated
 * (unlike /recover for normal mailboxes); only the access token rotates,
 * exactly like the regular login flow.
 */
export async function POST(req: NextRequest) {
  try {
    const rateKey = getRateKey(req);

    // Brute-force protection: 5 attempts / 10m per IP, 10 / 1h per
    // (username, IP) pair — reuses the /recover buckets with an
    // admin-scoped identifier so the budgets stay separate.
    const rlIp = await checkRateLimit("recover_ip", rateKey);
    if (!rlIp.success) {
      return apiErr(
        "RATE_LIMITED",
        "errors.rateLimited",
        429,
        undefined,
        rateLimitHeaders(rlIp)
      );
    }

    if (!isAdminConfigured()) {
      return apiErr("ADMIN_NOT_CONFIGURED", "errors.forbidden", 403);
    }

    const input = await parseJsonBody(req, AdminLoginSchema);
    const usernameLower = input.username.toLowerCase();

    const rlUser = await checkRateLimit(
      "recover_user",
      `admin_login:${usernameLower}:${rateKey}`
    );
    if (!rlUser.success) {
      return apiErr(
        "RATE_LIMITED",
        "errors.rateLimited",
        429,
        undefined,
        rateLimitHeaders(rlUser)
      );
    }

    // Owner mailbox only.
    if (usernameLower !== getOwnerUsernameLower()) {
      return apiErr("NOT_OWNER_MAILBOX", "errors.forbidden", 403);
    }

    let recovered: { username: string; accessToken: string };
    try {
      // Name is fixed for the permanent mailbox; supply it server-side from
      // env so the login form only needs username + passcode. The passcode
      // itself is still verified timing-safely inside.
      recovered = await recoverPermanentMailbox({
        name: (env.PERMANENT_MAILBOX_NAME || "").trim(),
        username: input.username,
        passcode: input.passcode,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        // Generic: identical response for wrong passcode vs missing record —
        // no credential enumeration.
        return apiErr("INVALID_CREDENTIALS", "errors.recoveryFailed", 401);
      }
      throw error;
    }

    const response = apiOk({ username: recovered.username });

    // Identical session cookie format as every other login in the app.
    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host");
    const isLocal = Boolean(
      host?.includes("localhost") || host?.includes("127.0.0.1")
    );
    response.cookies.set({
      name: `chithi_s_${usernameLower}`,
      value: recovered.accessToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !isLocal,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400,
    });

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErr(error.code, error.messageKey, error.status, error.details);
    }
    console.error("[POST /api/admin/login error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
