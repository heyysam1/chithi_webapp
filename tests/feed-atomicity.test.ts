import { test } from "vitest";
import assert from "node:assert/strict";

import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";
import { generateFeedId, generateLetterId } from "../src/lib/ids";
import { createMailbox } from "../src/lib/mailbox";
import {
  publishLetterToFeed,
  reactToFeedItem,
  reportContent,
  REPORT_QUARANTINE_THRESHOLD,
} from "../src/lib/feed";
import { FEED_TTL_S } from "../src/lib/constants";
import { ApiError } from "../src/lib/api";
import type { FeedRecord, LetterRecord } from "../src/lib/types";

const NEEDS_REDIS = !process.env.UPSTASH_TEST_URL;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeedRecord(feedId: string): FeedRecord {
  return {
    id: feedId,
    body: "a quiet test letter",
    paper: "parchment",
    stamp: "wax",
    createdAt: Date.now(),
    hearts: 0,
    heartCracks: 0,
    version: 1,
  };
}

async function seedFeedItem(): Promise<string> {
  const redis = getRedis();
  const feedId = generateFeedId();
  const now = Date.now();
  await redis.set(keys.feedItem(feedId), JSON.stringify(makeFeedRecord(feedId)), {
    ex: FEED_TTL_S,
  });
  await redis.zadd(keys.feedIds(), { score: now, member: feedId });
  await redis.zadd(keys.feedTrending(), { score: 0, member: feedId });
  return feedId;
}

async function feedItemPresent(feedId: string): Promise<boolean> {
  const redis = getRedis();
  const [raw, ids, trending] = await Promise.all([
    redis.get(keys.feedItem(feedId)),
    redis.zrange<string>(keys.feedIds(), 0, -1),
    redis.zrange<string>(keys.feedTrending(), 0, -1),
  ]);
  return Boolean(raw) && ids.includes(feedId) && trending.includes(feedId);
}

async function seedLetterForPublish(
  usernameLower: string,
  overrides: Partial<LetterRecord> = {}
): Promise<string> {
  const redis = getRedis();
  const letterId = generateLetterId();
  const letter: LetterRecord = {
    id: letterId,
    recipient: usernameLower,
    body: "publish me",
    paper: "parchment",
    stamp: "wax",
    hints: ["a hint that must not leak"],
    source: "direct",
    createdAt: Date.now(),
    lock: { kind: "none" },
    burnAfterReading: false,
    openedAt: null,
    burnAt: null,
    reaction: null,
    published: false,
    senderName: "sneaky sender",
    scheduledFor: null,
    replyTo: null,
    version: 1,
    ...overrides,
  };
  await redis.set(keys.letter(letterId), JSON.stringify(letter), { ex: 3600 });
  return letterId;
}

// ---------------------------------------------------------------------------
// C-3: distinct-reporter quarantine (runs on the in-memory shim — no Lua)
// ---------------------------------------------------------------------------

test("C-3: one reporter submitting 3 reports does NOT quarantine the item", async () => {
  const feedId = await seedFeedItem();

  await reportContent("feed", feedId, "spam", undefined, "reporter-A");
  await reportContent("feed", feedId, "spam", undefined, "reporter-A");
  await reportContent("feed", feedId, "spam", undefined, "reporter-A");

  assert.equal(
    await feedItemPresent(feedId),
    true,
    "a single reporter must never trigger quarantine, no matter how many times they report"
  );
});

test("C-3: 3 distinct reporters DO quarantine the item", async () => {
  const feedId = await seedFeedItem();

  await reportContent("feed", feedId, "spam", undefined, "reporter-A");
  assert.equal(await feedItemPresent(feedId), true, "1 distinct reporter: still present");

  await reportContent("feed", feedId, "spam", undefined, "reporter-B");
  assert.equal(await feedItemPresent(feedId), true, "2 distinct reporters: still present");

  await reportContent("feed", feedId, "spam", undefined, "reporter-C");
  assert.equal(
    await feedItemPresent(feedId),
    false,
    `item must be quarantined at ${REPORT_QUARANTINE_THRESHOLD} distinct reporters`
  );
});

test("C-3: repeat reports from the same reporter do not inflate the distinct count", async () => {
  const feedId = await seedFeedItem();

  await reportContent("feed", feedId, "spam", undefined, "reporter-A");
  await reportContent("feed", feedId, "spam", undefined, "reporter-A");
  await reportContent("feed", feedId, "spam", undefined, "reporter-B");
  assert.equal(
    await feedItemPresent(feedId),
    true,
    "A+A+B is only 2 distinct reporters: still present"
  );

  await reportContent("feed", feedId, "spam", undefined, "reporter-C");
  assert.equal(await feedItemPresent(feedId), false, "A+A+B+C quarantines");
});

test("C-3: legacy calls without a reporter identity keep the old counter behavior", async () => {
  const feedId = await seedFeedItem();

  // No reporterHash supplied -> each call counts (previous plain-counter semantics).
  await reportContent("feed", feedId, "spam");
  await reportContent("feed", feedId, "spam");
  assert.equal(await feedItemPresent(feedId), true, "2 unattributed reports: still present");

  await reportContent("feed", feedId, "spam");
  assert.equal(await feedItemPresent(feedId), false, "3 unattributed reports: quarantined");
});

test("C-3: letter reports are counted but never quarantine (unchanged behavior)", async () => {
  const redis = getRedis();
  const letterId = generateLetterId();

  await reportContent("letter", letterId, "spam", undefined, "reporter-A");
  await reportContent("letter", letterId, "spam", undefined, "reporter-B");
  await reportContent("letter", letterId, "spam", undefined, "reporter-C");

  const report = await redis.hgetall<Record<string, unknown>>(keys.report("letter", letterId));
  assert.equal(Number(report?.["distinct"]), 3, "distinct reporters are still tracked");
  // No quarantine path exists for letters — nothing to delete, just no crash.
});

// ---------------------------------------------------------------------------
// Lua-atomic paths: require a real Redis (skipped on the shim, like COR-01)
// ---------------------------------------------------------------------------

test.skipIf(NEEDS_REDIS)(
  "H-6: concurrent publishes of the same letter yield exactly one feed item",
  async () => {
    const redis = getRedis();
    const username = `pubtest-${generateFeedId().slice(0, 8)}`.toLowerCase();
    await createMailbox({
      name: "Pub Test",
      username,
      durationKey: "24h",
      gender: "unspecified",
    });
    const letterId = await seedLetterForPublish(username);

    const results = await Promise.allSettled([
      publishLetterToFeed(username, letterId),
      publishLetterToFeed(username, letterId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "exactly one publish must succeed");
    assert.equal(rejected.length, 1, "exactly one publish must fail");
    const err = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(err instanceof ApiError, "loser fails with ApiError");
    assert.equal(err.code, "ALREADY_DONE");
    assert.equal(err.status, 409);

    // The letter is marked published and only the winner's feed item exists.
    const raw = await redis.get<string>(keys.letter(letterId));
    const letter: LetterRecord = JSON.parse(raw!);
    assert.equal(letter.published, true);

    const winnerFeedId = (fulfilled[0] as PromiseFulfilledResult<{ feedId: string }>).value
      .feedId;
    assert.equal(await feedItemPresent(winnerFeedId), true);
  }
);

test.skipIf(NEEDS_REDIS)(
  "H-6: sequential double publish still returns ALREADY_DONE (409)",
  async () => {
    const username = `pubseq-${generateFeedId().slice(0, 8)}`.toLowerCase();
    await createMailbox({
      name: "Pub Seq",
      username,
      durationKey: "24h",
      gender: "unspecified",
    });
    const letterId = await seedLetterForPublish(username);

    await publishLetterToFeed(username, letterId);
    await assert.rejects(publishLetterToFeed(username, letterId), (err: unknown) => {
      return err instanceof ApiError && err.code === "ALREADY_DONE" && err.status === 409;
    });
  }
);

test.skipIf(NEEDS_REDIS)(
  "H-7: concurrent reactions from distinct viewers lose no increments",
  async () => {
    const redis = getRedis();
    const feedId = await seedFeedItem();

    const viewers = ["v1", "v2", "v3", "v4", "v5"];
    const results = await Promise.all(
      viewers.map((v) => reactToFeedItem(feedId, "heart", v))
    );
    for (const r of results) {
      assert.equal(r.hearts + r.heartCracks >= 1, true);
    }

    const raw = await redis.get<string>(keys.feedItem(feedId));
    const item: FeedRecord = JSON.parse(raw!);
    assert.equal(item.hearts, 5, "all 5 concurrent hearts must be counted");
    assert.equal(item.heartCracks, 0);

    // Same viewer reacting twice still dedups.
    await assert.rejects(reactToFeedItem(feedId, "heart", "v1"), (err: unknown) => {
      return err instanceof ApiError && err.code === "ALREADY_DONE" && err.status === 409;
    });
  }
);

test.skipIf(NEEDS_REDIS)(
  "M-3: reacting to a nonexistent item throws NOT_FOUND and plants no dedup key",
  async () => {
    const redis = getRedis();
    const ghostId = `ghost-${generateFeedId()}`;

    await assert.rejects(reactToFeedItem(ghostId, "heart", "viewer-x"), (err: unknown) => {
      return err instanceof ApiError && err.code === "NOT_FOUND" && err.status === 404;
    });

    assert.equal(
      await redis.get(keys.feedReactionDedup(ghostId, "viewer-x")),
      null,
      "no dedup key may be planted for a nonexistent item"
    );
  }
);

test.skipIf(NEEDS_REDIS)(
  "PII: published feed record strips recipient, hints, locks and sender name",
  async () => {
    const redis = getRedis();
    const username = `piitest-${generateFeedId().slice(0, 8)}`.toLowerCase();
    await createMailbox({
      name: "PII Test",
      username,
      durationKey: "24h",
      gender: "unspecified",
    });
    const letterId = await seedLetterForPublish(username, {
      body: "secret body",
      hints: ["hint one", "hint two"],
      lock: { kind: "capsule", unlockAt: Date.now() - 60_000 },
      senderName: "do not leak me",
    });

    const { feedId } = await publishLetterToFeed(username, letterId);

    const raw = await redis.get<string>(keys.feedItem(feedId));
    assert.ok(raw, "feed item must exist");
    const item = JSON.parse(raw!) as Record<string, unknown>;

    assert.deepEqual(
      Object.keys(item).sort(),
      ["body", "createdAt", "heartCracks", "hearts", "id", "paper", "stamp", "version"].sort(),
      "feed record must contain exactly the stripped field set"
    );
    assert.equal(item["body"], "secret body");
    assert.equal(item["id"], feedId);
    assert.notEqual(item["id"], letterId, "feed id must be unlinkable to the letter id");
  }
);
