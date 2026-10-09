import { test } from "vitest";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { z } from "zod";

import { rateLimitHeaders, ApiError } from "../src/lib/api";
import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";
import { createMailbox, getPublicMailbox } from "../src/lib/mailbox";

// Canonical API Envelope Zod Schema (§6.1, §API-01)
const ErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum([
      "VALIDATION_FAILED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "GONE",
      "LOCKED",
      "RATE_LIMITED",
      "USERNAME_TAKEN",
      "ALREADY_DONE",
      "BOTTLE_NO_MATCH",
      "PAYLOAD_TOO_LARGE",
      "INTERNAL",
    ]),
    message: z.string().regex(/^errors\.[a-zA-Z0-9_.]+$/),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

const SuccessEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
});

const CanonicalEnvelopeSchema = z.union([SuccessEnvelopeSchema, ErrorEnvelopeSchema]);

test("API-01 & API-02: Every API route returns canonical envelope and no-store", async () => {
  // Test suite dynamically tests every API endpoint with minimal requests
  const routesToTest: Array<{
    name: string;
    importPath: string;
    method: "GET" | "POST" | "PATCH";
    url: string;
    body?: any;
    params?: Record<string, string>;
  }> = [
    {
      name: "POST /api/bottle/send (empty body -> 400)",
      importPath: "../src/app/api/bottle/send/route",
      method: "POST",
      url: "http://localhost:3000/api/bottle/send",
      body: {},
    },
    {
      name: "GET /api/cron/cleanup (unauthorized -> 401)",
      importPath: "../src/app/api/cron/cleanup/route",
      method: "GET",
      url: "http://localhost:3000/api/cron/cleanup",
    },
    {
      name: "GET /api/feed (valid public read -> 200)",
      importPath: "../src/app/api/feed/route",
      method: "GET",
      url: "http://localhost:3000/api/feed",
    },
    {
      name: "POST /api/feed/[id]/react (invalid id -> 400)",
      importPath: "../src/app/api/feed/[id]/react/route",
      method: "POST",
      url: "http://localhost:3000/api/feed/nonexistent/react",
      body: { reaction: "heart" },
      params: { id: "nonexistent" },
    },
    {
      name: "GET /api/letters/list (no auth -> 401)",
      importPath: "../src/app/api/letters/list/route",
      method: "GET",
      url: "http://localhost:3000/api/letters/list",
    },
    {
      name: "POST /api/letters/send (empty body -> 400)",
      importPath: "../src/app/api/letters/send/route",
      method: "POST",
      url: "http://localhost:3000/api/letters/send",
      body: {},
    },
    {
      name: "POST /api/letters/[id]/publish (no auth -> 400)",
      importPath: "../src/app/api/letters/[id]/publish/route",
      method: "POST",
      url: "http://localhost:3000/api/letters/ltr_123/publish",
      params: { id: "ltr_123" },
    },
    {
      name: "POST /api/letters/[id]/unlock (no auth -> 400)",
      importPath: "../src/app/api/letters/[id]/unlock/route",
      method: "POST",
      url: "http://localhost:3000/api/letters/ltr_123/unlock",
      params: { id: "ltr_123" },
    },
    {
      name: "GET /api/mailbox/[username] (nonexistent -> 404)",
      importPath: "../src/app/api/mailbox/[username]/route",
      method: "GET",
      url: "http://localhost:3000/api/mailbox/nonexistent_usr_xyz",
      params: { username: "nonexistent_usr_xyz" },
    },
    {
      name: "GET /api/letters/[id] (no username param -> 400)",
      importPath: "../src/app/api/letters/[id]/route",
      method: "GET",
      url: "http://localhost:3000/api/letters/ltr_123",
      params: { id: "ltr_123" },
    },
    {
      name: "POST /api/letters/[id]/react (no username param -> 400)",
      importPath: "../src/app/api/letters/[id]/react/route",
      method: "POST",
      url: "http://localhost:3000/api/letters/ltr_123/react",
      body: { reaction: "heart" },
      params: { id: "ltr_123" },
    },
    {
      name: "POST /api/locale (empty body -> 200, defaults to en)",
      importPath: "../src/app/api/locale/route",
      method: "POST",
      url: "http://localhost:3000/api/locale",
      body: {},
    },
    {
      name: "POST /api/session/logout (empty body -> 200)",
      importPath: "../src/app/api/session/logout/route",
      method: "POST",
      url: "http://localhost:3000/api/session/logout",
      body: {},
    },
    {
      name: "POST /api/mailbox/create (empty body -> 400)",
      importPath: "../src/app/api/mailbox/create/route",
      method: "POST",
      url: "http://localhost:3000/api/mailbox/create",
      body: {},
    },
    {
      name: "GET /api/mailbox/profile (no auth -> 401)",
      importPath: "../src/app/api/mailbox/profile/route",
      method: "GET",
      url: "http://localhost:3000/api/mailbox/profile",
    },
    {
      name: "POST /api/mailbox/recover (empty body -> 400)",
      importPath: "../src/app/api/mailbox/recover/route",
      method: "POST",
      url: "http://localhost:3000/api/mailbox/recover",
      body: {},
    },
    {
      name: "PATCH /api/mailbox/settings (no auth -> 401)",
      importPath: "../src/app/api/mailbox/settings/route",
      method: "PATCH",
      url: "http://localhost:3000/api/mailbox/settings",
      body: { acceptsBottles: true },
    },
    {
      name: "POST /api/mailbox/extend (no auth -> 401)",
      importPath: "../src/app/api/mailbox/extend/route",
      method: "POST",
      url: "http://localhost:3000/api/mailbox/extend?username=ghost",
      body: { durationKey: "24h" },
    },
    {
      name: "POST /api/report (empty body -> 400)",
      importPath: "../src/app/api/report/route",
      method: "POST",
      url: "http://localhost:3000/api/report",
      body: {},
    },
    {
      name: "POST /api/session/exchange (empty body -> 400)",
      importPath: "../src/app/api/session/exchange/route",
      method: "POST",
      url: "http://localhost:3000/api/session/exchange",
      body: {},
    },
  ];

  for (const r of routesToTest) {
    const routeMod = await import(r.importPath);
    const handler = routeMod[r.method];
    assert.ok(typeof handler === "function", `Expected ${r.method} handler in ${r.importPath}`);

    const req = new NextRequest(r.url, {
      method: r.method,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      ...(r.body !== undefined ? { body: JSON.stringify(r.body) } : {}),
    });
    const context = r.params ? { params: Promise.resolve(r.params) } : undefined;

    const res = await handler(req, context);
    assert.ok(res, `Handler for ${r.name} did not return a response`);

    // Verify Cache-Control: no-store
    const cacheControl = res.headers.get("cache-control");
    assert.ok(
      cacheControl && cacheControl.includes("no-store"),
      `Expected Cache-Control: no-store on ${r.name}, got ${cacheControl}`
    );

    // Verify parsed body satisfies CanonicalEnvelopeSchema
    const json = await res.json();
    const parsed = CanonicalEnvelopeSchema.safeParse(json);
    assert.ok(
      parsed.success,
      `Response from ${r.name} does not satisfy canonical envelope: ${JSON.stringify(json)} (error: ${parsed.error})`
    );

    // If error, verify error.message is an i18n key and never prose or leaked stack
    if (!json.ok) {
      assert.ok(
        json.error.message.startsWith("errors."),
        `Error message must be an i18n key starting with 'errors.', got: '${json.error.message}' in ${r.name}`
      );
      assert.equal(
        typeof (json as any).stack,
        "undefined",
        `Stack trace leaked in ${r.name}`
      );
    }
  }
});

test("API-03: rateLimitHeaders returns standard headers with calculated Retry-After", () => {
  const resetTime = Date.now() + 25_000;
  const headers = rateLimitHeaders({
    limit: 10,
    remaining: 0,
    reset: resetTime,
  });

  assert.equal(headers["X-RateLimit-Limit"], "10");
  assert.equal(headers["X-RateLimit-Remaining"], "0");
  assert.equal(headers["X-RateLimit-Reset"], String(resetTime));
  const retryAfterNum = parseInt(headers["Retry-After"] || "0", 10);
  assert.ok(retryAfterNum >= 24 && retryAfterNum <= 26, `Unexpected Retry-After: ${retryAfterNum}`);
});

test("API-04: RedisLike interface does not expose keys() and provides scan()", async () => {
  const redis = getRedis();

  // keys() must not exist (§API-04)
  assert.equal(
    (redis as any).keys,
    undefined,
    "redis.keys must not exist on the Redis abstraction"
  );

  // scan() must exist (§API-04)
  assert.equal(
    typeof (redis as any).scan,
    "function",
    "redis.scan must exist on the Redis abstraction"
  );

  // Test scan() works as expected
  await redis.set("test:scan:1", "val1");
  await redis.set("test:scan:2", "val2");
  const [nextCursor, items] = await (redis as any).scan(0, { match: "test:scan:*" });
  assert.ok(Array.isArray(items), "Expected scan to return array of matched keys");
  assert.ok(items.includes("test:scan:1"));
  assert.ok(items.includes("test:scan:2"));
});

test("API-05: getPublicMailbox collapses 410 into 404 and returns expiresAt", async () => {
  const username = "expired_oracle_user";
  const redis = getRedis();

  // Create an expired mailbox directly in Redis
  const expiredMailbox = {
    username,
    usernameLower: username.toLowerCase(),
    name: "Expired User",
    passcodeHash: "hash",
    passcodeSalt: "salt",
    recoveryKeyHash: "rec_hash",
    acceptsBottles: true,
    createdAt: Date.now() - 100_000,
    expiresAt: Date.now() - 10_000, // Expired 10 seconds ago
  };
  await redis.set(keys.mailbox(username), JSON.stringify(expiredMailbox));

  // 1. Assert getPublicMailbox throws 404 (NOT 410) for expired mailbox
  await assert.rejects(
    async () => {
      await getPublicMailbox(username);
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError, "Expected ApiError instance");
      assert.equal(err.status, 404, "Expected status 404, got " + err.status);
      assert.equal(err.code, "NOT_FOUND", "Expected code NOT_FOUND, got " + err.code);
      assert.equal(err.messageKey, "errors.mailboxNotFound");
      return true;
    }
  );

  // 2. Create a live active mailbox
  const activeUsername = "live_oracle_user";
  await createMailbox({
    username: activeUsername,
    name: "Live User",
    durationKey: "24h",
    gender: "unspecified",
  });

  // Assert getPublicMailbox returns { exists, name, username, acceptsBottles, expiresAt }
  const pubMeta = await getPublicMailbox(activeUsername);
  assert.equal(pubMeta.exists, true);
  assert.equal(pubMeta.username, activeUsername);
  assert.equal(pubMeta.name, "Live User");
  assert.equal(pubMeta.acceptsBottles, true);
  assert.ok(
    typeof pubMeta.expiresAt === "number" && pubMeta.expiresAt > Date.now(),
    "expiresAt must be returned by getPublicMailbox (used by the capsule UI)"
  );
});
