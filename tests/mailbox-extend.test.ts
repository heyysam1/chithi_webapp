import { test } from "vitest";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";
import { createMailbox, extendMailboxExpiry, getMailbox } from "../src/lib/mailbox";
import {
  EXTEND_DURATIONS,
  MAX_EXTENSIONS_PER_MAILBOX,
  PLATFORM_MAX_LIFETIME_S,
} from "../src/lib/constants";
import { TTL_GRACE_S } from "../src/lib/mailbox";
import { ExtendMailboxSchema } from "../src/lib/schemas";
import { ApiError } from "../src/lib/api";
import { POST as extendPost } from "../src/app/api/mailbox/extend/route";
import type { ExtendDurationKey, MailboxRecord } from "../src/lib/types";

// Unique usernames per test: the Redis shim is a process-wide singleton.
let counter = 0;
const uname = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${counter++}`;

// Lua-backed tests need a real Redis; the in-memory shim throws on eval().
const hasRealRedis = Boolean(process.env.UPSTASH_TEST_URL);
const luaTest = hasRealRedis ? test : test.skip;

// ---------------------------------------------------------------------------
// Pure config / schema checks (run everywhere, no Redis needed)
// ---------------------------------------------------------------------------

test("extend config: durations, lifetime cap, platform ceiling", () => {
  assert.equal(EXTEND_DURATIONS["24h"], 86400);
  assert.equal(EXTEND_DURATIONS["3d"], 259200);
  assert.equal(EXTEND_DURATIONS["5d"], 432000);
  assert.equal(EXTEND_DURATIONS["7d"], 604800);
  assert.equal(Object.keys(EXTEND_DURATIONS).length, 4);
  assert.equal(MAX_EXTENSIONS_PER_MAILBOX, 3);
  assert.equal(PLATFORM_MAX_LIFETIME_S, 7 * 86400);
});

test("ExtendMailboxSchema: accepts the 4 extend durations", () => {
  for (const k of ["24h", "3d", "5d", "7d"] as const) {
    const parsed = ExtendMailboxSchema.safeParse({ durationKey: k });
    assert.equal(parsed.success, true, `expected ${k} to parse`);
  }
});

test("ExtendMailboxSchema: rejects creation durations and junk", () => {
  for (const bad of ["12h", "30d", "", "24H", 123, null]) {
    const parsed = ExtendMailboxSchema.safeParse({ durationKey: bad });
    assert.equal(parsed.success, false, `expected ${String(bad)} to fail`);
  }
  // Strict: unknown fields rejected
  const extra = ExtendMailboxSchema.safeParse({ durationKey: "24h", username: "x" });
  assert.equal(extra.success, false);
});

// ---------------------------------------------------------------------------
// Route-level: auth + validation (no Lua touched — safe on the shim)
// ---------------------------------------------------------------------------

function extendRequest(username: string, token: string | null, body: unknown): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new NextRequest(
    `http://localhost/api/mailbox/extend?username=${encodeURIComponent(username)}`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );
}

test("POST /api/mailbox/extend without auth -> 401", async () => {
  const res = await extendPost(extendRequest("ghost", null, { durationKey: "24h" }));
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "UNAUTHORIZED");
});

test("POST /api/mailbox/extend without username -> 400", async () => {
  const req = new NextRequest("http://localhost/api/mailbox/extend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ durationKey: "24h" }),
  });
  const res = await extendPost(req);
  assert.equal(res.status, 400);
});

test("POST /api/mailbox/extend with invalid durationKey -> 400", async () => {
  const redis = getRedis();
  void redis;
  const username = uname("extendbadbody");
  const created = await createMailbox({
    name: "Body Tester",
    username,
    durationKey: "12h",
    gender: "unspecified",
  });
  const res = await extendPost(extendRequest(username, created.accessToken, { durationKey: "12h" }));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "VALIDATION_FAILED");
});

// ---------------------------------------------------------------------------
// Lua-backed behavior (needs real Redis)
// ---------------------------------------------------------------------------

function seedMailboxRecord(overrides: Partial<MailboxRecord> & { usernameLower: string }): MailboxRecord {
  const now = Date.now();
  const { usernameLower, ...rest } = overrides;
  return {
    name: "Extend Tester",
    username: usernameLower,
    usernameLower,
    accessTokenHash: "hash",
    gender: "unspecified",
    acceptsBottles: false,
    createdAt: now,
    lastLoginAt: now,
    expiresAt: now + 12 * 3600_000,
    durationKey: "12h",
    letterCount: 0,
    extensionsUsed: 0,
    version: 1,
    ...rest,
  };
}

async function writeMailbox(record: MailboxRecord): Promise<void> {
  const redis = getRedis();
  const u = record.usernameLower;
  const ttl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  await redis.set(keys.mailbox(u), JSON.stringify(record), { ex: ttl + TTL_GRACE_S });
}

luaTest("happy path: expiry moves forward, counter increments, TTLs refresh", async () => {
  const redis = getRedis();
  const username = uname("extendhappy");
  const u = username.toLowerCase();
  const now = Date.now();
  const record = seedMailboxRecord({ usernameLower: u });
  const oldExpiresAt = record.expiresAt;
  await writeMailbox(record);

  // Seed one plain letter with a short TTL to prove TTL refresh.
  const letterId = `ltr_ext_${u}`;
  await redis.set(
    keys.letter(letterId),
    JSON.stringify({
      id: letterId,
      recipient: u,
      body: "keep me",
      paper: "parchment",
      stamp: "wax",
      hints: [],
      source: "direct",
      createdAt: now,
      lock: { kind: "none" },
      burnAfterReading: false,
      openedAt: null,
      burnAt: null,
      reaction: null,
      published: false,
      senderName: null,
      version: 1,
    }),
    { ex: 60 }
  );
  await redis.zadd(keys.mailboxLetters(u), { score: now, member: letterId });

  const res = await extendMailboxExpiry(record, EXTEND_DURATIONS["24h"]);

  assert.ok(Math.abs(res.expiresAt - (oldExpiresAt + 86400_000)) < 5000);
  assert.equal(res.extensionsUsed, 1);
  assert.equal(res.extensionsRemaining, 2);

  const stored = await getMailbox(u);
  assert.ok(stored);
  assert.equal(stored!.expiresAt, res.expiresAt);
  assert.equal(stored!.extensionsUsed, 1);

  // Mailbox-scoped keys now live until the new expiry.
  const expectedTtl = Math.ceil((res.expiresAt - Date.now()) / 1000);
  const letterTtl = await redis.ttl(keys.letter(letterId));
  assert.ok(
    Math.abs(letterTtl - expectedTtl) <= 5,
    `letter TTL ${letterTtl} should track new expiry ${expectedTtl}`
  );
  const zsetTtl = await redis.ttl(keys.mailboxLetters(u));
  assert.ok(Math.abs(zsetTtl - expectedTtl) <= 5);
});

luaTest("burn letters keep their burn deadline (never lengthened)", async () => {
  const redis = getRedis();
  const username = uname("extendburn");
  const u = username.toLowerCase();
  const now = Date.now();
  await writeMailbox(seedMailboxRecord({ usernameLower: u }));

  const letterId = `ltr_burn_${u}`;
  const burnAt = now + 30_000;
  await redis.set(
    keys.letter(letterId),
    JSON.stringify({
      id: letterId,
      recipient: u,
      body: "burn me soon",
      paper: "parchment",
      stamp: "wax",
      hints: [],
      source: "direct",
      createdAt: now,
      lock: { kind: "none" },
      burnAfterReading: true,
      openedAt: now,
      burnAt,
      reaction: null,
      published: false,
      senderName: null,
      version: 1,
    }),
    { ex: 60 }
  );
  await redis.zadd(keys.mailboxLetters(u), { score: now, member: letterId });

  await extendMailboxExpiry(await getMailbox(u) as MailboxRecord, EXTEND_DURATIONS["7d"]);

  const ttl = await redis.ttl(keys.letter(letterId));
  assert.ok(ttl > 0 && ttl <= 31, `burn letter TTL ${ttl} must not exceed burn deadline`);
});

luaTest("lifetime cap: 3 extensions allowed, 4th rejected", async () => {
  const username = uname("extendcap");
  const u = username.toLowerCase();
  const record = seedMailboxRecord({ usernameLower: u });
  await writeMailbox(record);

  for (let i = 1; i <= 3; i++) {
    const res = await extendMailboxExpiry(record, EXTEND_DURATIONS["24h"]);
    assert.equal(res.extensionsUsed, i);
    record.expiresAt = res.expiresAt;
    record.extensionsUsed = res.extensionsUsed;
  }

  await assert.rejects(
    extendMailboxExpiry(record, EXTEND_DURATIONS["24h"]),
    (err: unknown) =>
      err instanceof ApiError &&
      err.code === "EXTENSIONS_EXHAUSTED" &&
      err.status === 400
  );
});

luaTest("concurrent extends cannot exceed the lifetime cap", async () => {
  const username = uname("extendrace");
  const u = username.toLowerCase();
  const record = seedMailboxRecord({ usernameLower: u, extensionsUsed: 2 });
  await writeMailbox(record);

  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, () => extendMailboxExpiry(record, EXTEND_DURATIONS["24h"]))
  );
  const ok = attempts.filter((a) => a.status === "fulfilled").length;
  const exhausted = attempts.filter(
    (a) =>
      a.status === "rejected" &&
      a.reason instanceof ApiError &&
      a.reason.code === "EXTENSIONS_EXHAUSTED"
  ).length;

  assert.equal(ok, 1, "exactly one concurrent extend should win the last slot");
  assert.equal(exhausted, 4);

  const stored = await getMailbox(u);
  assert.equal(stored!.extensionsUsed, 3);
});

luaTest("7-day-from-creation ceiling: capped then MAX_EXPIRY_REACHED", async () => {
  const username = uname("extendceil");
  const u = username.toLowerCase();
  const now = Date.now();
  const createdAt = now - Math.round(6.5 * 86400_000);
  const record = seedMailboxRecord({
    usernameLower: u,
    createdAt,
    expiresAt: now + 3600_000,
  });
  await writeMailbox(record);

  const res = await extendMailboxExpiry(record, EXTEND_DURATIONS["3d"]);
  const ceiling = createdAt + PLATFORM_MAX_LIFETIME_S * 1000;
  assert.ok(Math.abs(res.expiresAt - ceiling) < 5000);

  record.expiresAt = res.expiresAt;
  record.extensionsUsed = res.extensionsUsed;
  await assert.rejects(
    extendMailboxExpiry(record, EXTEND_DURATIONS["24h"]),
    (err: unknown) =>
      err instanceof ApiError && err.code === "MAX_EXPIRY_REACHED" && err.status === 400
  );
});

luaTest("permanent mailboxes are rejected", async () => {
  const username = uname("extendperm");
  const u = username.toLowerCase();
  const record = seedMailboxRecord({ usernameLower: u, isPermanent: true });
  await writeMailbox(record);

  await assert.rejects(
    extendMailboxExpiry(record, EXTEND_DURATIONS["24h"]),
    (err: unknown) =>
      err instanceof ApiError && err.code === "PERMANENT_MAILBOX" && err.status === 400
  );
});

luaTest("expired mailboxes are rejected with GONE", async () => {
  const username = uname("extendgone");
  const u = username.toLowerCase();
  const now = Date.now();
  const record = seedMailboxRecord({
    usernameLower: u,
    createdAt: now - 2 * 86400_000,
    expiresAt: now - 1000,
  });
  // Write raw (getMailbox would return null for expired).
  const redis = getRedis();
  await redis.set(keys.mailbox(u), JSON.stringify(record), { ex: 60 });

  await assert.rejects(
    extendMailboxExpiry(record, EXTEND_DURATIONS["24h"]),
    (err: unknown) => err instanceof ApiError && err.code === "GONE" && err.status === 410
  );
});

luaTest("route happy path returns new expiry and remaining count", async () => {
  const username = uname("extendroute");
  const created = await createMailbox({
    name: "Route Tester",
    username,
    durationKey: "12h",
    gender: "unspecified",
  });

  const res = await extendPost(
    extendRequest(username, created.accessToken, { durationKey: "24h" satisfies ExtendDurationKey })
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(Math.abs(json.data.expiresAt - (created.expiresAt + 86400_000)) < 5000);
  assert.equal(json.data.extensionsRemaining, 2);
});
