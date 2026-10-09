import { NextRequest } from "next/server";
import { apiOk, apiErr } from "@/lib/api";
import { getRedis, type RedisLike } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { guardAdmin } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Safety caps so one admin request can never run an unbounded scan.
 * When a cap is hit the response carries `truncated: true` for that section.
 */
const SCAN_KEY_CAP = 5000;
const PIPELINE_CHUNK = 500;

/** Mailbox record keys look like `mb:{username}` — no extra colon segments. */
function isMailboxRecordKey(key: string): boolean {
  return /^mb:[^:]+$/.test(key);
}

async function scanMatch(
  redis: RedisLike,
  match: string,
  cap: number
): Promise<{ keys: string[]; truncated: boolean }> {
  const found: string[] = [];
  let cursor: number | string = 0;
  let truncated = false;
  for (;;) {
    const [next, batch] = await redis.scan(cursor, { match, count: 500 });
    for (const k of batch) {
      if (found.length >= cap) {
        truncated = true;
        break;
      }
      found.push(k);
    }
    if (truncated) break;
    cursor = next;
    if (String(cursor) === "0") break;
  }
  return { keys: found, truncated };
}

async function chunked<T>(
  items: string[],
  fn: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += PIPELINE_CHUNK) {
    out.push(...(await fn(items.slice(i, i + PIPELINE_CHUNK))));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const redis = getRedis();

    const [
      activeMailboxes,
      mbScan,
      bottlePools,
      feedTotal,
      reportScan,
      storageKeys,
    ] = await Promise.all([
      redis.zcard(keys.activeIndex()),
      scanMatch(redis, "mb:*", SCAN_KEY_CAP),
      Promise.all([
        redis.zcard(keys.bottlePool("any")),
        redis.zcard(keys.bottlePool("male")),
        redis.zcard(keys.bottlePool("female")),
        redis.zcard(keys.bottlePool("other")),
      ]),
      redis.zcard(keys.feedIds()),
      scanMatch(redis, "report:*", SCAN_KEY_CAP),
      // DBSIZE is not in the RedisLike interface; the in-memory dev shim
      // throws on eval, so a null here means "unavailable in this env".
      redis
        .eval<number>("return redis.call('DBSIZE')", [], [])
        .then((n) => (typeof n === "number" ? n : null))
        .catch(() => null),
    ]);

    const recordKeys = mbScan.keys.filter(isMailboxRecordKey);
    const usernames = recordKeys.map((k) => k.slice(3).toLowerCase());

    // Sessions: mailbox records whose accessTokenHash is set.
    // Letter totals: ZCARD of each mailbox's letter sorted set.
    const [rawRecords, letterCounts] = await Promise.all([
      chunked(usernames, async (chunk) => {
        const vals = await redis.mget<unknown[]>(
          ...chunk.map((u) => keys.mailbox(u))
        );
        return vals as Array<string | null>;
      }),
      chunked(usernames, async (chunk) => {
        const p = redis.pipeline();
        for (const u of chunk) p.zcard(keys.mailboxLetters(u));
        const res = await p.exec<number[]>();
        return res as number[];
      }),
    ]);

    let sessionsActive = 0;
    for (const raw of rawRecords) {
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as { accessTokenHash?: unknown };
        if (rec.accessTokenHash) sessionsActive += 1;
      } catch {
        // Corrupt record — counted in total, not in sessions.
      }
    }

    let lettersTotal = 0;
    for (const c of letterCounts) lettersTotal += c || 0;

    const [poolAny, poolMale, poolFemale, poolOther] = bottlePools;
    const bottlesTotal = poolAny + poolMale + poolFemale + poolOther;
    const total = recordKeys.length;

    return apiOk({
      mailboxes: {
        total,
        active: activeMailboxes,
        expired: Math.max(0, total - activeMailboxes),
        truncated: mbScan.truncated,
      },
      letters: { total: lettersTotal, truncated: mbScan.truncated },
      bottles: {
        total: bottlesTotal,
        pools: { any: poolAny, male: poolMale, female: poolFemale, other: poolOther },
      },
      feed: { total: feedTotal },
      storage: { keys: storageKeys },
      reports: { pending: reportScan.keys.length, truncated: reportScan.truncated },
      sessions: { active: sessionsActive, truncated: mbScan.truncated },
    });
  } catch {
    return apiErr("INTERNAL", "errors.generic", 500);
  }
}
