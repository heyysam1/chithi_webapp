import { test } from "vitest";
import assert from "node:assert/strict";

import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";
import { createMailbox, cleanupInactiveMailboxes, touchMailboxLogin, GRACE_MS } from "../src/lib/mailbox";
import { sendLetter, listLetters } from "../src/lib/letters";
import { publishLetterToFeed, listFeedItems, reactToFeedItem } from "../src/lib/feed";
import { INBOX_PAGE_SIZE } from "../src/lib/constants";
import { MailboxRecord } from "../src/lib/types";

test("PERF-01: cleanupInactiveMailboxes performs bounded range query on activeIndex", async () => {
  const redis = getRedis();
  const now = Date.now();

  // Create a stale entry in activeIndex (older than cutoff = now - GRACE_MS)
  const staleUser = "stale_perf_user";
  const staleScore = now - GRACE_MS - 10_000;
  await redis.zadd(keys.activeIndex(), { score: staleScore, member: staleUser });
  await redis.set(
    keys.mailbox(staleUser),
    JSON.stringify({
      username: staleUser,
      usernameLower: staleUser,
      name: "Stale",
      expiresAt: staleScore,
    })
  );

  // Create an active entry in activeIndex (recent)
  const activeUser = "active_perf_user";
  await redis.zadd(keys.activeIndex(), { score: now, member: activeUser });
  await redis.set(
    keys.mailbox(activeUser),
    JSON.stringify({
      username: activeUser,
      usernameLower: activeUser,
      name: "Active",
      expiresAt: now + 86400_000,
    })
  );

  const purged = await cleanupInactiveMailboxes();
  assert.ok(purged >= 1, `Expected at least 1 purged mailbox, got ${purged}`);

  // Assert stale user was purged from activeIndex
  const activeIndexMembers = await redis.zrange(keys.activeIndex(), 0, -1);
  assert.ok(!activeIndexMembers.includes(staleUser), "Stale user should have been purged");
  assert.ok(activeIndexMembers.includes(activeUser), "Active user should remain in activeIndex");
});

test("PERF-02: touchMailboxLogin throttles within 5-minute window", async () => {
  const redis = getRedis();
  const now = Date.now();
  const testUser = "throttle_perf_user";

  const initialScore = now - 10 * 60_000; // 10 minutes ago
  await redis.zadd(keys.activeIndex(), { score: initialScore, member: testUser });

  const mailboxRecord: MailboxRecord = {
    name: "Throttle Tester",
    username: testUser,
    usernameLower: testUser,
    accessTokenHash: "hash",
    gender: "unspecified",
    acceptsBottles: true,
    createdAt: initialScore,
    lastLoginAt: now - 60_000, // 1 minute ago (< 5m throttle window)
    expiresAt: now + 86400_000,
    durationKey: "24h",
    letterCount: 0,
    extensionsUsed: 0,
    version: 1,
  };

  // 1. Invoking touchMailboxLogin within 5m window should skip the ZADD write
  await touchMailboxLogin(mailboxRecord);
  const scoreAfterThrottle = await redis.zrange<{ member: string; score: number }>(
    keys.activeIndex(),
    0,
    -1,
    { withScores: true }
  );
  const entry1 = scoreAfterThrottle.find((e) => e.member === testUser);
  assert.equal(entry1?.score, initialScore, "Score should not have been updated due to throttle");

  // 2. Invoking touchMailboxLogin after 5m window should update score
  mailboxRecord.lastLoginAt = now - 6 * 60_000; // 6 minutes ago (> 5m)
  await touchMailboxLogin(mailboxRecord);
  const scoreAfterWrite = await redis.zrange<{ member: string; score: number }>(
    keys.activeIndex(),
    0,
    -1,
    { withScores: true }
  );
  const entry2 = scoreAfterWrite.find((e) => e.member === testUser);
  assert.ok(entry2 && entry2.score >= now, "Score should have been updated after 5m interval");
});

// sendLetter claims its send slot via an atomic Lua script (§COR-01), which the
// InMemoryRedisShim cannot execute. These tests need a real Redis.
test.skipIf(!process.env.UPSTASH_TEST_URL)("PERF-03: listFeedItems fetches reactions via parallel MGET", async () => {
  const redis = getRedis();
  const publisher = "perf_feed_pub";

  // Create mailbox and send a letter to publish
  await createMailbox({
    name: "Feed Pub",
    username: publisher,
    durationKey: "24h",
    gender: "unspecified",
  });

  const { id: letterId } = await sendLetter(
    {
      recipient: publisher,
      body: "Public letter for feed MGET test",
      paper: "parchment",
      stamp: "wax",
      hints: [],
      burnAfterReading: false,
      isAnonymous: true,
      mode: { kind: "none" },
    },
    "viewer_pub_hash"
  );

  const { feedId } = await publishLetterToFeed(publisher, letterId);

  // React to the feed item as viewer1
  const viewerHash = "viewer_hash_perf_123";
  await reactToFeedItem(feedId, "heart", viewerHash);

  // Load feed items for viewer1
  const feedResult = await listFeedItems("latest", null, viewerHash);
  const publishedItem = feedResult.items.find((i) => i.id === feedId);
  assert.ok(publishedItem, "Feed item must exist in latest feed");
  assert.equal(publishedItem.viewerHasReacted, true, "viewerHasReacted must be true for viewer1");

  // Load feed items for a different viewer
  const otherViewerResult = await listFeedItems("latest", null, "viewer_hash_other_456");
  const otherItem = otherViewerResult.items.find((i) => i.id === feedId);
  assert.ok(otherItem, "Feed item must exist in latest feed for other viewer");
  assert.equal(otherItem.viewerHasReacted, false, "viewerHasReacted must be false for other viewer");
});

test.skipIf(!process.env.UPSTASH_TEST_URL)("PERF-04: listLetters pagination and body isolation", async () => {
  const username = "paginated_inbox_user";
  await createMailbox({
    name: "Inbox Tester",
    username,
    durationKey: "24h",
    gender: "unspecified",
  });

  // Seed 25 letters (INBOX_PAGE_SIZE is 20)
  const totalLetters = 25;
  for (let i = 1; i <= totalLetters; i++) {
    await sendLetter(
      {
        recipient: username,
        body: `Confidential letter body content number ${i}`,
        paper: "parchment",
        stamp: "wax",
        hints: [],
        burnAfterReading: false,
        isAnonymous: true,
        mode: { kind: "none" },
      },
      `viewer_sender_${i}`
    );
  }

  // 1. Fetch first page (cursor = 0)
  const page1 = await listLetters(username, 0);
  assert.equal(page1.items.length, INBOX_PAGE_SIZE, `Expected page 1 to have ${INBOX_PAGE_SIZE} items`);
  assert.equal(page1.nextCursor, 20, "Expected nextCursor to be 20");

  // Verify body is never present on any LetterSummary
  for (const item of page1.items) {
    assert.equal(
      (item as any).body,
      undefined,
      "LetterSummary must NEVER contain letter body (§PERF-04)"
    );
  }

  // 2. Fetch second page (cursor = 20)
  const page2 = await listLetters(username, 20);
  assert.equal(page2.items.length, totalLetters - INBOX_PAGE_SIZE, "Expected page 2 to have 5 items");
  assert.equal(page2.nextCursor, null, "Expected nextCursor to be null on last page");

  for (const item of page2.items) {
    assert.equal(
      (item as any).body,
      undefined,
      "LetterSummary must NEVER contain letter body (§PERF-04)"
    );
  }
});
