import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";
import { getRedis } from "./redis";
import { keys } from "./keys";

export type LimiterBucket =
  | "create"
  | "send"
  | "bottle"
  | "recover_ip"
  | "recover_user"
  | "unlock"
  | "publish"
  | "react"
  | "report"
  | "read"
  | "exchange"
  | "settings"
  | "extend"
  | "music_search";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const hasUpstash =
  Boolean(env.UPSTASH_REDIS_REST_URL) && Boolean(env.UPSTASH_REDIS_REST_TOKEN);

const redisClient = hasUpstash
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ephemeralCache = new Map();

// Instantiate limiters when real Upstash Redis is configured
const limiters: Record<LimiterBucket, Ratelimit | null> = {
  create: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(3, "1 h"),
        prefix: "rl:create",
        ephemeralCache,
        analytics: false,
      })
    : null,

  send: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(8, "10 m"),
        prefix: "rl:send",
        ephemeralCache,
        analytics: false,
      })
    : null,

  bottle: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(3, "1 h"),
        prefix: "rl:bottle",
        ephemeralCache,
        analytics: false,
      })
    : null,

  recover_ip: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(5, "10 m"),
        prefix: "rl:recover:ip",
        ephemeralCache,
        analytics: false,
      })
    : null,

  recover_user: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "rl:recover:user",
        ephemeralCache,
        analytics: false,
      })
    : null,

  unlock: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(10, "10 m"),
        prefix: "rl:unlock",
        ephemeralCache,
        analytics: false,
      })
    : null,

  publish: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(5, "1 h"),
        prefix: "rl:publish",
        ephemeralCache,
        analytics: false,
      })
    : null,

  react: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "rl:react",
        ephemeralCache,
        analytics: false,
      })
    : null,

  report: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "rl:report",
        ephemeralCache,
        analytics: false,
      })
    : null,

  read: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        prefix: "rl:read",
        ephemeralCache,
        analytics: false,
      })
    : null,

  // Credential-verification endpoint (session exchange): 30 / 10m per IP.
  // Tokens are 256-bit (unguessable), but the endpoint is a probing oracle
  // without throttling, so it gets its own bucket.
  exchange: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(30, "10 m"),
        prefix: "rl:exchange",
        ephemeralCache,
        analytics: false,
      })
    : null,

  // Mailbox settings writes (owner-only): generous, just bounds abuse.
  settings: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(20, "1 h"),
        prefix: "rl:settings",
        ephemeralCache,
        analytics: false,
      })
    : null,

  music_search: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(15, "1 m"),
        prefix: "rl:music:search",
        ephemeralCache,
        analytics: false,
      })
    : null,

  // Mailbox expiry extensions (owner-only): lifetime cap is 3, so this is
  // just a bound on write amplification, never a legit-use blocker.
  extend: redisClient
    ? new Ratelimit({
        redis: redisClient,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "rl:extend",
        ephemeralCache,
        analytics: false,
      })
    : null,
};

// Abuse tracking constants (§SEC-04)
const ABUSE_VIOLATION_WINDOW_SECS = 600; // 10 minutes rolling window for violations
const ABUSE_THRESHOLD = 3; // 3 rate-limit violations within window triggers temporary block
const ABUSE_BLOCK_DURATION_SECS = 900; // 15 minutes initial block
const ABUSE_SEVERE_THRESHOLD = 6; // Severe abuse threshold
const ABUSE_SEVERE_BLOCK_DURATION_SECS = 1800; // 30 minutes severe block

/**
 * Checks whether an identifier (hashed IP rateKey) is currently blocked on the Redis abuse blocklist.
 */
export async function checkAbuseBlock(
  identifier: string
): Promise<{ blocked: boolean; reset: number }> {
  try {
    const redis = getRedis();
    const blockKey = keys.abuseBlock(identifier);
    const blockedVal = await redis.get<string | number>(blockKey);
    if (blockedVal !== null && blockedVal !== undefined) {
      const ttlSec = await redis.ttl(blockKey);
      const reset = Date.now() + (ttlSec > 0 ? ttlSec * 1000 : ABUSE_BLOCK_DURATION_SECS * 1000);
      return { blocked: true, reset };
    }
  } catch (err) {
    console.error("[chithi] Error checking abuse blocklist:", err);
  }
  return { blocked: false, reset: 0 };
}

/**
 * Records a rate limit violation against an identifier.
 * Automatically establishes a temporary Redis block if threshold is crossed.
 */
export async function recordAbuseViolation(
  identifier: string
): Promise<{ blocked: boolean; reset: number }> {
  try {
    const redis = getRedis();
    const countKey = keys.abuseCount(identifier);
    const blockKey = keys.abuseBlock(identifier);

    const violations = await redis.incr(countKey);
    if (violations === 1) {
      await redis.expire(countKey, ABUSE_VIOLATION_WINDOW_SECS);
    }

    if (violations >= ABUSE_THRESHOLD) {
      const duration =
        violations >= ABUSE_SEVERE_THRESHOLD
          ? ABUSE_SEVERE_BLOCK_DURATION_SECS
          : ABUSE_BLOCK_DURATION_SECS;

      const reset = Date.now() + duration * 1000;
      await redis.set(blockKey, String(reset), { ex: duration });
      return { blocked: true, reset };
    }
  } catch (err) {
    console.error("[chithi] Error recording abuse violation:", err);
  }
  return { blocked: false, reset: 0 };
}

let hasWarnedDevShim = false;

/**
 * Checks a named rate limit bucket. Fails open on infrastructure errors.
 * Automatically enforces IP abuse blocklist and records repeat violations.
 */
export async function checkRateLimit(
  bucket: LimiterBucket,
  identifier: string
): Promise<RateLimitResult> {
  // 1. Immediately check temporary abuse blocklist before any work
  const abuse = await checkAbuseBlock(identifier);
  if (abuse.blocked) {
    return {
      success: false,
      limit: 0,
      remaining: 0,
      reset: abuse.reset,
    };
  }

  const limiter = limiters[bucket];

  if (!limiter) {
    if (!hasWarnedDevShim) {
      console.warn(
        `[chithi] Dev fallback mode: rate limiting is active in bypass mode (all requests allowed).`
      );
      hasWarnedDevShim = true;
    }
    return {
      success: true,
      limit: 1000,
      remaining: 999,
      reset: Date.now() + 60_000,
    };
  }

  try {
    const result = await limiter.limit(identifier);
    if (!result.success) {
      // Record rate limit violation to track potential abuse
      const abuseResult = await recordAbuseViolation(identifier);
      if (abuseResult.blocked) {
        return {
          success: false,
          limit: result.limit,
          remaining: 0,
          reset: abuseResult.reset,
        };
      }
    }
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error(`[chithi] Rate limiter error on bucket "${bucket}":`, error);
    // Fail open per §10.1
    return {
      success: true,
      limit: 1000,
      remaining: 1000,
      reset: Date.now() + 60_000,
    };
  }
}
