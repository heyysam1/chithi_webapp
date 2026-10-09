import { FeedRecord } from "./types";
import { FEED_PAGE_SIZE, FEED_TTL_S } from "./constants";
import { keys } from "./keys";
import { getRedis } from "./redis";
import { generateFeedId } from "./ids";
import { ApiError } from "./api";
import { getMailbox, keyTtlSeconds } from "./mailbox";

export interface FeedItemWithViewer extends FeedRecord {
  viewerHasReacted: boolean;
}

/**
 * Number of *distinct* reporters required before a feed item is auto-quarantined (§7.2).
 */
export const REPORT_QUARANTINE_THRESHOLD = 3;

/**
 * How long report records are retained.
 */
const REPORT_RETENTION_S = 7 * 86400;

/**
 * Atomic feed publish: the letter read, guard checks, feed-item creation and
 * the `published` flag write all happen inside one Lua script, so two
 * concurrent publish requests cannot both mint a feed item for the same
 * letter (H-6). Error statuses mirror the previous JS implementation exactly.
 */
const FEED_PUBLISH_SCRIPT = `
-- KEYS[1]: letter key (ltr:{id})
-- KEYS[2]: feed item key (feed:{feedId})
-- KEYS[3]: feed:ids zset
-- KEYS[4]: feed:trending zset
-- ARGV[1]: usernameLower (recipient check)
-- ARGV[2]: now in ms (capsule check, feed createdAt, zset score)
-- ARGV[3]: feed item TTL seconds
-- ARGV[4]: feedId (unlinkable public id)
-- ARGV[5]: letter key TTL seconds
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ status = 'NOT_FOUND' })
end

local letter = cjson.decode(raw)

if letter.recipient ~= ARGV[1] then
  return cjson.encode({ status = 'FORBIDDEN' })
end

if letter.published then
  return cjson.encode({ status = 'ALREADY_PUBLISHED' })
end

if letter.burnAfterReading then
  return cjson.encode({ status = 'FORBIDDEN_BURN' })
end

if letter.lock ~= nil and letter.lock.kind == 'capsule' and tonumber(ARGV[2]) < tonumber(letter.lock.unlockAt) then
  return cjson.encode({ status = 'LOCKED_CAPSULE' })
end

if letter.lock ~= nil and letter.lock.kind == 'riddle' and letter.lock.solvedAt == nil then
  return cjson.encode({ status = 'LOCKED_RIDDLE' })
end

letter.published = true

-- Build the public feed record from the letter, STRIPPING recipient, hints,
-- locks and sender name (§5.4). The unlinkable feedId comes from ARGV[4].
local feedRecord = {
  id = ARGV[4],
  body = letter.body,
  paper = letter.paper,
  stamp = letter.stamp,
  createdAt = tonumber(ARGV[2]),
  hearts = 0,
  heartCracks = 0,
  version = 1,
}
redis.call('SET', KEYS[2], cjson.encode(feedRecord), 'EX', tonumber(ARGV[3]))
redis.call('ZADD', KEYS[3], tonumber(ARGV[2]), ARGV[4])
redis.call('ZADD', KEYS[4], 0, ARGV[4])
redis.call('SET', KEYS[1], cjson.encode(letter), 'EX', tonumber(ARGV[5]))

return cjson.encode({ status = 'OK' })
`;

/**
 * Atomic feed reaction: existence check, per-viewer dedup (SET NX) and the
 * counter increment all happen inside one Lua script. This fixes the racy
 * read-modify-write that lost concurrent increments (H-7), stops planting
 * dedup keys for nonexistent items (M-3, existence is checked first), and
 * guards the TTL rewrite against TTL-less keys (M-4).
 */
const FEED_REACT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ status = 'NOT_FOUND' })
end

local acquired = redis.call('SET', KEYS[2], '1', 'NX', 'EX', tonumber(ARGV[3]))
if not acquired then
  return cjson.encode({ status = 'ALREADY_DONE' })
end

local item = cjson.decode(raw)
if ARGV[1] == 'heart' then
  item.hearts = item.hearts + 1
else
  item.heartCracks = item.heartCracks + 1
end

local ttl = tonumber(redis.call('TTL', KEYS[1]))
if ttl == nil or ttl < 0 then
  ttl = tonumber(ARGV[4])
end

redis.call('SET', KEYS[1], cjson.encode(item), 'EX', ttl)
redis.call('ZADD', KEYS[3], item.hearts + item.heartCracks, ARGV[2])

return cjson.encode({ status = 'OK', hearts = item.hearts, heartCracks = item.heartCracks })
`;

export async function publishLetterToFeed(
  usernameLower: string,
  letterId: string
): Promise<{ feedId: string }> {
  const redis = getRedis();

  // Unlinkable feed ID, minted up front so the atomic script can reference it.
  const feedId = generateFeedId();
  const now = Date.now();

  const mailbox = await getMailbox(usernameLower);
  if (!mailbox) {
    throw new ApiError("GONE", "errors.mailboxExpired", 410);
  }
  const ttl = keyTtlSeconds(mailbox);

  // All guard checks, the feed-item creation and the `published` flag write
  // run atomically inside FEED_PUBLISH_SCRIPT, so concurrent publishes of the
  // same letter cannot both succeed (H-6). The script builds the stripped
  // feed record (§5.4) from the canonical letter data it guarded on.
  const resRaw = await redis.eval<string>(
    FEED_PUBLISH_SCRIPT,
    [
      keys.letter(letterId),
      keys.feedItem(feedId),
      keys.feedIds(),
      keys.feedTrending(),
    ],
    [usernameLower, now, FEED_TTL_S, feedId, ttl]
  );

  const res: { status: string } =
    typeof resRaw === "string" ? JSON.parse(resRaw) : resRaw;

  switch (res.status) {
    case "OK":
      return { feedId };
    case "ALREADY_PUBLISHED":
      throw new ApiError("ALREADY_DONE", "errors.alreadyPublished", 409);
    case "FORBIDDEN":
      throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
    case "FORBIDDEN_BURN":
      throw new ApiError("FORBIDDEN", "errors.cannotPublishBurnLetter", 403);
    case "LOCKED_CAPSULE":
      throw new ApiError("LOCKED", "errors.letterLockedCapsule", 423);
    case "LOCKED_RIDDLE":
      throw new ApiError("LOCKED", "errors.letterLockedRiddle", 423);
    case "NOT_FOUND":
    default:
      throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
  }
}

export async function pruneExpiredFeedItems(): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff48h = now - FEED_TTL_S * 1000;
  let totalPruned = 0;

  // Read expired IDs before deleting them so both indexes can be cleaned symmetrically (§COR-09)
  const expired = await redis.zrange(keys.feedIds(), 0, cutoff48h, { byScore: true });
  if (expired.length > 0) {
    // Chunk removal at 500 IDs per pipeline so one sweep does not exceed time budget
    for (let i = 0; i < expired.length; i += 500) {
      const chunk = expired.slice(i, i + 500);
      const p = redis.pipeline();
      p.zrem(keys.feedIds(), ...chunk);
      p.zrem(keys.feedTrending(), ...chunk);
      for (const id of chunk) {
        p.del(keys.feedItem(id));
      }
      await p.exec();
      totalPruned += chunk.length;
    }
  }

  return totalPruned;
}

export async function listFeedItems(
  tab: "trending" | "latest",
  cursorString: string | null = null,
  viewerHash: string
): Promise<{ items: FeedItemWithViewer[]; nextCursor: string | null }> {
  const redis = getRedis();

  let feedIds: string[] = [];
  let nextCursor: string | null = null;

  if (tab === "latest") {
    let offset = 0;
    if (cursorString) {
      const parts = cursorString.split(":");
      if (parts[0] !== "latest") {
        throw new ApiError("VALIDATION_FAILED", "errors.validation.invalidCursor", 400);
      }
      offset = parseInt(parts[1] || "0", 10) || 0;
    }

    const start = offset;
    const stop = offset + FEED_PAGE_SIZE - 1;
    feedIds = await redis.zrange(keys.feedIds(), start, stop, { rev: true });

    if (feedIds.length === FEED_PAGE_SIZE) {
      nextCursor = `latest:${offset + FEED_PAGE_SIZE}`;
    }
  } else {
    // trending tab: paginate by (score, member) (§COR-08)
    let minScoreBound: number | string = "+inf";
    let lastSeenMember: string | null = null;

    if (cursorString) {
      const parts = cursorString.split(":");
      if (parts[0] !== "trending") {
        throw new ApiError("VALIDATION_FAILED", "errors.validation.invalidCursor", 400);
      }
      const scoreVal = parts[1];
      lastSeenMember = parts[2] || null;
      if (scoreVal !== undefined) {
        minScoreBound = Number(scoreVal);
      }
    }

    // Fetch entries with scores
    const rawEntries = await redis.zrange<any>(
      keys.feedTrending(),
      minScoreBound === "+inf" ? "+inf" : minScoreBound,
      "-inf",
      {
        byScore: true,
        rev: true,
        withScores: true,
        offset: 0,
        count: FEED_PAGE_SIZE + 50,
      }
    );

    // Normalize entries: Upstash Redis returns [member, score, member, score, ...]
    // whereas InMemoryRedisShim returns [{ member, score }, ...]
    const parsedEntries: Array<{ member: string; score: number }> = [];
    if (Array.isArray(rawEntries)) {
      if (
        rawEntries.length > 0 &&
        typeof rawEntries[0] === "object" &&
        rawEntries[0] !== null &&
        "member" in rawEntries[0]
      ) {
        parsedEntries.push(...(rawEntries as unknown as Array<{ member: string; score: number }>));
      } else {
        for (let i = 0; i < rawEntries.length; i += 2) {
          const member = String(rawEntries[i]);
          const score = Number(rawEntries[i + 1]);
          if (member && !isNaN(score)) {
            parsedEntries.push({ member, score });
          }
        }
      }
    }

    let startIndex = 0;
    if (lastSeenMember && minScoreBound !== "+inf") {
      const idx = parsedEntries.findIndex(
        (e) => e.member === lastSeenMember && e.score === Number(minScoreBound)
      );
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const pageEntries = parsedEntries.slice(startIndex, startIndex + FEED_PAGE_SIZE);
    feedIds = pageEntries.map((e) => e.member);

    if (pageEntries.length === FEED_PAGE_SIZE) {
      const last = pageEntries[pageEntries.length - 1]!;
      nextCursor = `trending:${last.score}:${last.member}`;
    }
  }

  if (!feedIds || feedIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  // Issue parallel MGET for item bodies and reaction dedup keys (§PERF-03)
  const itemKeys = feedIds.map((id) => keys.feedItem(id));
  const dedupKeys = feedIds.map((id) => keys.feedReactionDedup(id, viewerHash));

  const [rawItems, rawDedup] = await Promise.all([
    redis.mget<unknown[]>(...itemKeys),
    redis.mget<unknown[]>(...dedupKeys),
  ]);

  const items: FeedItemWithViewer[] = [];
  const ghostIds: string[] = [];

  for (let i = 0; i < feedIds.length; i++) {
    const id = feedIds[i];
    const raw = rawItems[i];

    if (!id || !raw) {
      if (id) ghostIds.push(id);
      continue;
    }

    const item: FeedRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
    const hasReacted = Boolean(rawDedup && rawDedup[i]);

    items.push({
      ...item,
      viewerHasReacted: hasReacted,
    });
  }

  // Cheap ghost-prune on read
  if (ghostIds.length > 0) {
    const pipeline = redis.pipeline();
    pipeline.zrem(keys.feedIds(), ...ghostIds);
    pipeline.zrem(keys.feedTrending(), ...ghostIds);
    pipeline.exec().catch((e) => console.error("Feed ghost prune error:", e));
  }

  return { items, nextCursor };
}

export async function reactToFeedItem(
  feedId: string,
  reaction: "heart" | "heartCrack",
  viewerHash: string
): Promise<{ hearts: number; heartCracks: number }> {
  const redis = getRedis();

  // Existence check, per-viewer dedup and the counter increment all run
  // atomically inside FEED_REACT_SCRIPT: no lost increments under
  // concurrency (H-7), no dedup key is planted for nonexistent items (M-3),
  // and the TTL rewrite is guarded against TTL-less keys (M-4).
  const resRaw = await redis.eval<string>(
    FEED_REACT_SCRIPT,
    [
      keys.feedItem(feedId),
      keys.feedReactionDedup(feedId, viewerHash),
      keys.feedTrending(),
    ],
    [reaction, feedId, FEED_TTL_S, FEED_TTL_S]
  );

  const res: { status: string; hearts?: number; heartCracks?: number } =
    typeof resRaw === "string" ? JSON.parse(resRaw) : resRaw;

  if (res.status === "NOT_FOUND") {
    throw new ApiError("NOT_FOUND", "errors.feedItemNotFound", 404);
  }
  if (res.status === "ALREADY_DONE") {
    throw new ApiError("ALREADY_DONE", "errors.alreadyReacted", 409);
  }
  return { hearts: res.hearts ?? 0, heartCracks: res.heartCracks ?? 0 };
}

export async function reportContent(
  targetType: "letter" | "feed",
  targetId: string,
  _reason: string,
  _note?: string,
  reporterHash?: string
): Promise<{ reported: true }> {
  const redis = getRedis();
  const reportKey = keys.report(targetType, targetId);

  // Distinct-reporter accounting (C-3): every reporter identity gets its own
  // hash field, incremented atomically. Only the FIRST report from a given
  // identity bumps the "distinct" counter, so a single actor can no longer
  // reach the quarantine threshold by reporting repeatedly.
  //
  // Callers that cannot attribute a reporter identity fall back to a
  // per-call unique field, which preserves the old plain-counter behavior
  // for those legacy call paths. The report route should pass
  // getViewerHash(req) here so the protection is effective in production.
  const reporterField = reporterHash
    ? `r:${reporterHash}`
    : `r:anon:${generateFeedId()}`;

  const reporterSeen = await redis.hincrby(reportKey, reporterField, 1);
  await Promise.all([
    redis.hincrby(reportKey, "count", 1),
    redis.expire(reportKey, REPORT_RETENTION_S),
  ]);

  // HINCRBY is atomic, so exactly one call per reporter identity observes
  // the 1 -> "first sighting" transition; the "distinct" counter therefore
  // counts each identity once even under concurrency.
  if (reporterSeen === 1) {
    const distinct = await redis.hincrby(reportKey, "distinct", 1);

    // Auto-quarantine: at REPORT_QUARANTINE_THRESHOLD *distinct* reports on
    // a feed item, remove it immediately (§7.2). The removal pipeline is
    // idempotent, so reporters crossing the threshold concurrently cannot
    // corrupt state — the item simply ends up deleted exactly once.
    if (targetType === "feed" && distinct >= REPORT_QUARANTINE_THRESHOLD) {
      console.warn(
        `[chithi moderation] Quarantining feed item "${targetId}" after ${distinct} distinct reports.`
      );
      const pipeline = redis.pipeline();
      pipeline.del(keys.feedItem(targetId));
      pipeline.zrem(keys.feedIds(), targetId);
      pipeline.zrem(keys.feedTrending(), targetId);
      await pipeline.exec();
    }
  }

  return { reported: true };
}

