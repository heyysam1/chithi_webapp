import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiOk, ApiErr, ErrorCode, ApiError } from "./types";
import { MAX_JSON_BODY_BYTES } from "./constants";
import { sha256 } from "./crypto";
import { env } from "./env";

export { ApiError };

export function apiOk<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");

  return NextResponse.json(
    { ok: true, data },
    {
      ...init,
      headers,
    }
  );
}

export function apiErr(
  code: ErrorCode,
  message: string,
  status: number,
  details?: Record<string, string[]>,
  extraHeaders?: Record<string, string> | Headers
): NextResponse<ApiErr> {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store");

  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
      },
    },
    {
      status,
      headers,
    }
  );
}

/**
 * Returns standardized rate-limiting response headers (§API-03).
 */
export function rateLimitHeaders(rl: {
  limit: number;
  remaining: number;
  reset: number;
}): Record<string, string> {
  const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
  return {
    "Retry-After": String(retryAfter),
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(rl.reset),
  };
}

/**
 * Extracts the client IP from request headers using the trust-correct source.
 *
 * Proxies *append* the address they saw to `x-forwarded-for`, so the leftmost
 * entry is client-controlled: an attacker can rotate it per request to mint a
 * fresh rate-limit bucket every time. The safe entries are the ones the
 * platform itself wrote. Trust order:
 *
 * 1. `x-real-ip` — the Vercel edge overwrites (never appends to) this header,
 *    so on Vercel it carries the single authoritative client IP.
 * 2. The LAST (rightmost) `x-forwarded-for` entry — appended by the proxy
 *    closest to us (the platform edge). Anything to its left may be spoofed.
 * 3. "unknown" — a self-hosted deployment without a trusted proxy cannot
 *    authenticate the client IP at all; those callers share one bucket
 *    (fail-closed, never a fresh identity per request).
 */
export function getClientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const lastHop = hops[hops.length - 1];
    if (lastHop) {
      return lastHop;
    }
  }

  return "unknown";
}

/**
 * Derives a privacy-preserving rate-limiting key from IP + IP_SALT.
 * Raw IP is never retained. Used exclusively for rate limiters.
 */
export function getRateKey(req: Request): string {
  const ip = getClientIp(req);

  return sha256(`${ip}:${env.IP_SALT}`).slice(0, 32);
}

/**
 * Derives a privacy-preserving viewer hash from IP + User Agent + IP_SALT.
 * Raw IP is never retained. Used strictly for deduplication (reactions, flood guard, bottle pairing).
 */
export function getViewerHash(req: Request): string {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  return sha256(`${ip}:${userAgent}:${env.IP_SALT}`).slice(0, 32);
}

/**
 * Defensive JSON body parser that strictly enforces MAX_JSON_BODY_BYTES
 * before and after parsing, and validates against a Zod schema.
 */
export async function parseJsonBody<TOutput, TInput = unknown>(
  req: Request,
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>
): Promise<TOutput> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_JSON_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE", "errors.payloadTooLarge", 413);
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "errors.validation.invalidJson", 400);
  }

  if (text.length > MAX_JSON_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE", "errors.payloadTooLarge", 413);
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(text);
  } catch {
    throw new ApiError("VALIDATION_FAILED", "errors.validation.invalidJson", 400);
  }

  const result = schema.safeParse(rawJson);
  if (!result.success) {
    const flat = result.error.flatten();
    const details: Record<string, string[]> = {};
    for (const [field, errs] of Object.entries(flat.fieldErrors)) {
      if (Array.isArray(errs) && errs.length > 0) {
        details[field] = errs;
      }
    }
    throw new ApiError("VALIDATION_FAILED", "errors.validation.failed", 400, details);
  }

  return result.data;
}
