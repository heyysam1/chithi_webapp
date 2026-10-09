import { CreateMailboxInput, RecoverMailboxInput, UpdateSettingsInput } from "./schemas";
import { MailboxRecord } from "./types";
import { DURATIONS, MAX_EXTENSIONS_PER_MAILBOX, PLATFORM_MAX_LIFETIME_S } from "./constants";
import { keys } from "./keys";
import { getRedis } from "./redis";
import { generateAccessToken, generateRecoveryPasscode } from "./ids";
import { hashWithPepper, timingSafeEqual, sha256 } from "./crypto";
import { ApiError } from "./api";
import { EXTEND_MAILBOX_SCRIPT } from "./scripts";
import { env } from "./env";

export const TTL_GRACE_S = 60;

// PERMANENT_EXPIRES_AT lives in ./constants (client-safe); imported for
// local use and re-exported for existing server-side imports.
import { PERMANENT_EXPIRES_AT } from "./constants";
export { PERMANENT_EXPIRES_AT };

/**
 * Redis EX/EXPIRE cannot exceed 2^31-1 seconds (~68 years). The permanent
 * mailbox's logical TTL (~73y) exceeds that, so physical key TTLs are capped
 * here. Logical expiry checks (`Date.now() > mailbox.expiresAt`) are unaffected.
 */
export const MAX_KEY_TTL_S = 2147483647;

/** Seconds until this mailbox's hard expiry, floored at 1. Single source of truth. */
export function remainingTtlSeconds(mailbox: Pick<MailboxRecord, "expiresAt">): number {
  return Math.max(1, Math.ceil((mailbox.expiresAt - Date.now()) / 1000));
}

/** Physical Redis key TTL for a mailbox's keys: logical TTL capped for Redis. */
export function keyTtlSeconds(mailbox: Pick<MailboxRecord, "expiresAt">): number {
  return Math.min(remainingTtlSeconds(mailbox), MAX_KEY_TTL_S);
}

/**
 * True iff the permanent owner mailbox feature is enabled AND the given
 * username matches the configured one (case-insensitive).
 */
export function isPermanentMailbox(username: string): boolean {
  return (
    env.PERMANENT_MAILBOX_ENABLED === "true" &&
    !!env.PERMANENT_MAILBOX_USERNAME &&
    username.toLowerCase() === env.PERMANENT_MAILBOX_USERNAME.toLowerCase()
  );
}

export async function createMailbox(input: CreateMailboxInput): Promise<{
  username: string;
  accessToken: string;
  recoveryPasscode: string;
  expiresAt: number;
}> {
  const redis = getRedis();
  const usernameLower = input.username.toLowerCase();
  const lifetimeSeconds = DURATIONS[input.durationKey];
  const totalTtl = lifetimeSeconds + TTL_GRACE_S;

  // 1. Reserve username with atomic SET NX EX to win squatting race
  const reserved = await redis.set(
    keys.mailboxReservation(usernameLower),
    input.username,
    {
      nx: true,
      ex: totalTtl,
    }
  );

  if (!reserved) {
    throw new ApiError("USERNAME_TAKEN", "errors.usernameTaken", 409);
  }

  // 2. Generate secrets and hashes (raw secrets never stored)
  const accessToken = generateAccessToken();
  const recoveryPasscode = generateRecoveryPasscode();
  const accessTokenHash = hashWithPepper(accessToken);
  const recoveryPasscodeHash = hashWithPepper(recoveryPasscode);

  const now = Date.now();
  const expiresAt = now + lifetimeSeconds * 1000;

  const mailboxRecord: MailboxRecord = {
    name: input.name.trim(),
    username: input.username,
    usernameLower,
    accessTokenHash,
    gender: input.gender,
    acceptsBottles: true,
    createdAt: now,
    lastLoginAt: now,
    expiresAt,
    durationKey: input.durationKey,
    letterCount: 0,
    extensionsUsed: 0,
    version: 1,
  };

  // 3. Store record, recovery hash, unread counter, and add to bottle pools
  const pipeline = redis.pipeline();
  pipeline.set(keys.mailbox(usernameLower), JSON.stringify(mailboxRecord), {
    ex: totalTtl,
  });
  pipeline.set(keys.mailboxRecovery(usernameLower), recoveryPasscodeHash, {
    ex: totalTtl,
  });
  pipeline.set(keys.mailboxUnread(usernameLower), 0, { ex: totalTtl });
  pipeline.zadd(keys.activeIndex(), { score: now, member: usernameLower });

  // Add to bottle pools by default
  pipeline.zadd(keys.bottlePool("any"), {
    score: expiresAt,
    member: usernameLower,
  });

  if (input.gender !== "unspecified") {
    pipeline.zadd(keys.bottlePool(input.gender), {
      score: expiresAt,
      member: usernameLower,
    });
  }

  try {
    await pipeline.exec();
  } catch (err) {
    // Don't squat the username on partial failure: release the reservation
    // so the user can retry immediately instead of hitting USERNAME_TAKEN
    // for the rest of the reservation TTL.
    await redis.del(keys.mailboxReservation(usernameLower)).catch(() => {});
    throw err;
  }

  return {
    username: input.username,
    accessToken,
    recoveryPasscode,
    expiresAt,
  };
}

export async function recoverMailbox(input: RecoverMailboxInput): Promise<{
  name?: string;
  username: string;
  accessToken: string;
  recoveryPasscode: string;
}> {
  const redis = getRedis();
  const usernameLower = input.username.toLowerCase();

  // Serialize concurrent recoveries for the same mailbox: the access-token
  // rotation below is read-modify-write, so two racing recoveries would both
  // succeed and the second would invalidate the first's fresh token.
  const lockKey = `lock:recover:${usernameLower}`;
  const locked = await redis.set(lockKey, "1", { nx: true, ex: 30 });
  if (!locked) {
    throw new ApiError("RATE_LIMITED", "errors.rateLimited", 429);
  }
  try {
    return await recoverMailboxInner(input, usernameLower);
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

async function recoverMailboxInner(
  input: RecoverMailboxInput,
  usernameLower: string
): Promise<{
  name?: string;
  username: string;
  accessToken: string;
  recoveryPasscode: string;
}> {
  const redis = getRedis();

  const storedPasscodeHash = await redis.get<string>(
    keys.mailboxRecovery(usernameLower)
  );

  if (!storedPasscodeHash) {
    // Deliberately identical error message to prevent username enumeration
    throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
  }

  const incomingPasscodeHash = hashWithPepper(input.passcode);
  const matches = timingSafeEqual(incomingPasscodeHash, storedPasscodeHash);

  if (!matches) {
    throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
  }

  // Load existing mailbox record
  const rawMailbox = await redis.get<string | MailboxRecord>(
    keys.mailbox(usernameLower)
  );

  if (!rawMailbox) {
    throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
  }

  const mailbox: MailboxRecord =
    typeof rawMailbox === "string" ? JSON.parse(rawMailbox) : rawMailbox;

  if (Date.now() > mailbox.expiresAt) {
    throw new ApiError("GONE", "errors.mailboxExpired", 410);
  }

  // Verify name identity (case-insensitive trimmed comparison)
  if (mailbox.name && mailbox.name.trim().toLowerCase() !== input.name.trim().toLowerCase()) {
    throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
  }

  // If mailbox did not have a name set (legacy record), record it
  if (!mailbox.name) {
    mailbox.name = input.name.trim();
  }

  // Rotate access token on successful recovery
  const newAccessToken = generateAccessToken();
  mailbox.accessTokenHash = hashWithPepper(newAccessToken);
  mailbox.lastLoginAt = Date.now();

  // The recovery passcode is permanent: one passcode per mailbox for the
  // whole account lifetime. It was verified above and is never rotated here.
  // (Only the access token rotates, per login, for session hygiene.)

  const ttl = keyTtlSeconds(mailbox);
  const pipeline = redis.pipeline();
  pipeline.set(keys.mailbox(usernameLower), JSON.stringify(mailbox), {
    ex: ttl,
  });
  pipeline.zadd(keys.activeIndex(), { score: mailbox.lastLoginAt, member: usernameLower });
  await pipeline.exec();

  return {
    name: mailbox.name,
    username: mailbox.username,
    accessToken: newAccessToken,
    recoveryPasscode: input.passcode,
  };
}

/**
 * Recovery login for the env-configured permanent owner mailbox, via the
 * normal /recover flow (name + username + 6-digit passcode). No new UI.
 *
 * Differences from normal recovery:
 * - credentials come from env (PERMANENT_MAILBOX_*), never from the request body beyond the login attempt;
 * - the mailbox record is created on first login (get-or-create) with
 *   expiresAt = PERMANENT_EXPIRES_AT and isPermanent: true;
 * - the passcode is NEVER rotated (rotating it would break the owner's known
 *   passcode); the access token IS rotated per login, exactly like normal
 *   recovery, so logout/session semantics are unchanged.
 */
export async function recoverPermanentMailbox(input: RecoverMailboxInput): Promise<{
  name: string;
  username: string;
  accessToken: string;
  recoveryPasscode: string;
}> {
  const redis = getRedis();
  const expectedName = (env.PERMANENT_MAILBOX_NAME || "").trim();
  const expectedUsername = (env.PERMANENT_MAILBOX_USERNAME || "").trim();
  const expectedPasscode = (env.PERMANENT_MAILBOX_PASSCODE || "").trim();
  const usernameLower = expectedUsername.toLowerCase();

  // Name check (trimmed, case-insensitive). Identical 401 as every other
  // failure so the endpoint reveals nothing about which check failed.
  if (!expectedName || input.name.trim().toLowerCase() !== expectedName.toLowerCase()) {
    throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
  }

  // Timing-safe passcode comparison over SHA-256 digests — never raw ===.
  if (!expectedPasscode || !timingSafeEqual(sha256(input.passcode), sha256(expectedPasscode))) {
    throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
  }

  const raw = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));
  let mailbox: MailboxRecord | null = raw
    ? typeof raw === "string"
      ? JSON.parse(raw)
      : raw
    : null;

  if (mailbox && !mailbox.isPermanent) {
    // A normal mailbox somehow holds this username (create route reserves it,
    // so this should be impossible) — refuse rather than hijack it.
    throw new ApiError("UNAUTHORIZED", "errors.recoveryFailed", 401);
  }

  const newAccessToken = generateAccessToken();
  const now = Date.now();

  if (!mailbox) {
    mailbox = {
      name: expectedName,
      username: expectedUsername,
      usernameLower,
      accessTokenHash: hashWithPepper(newAccessToken),
      gender: "unspecified",
      // The owner's private mailbox stays out of the bottle pools.
      acceptsBottles: false,
      createdAt: now,
      lastLoginAt: now,
      expiresAt: PERMANENT_EXPIRES_AT,
      durationKey: "7d",
      letterCount: 0,
      version: 1,
      isPermanent: true,
      extensionsUsed: 0,
    };
  } else {
    // Re-login: rotate the access token (same as normal recovery) and
    // re-assert permanence fields. Passcode is deliberately NOT rotated.
    mailbox.accessTokenHash = hashWithPepper(newAccessToken);
    mailbox.lastLoginAt = now;
    mailbox.expiresAt = PERMANENT_EXPIRES_AT;
    mailbox.isPermanent = true;
  }

  const ttl = keyTtlSeconds(mailbox);
  const pipeline = redis.pipeline();
  pipeline.set(keys.mailbox(usernameLower), JSON.stringify(mailbox), { ex: ttl });
  pipeline.set(keys.mailboxRecovery(usernameLower), hashWithPepper(expectedPasscode), {
    ex: ttl,
  });
  pipeline.set(keys.mailboxUnread(usernameLower), 0, { ex: ttl, nx: true });
  pipeline.set(keys.mailboxReservation(usernameLower), expectedUsername, { nx: true, ex: ttl });
  pipeline.zadd(keys.activeIndex(), { score: mailbox.lastLoginAt, member: usernameLower });
  await pipeline.exec();

  return {
    name: mailbox.name!,
    username: mailbox.username,
    accessToken: newAccessToken,
    // Unrotated by design: the owner logs in with this passcode every time.
    recoveryPasscode: expectedPasscode,
  };
}

/**
 * Server-side logout: rotates the mailbox's access token hash to a fresh
 * random value that is never disclosed, so every bearer token and session
 * cookie previously issued for this mailbox stops working — even tokens
 * copied out of the `?key=` URL, browser history, or logs.
 *
 * Recovery via the (single-use, rotated) passcode still works afterwards.
 * Returns false when the mailbox does not exist or is already expired.
 */
export async function revokeMailboxAccess(usernameLower: string): Promise<boolean> {
  const redis = getRedis();
  const raw = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));
  if (!raw) return false;

  const mailbox: MailboxRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (Date.now() > mailbox.expiresAt) return false;

  mailbox.accessTokenHash = hashWithPepper(generateAccessToken());
  mailbox.lastLoginAt = Date.now();

  const ttl = keyTtlSeconds(mailbox);
  await redis.set(keys.mailbox(usernameLower), JSON.stringify(mailbox), {
    ex: ttl,
  });
  return true;
}

export async function getPublicMailbox(username: string): Promise<{
  name?: string;
  username: string;
  exists: boolean;
  acceptsBottles: boolean;
  expiresAt: number;
}> {
  const redis = getRedis();
  const usernameLower = username.toLowerCase();

  const raw = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));
  if (!raw) {
    throw new ApiError("NOT_FOUND", "errors.mailboxNotFound", 404);
  }

  const mailbox: MailboxRecord = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (Date.now() > mailbox.expiresAt) {
    // Collapse 410 into 404 on public route so expired and never-existed are indistinguishable (§API-05)
    throw new ApiError("NOT_FOUND", "errors.mailboxNotFound", 404);
  }

  return {
    name: mailbox.name || mailbox.username,
    username: mailbox.username,
    exists: true,
    acceptsBottles: mailbox.acceptsBottles,
    expiresAt: mailbox.expiresAt,
  };
}

/**
 * Retrieves mailbox record or null if missing or expired
 */
export async function getMailbox(username: string): Promise<MailboxRecord | null> {
  const redis = getRedis();
  const usernameLower = username.toLowerCase();

  const raw = await redis.get<string | MailboxRecord>(keys.mailbox(usernameLower));
  if (!raw) return null;

  const mailbox: MailboxRecord = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (Date.now() > mailbox.expiresAt) {
    return null;
  }

  return mailbox;
}

export const GRACE_MS = (7 * 86400 + TTL_GRACE_S) * 1000;

/**
 * Permanently wipes a user's entire mailbox and all associated data from Redis.
 */
export async function purgeInactiveMailbox(username: string): Promise<void> {
  const redis = getRedis();
  const usernameLower = username.toLowerCase();

  // 1. Fetch and delete all associated letters (chunked in batches of 50 per §PERF-01)
  const letterIds = await redis.zrange(keys.mailboxLetters(usernameLower), 0, -1);
  const CHUNK_SIZE = 50;
  for (let i = 0; i < letterIds.length; i += CHUNK_SIZE) {
    const chunk = letterIds.slice(i, i + CHUNK_SIZE);
    const chunkPipe = redis.pipeline();
    for (const letterId of chunk) {
      chunkPipe.del(keys.letter(letterId));
      chunkPipe.del(keys.letterReactions(letterId));
    }
    await chunkPipe.exec();
  }

  // 2. Delete mailbox record, letters index, recovery passcode, and unread counter
  const pipeline = redis.pipeline();
  pipeline.del(keys.mailboxLetters(usernameLower));
  pipeline.del(keys.mailbox(usernameLower));
  pipeline.del(keys.mailboxRecovery(usernameLower));
  pipeline.del(keys.mailboxUnread(usernameLower));

  // 3. Release claimed username from global reservation lock so handle becomes available again
  pipeline.del(keys.mailboxReservation(usernameLower));

  // 4. Remove from bottle pools & active index
  pipeline.zrem(keys.bottlePool("any"), usernameLower);
  pipeline.zrem(keys.bottlePool("male"), usernameLower);
  pipeline.zrem(keys.bottlePool("female"), usernameLower);
  pipeline.zrem(keys.bottlePool("other"), usernameLower);
  pipeline.zrem(keys.activeIndex(), usernameLower);

  await pipeline.exec();

  // 5. Remove flood-guard keys for this recipient (flood:*:{usernameLower}).
  //    They self-expire in 10 minutes, but purging them avoids orphans.
  // 6. Remove bottle-pair delivery guards (bottle:pair:*:{usernameLower}).
  //    They self-expire in 24h, but purging them avoids orphans.
  for (const pattern of [`flood:*:${usernameLower}`, `bottle:pair:*:${usernameLower}`]) {
    try {
      let cursor = "0";
      for (;;) {
        const [next, found] = await redis.scan(cursor, {
          match: pattern,
          count: 100,
        });
        if (found.length > 0) {
          await redis.del(...found);
        }
        if (next === "0") break;
        cursor = next;
      }
    } catch {
      // Best-effort: orphan keys self-expire via their own TTL.
    }
  }
}

/**
 * Updates active index for observability with a 5-minute throttle (§PERF-02).
 */
export async function touchMailboxLogin(mailbox: MailboxRecord): Promise<void> {
  const now = Date.now();
  // Throttle: skip the write when last activity was less than 5 minutes ago (§PERF-02)
  if (mailbox.lastLoginAt && now - mailbox.lastLoginAt < 5 * 60_000) {
    return;
  }

  const redis = getRedis();
  await redis.zadd(keys.activeIndex(), { score: now, member: mailbox.usernameLower });
}

/**
 * Scans active index using range query on sorted set (§PERF-01).
 * Capped at 200 mailboxes per invocation.
 */
export async function cleanupInactiveMailboxes(): Promise<number> {
  const redis = getRedis();
  const cutoff = Date.now() - GRACE_MS;
  const stale = await redis.zrange(keys.activeIndex(), 0, cutoff, {
    byScore: true,
    offset: 0,
    count: 200,
  });

  if (!stale || stale.length === 0) {
    return 0;
  }

  for (const u of stale) {
    if (!u) continue;
    // Belt & braces: the permanent owner mailbox is never purged, even if its
    // active-index entry ever goes stale (its 2100 expiry already protects it).
    const raw = await redis.get<string | MailboxRecord>(keys.mailbox(u));
    if (raw) {
      const m: MailboxRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (m.isPermanent) continue;
    }
    await purgeInactiveMailbox(u);
  }

  return stale.length;
}

interface ExtendMailboxResult {
  expiresAt: number;
  extensionsUsed: number;
  extensionsRemaining: number;
}

/**
 * Extends a mailbox's expiry by `addSeconds`, capped at the platform ceiling
 * (7 days from creation). The extension slot is claimed atomically inside a
 * Lua script, so concurrent requests can never exceed the lifetime limit.
 * On success the mailbox record, its letters index, unread counter, recovery
 * hash, reservation lock and every letter key get their TTL refreshed to the
 * new remaining lifetime (burn-after-reading letters keep their burn
 * deadline). Permanent mailboxes are rejected.
 */
export async function extendMailboxExpiry(
  mailbox: MailboxRecord,
  addSeconds: number
): Promise<ExtendMailboxResult> {
  const redis = getRedis();
  const usernameLower = mailbox.usernameLower;

  const genderPool =
    mailbox.gender && mailbox.gender !== "unspecified"
      ? keys.bottlePool(mailbox.gender)
      : keys.bottlePool("any");

  const resRaw = await redis.eval<string>(
    EXTEND_MAILBOX_SCRIPT,
    [
      keys.mailbox(usernameLower),
      keys.mailboxLetters(usernameLower),
      keys.mailboxUnread(usernameLower),
      keys.mailboxRecovery(usernameLower),
      keys.mailboxReservation(usernameLower),
      keys.bottlePool("any"),
      genderPool,
    ],
    [
      addSeconds,
      PLATFORM_MAX_LIFETIME_S,
      MAX_EXTENSIONS_PER_MAILBOX,
      Date.now(),
      keys.letter(""),
      TTL_GRACE_S,
    ]
  );

  const res: {
    status: string;
    expiresAt?: number;
    extensionsUsed?: number;
  } = typeof resRaw === "string" ? JSON.parse(resRaw) : resRaw;

  if (res.status === "NOT_FOUND") {
    throw new ApiError("NOT_FOUND", "errors.mailboxNotFound", 404);
  }
  if (res.status === "PERMANENT") {
    throw new ApiError("PERMANENT_MAILBOX", "errors.extend.permanentNotExtendable", 400);
  }
  if (res.status === "EXPIRED") {
    throw new ApiError("GONE", "errors.mailboxExpired", 410);
  }
  if (res.status === "EXTENSIONS_EXHAUSTED") {
    throw new ApiError("EXTENSIONS_EXHAUSTED", "errors.extend.limitReached", 400);
  }
  if (res.status === "MAX_EXPIRY_REACHED") {
    throw new ApiError("MAX_EXPIRY_REACHED", "errors.extend.maxExpiryReached", 400);
  }
  if (res.status !== "OK" || !res.expiresAt || !res.extensionsUsed) {
    throw new ApiError("INTERNAL", "errors.internal", 500);
  }

  return {
    expiresAt: res.expiresAt,
    extensionsUsed: res.extensionsUsed,
    extensionsRemaining: MAX_EXTENSIONS_PER_MAILBOX - res.extensionsUsed,
  };
}

export async function updateMailboxSettings(
  mailbox: MailboxRecord,
  input: UpdateSettingsInput
): Promise<{ acceptsBottles: boolean }> {
  const redis = getRedis();
  const usernameLower = mailbox.usernameLower;

  mailbox.acceptsBottles = input.acceptsBottles;

  const remainingSeconds = keyTtlSeconds(mailbox);

  const pipeline = redis.pipeline();
  pipeline.set(keys.mailbox(usernameLower), JSON.stringify(mailbox), {
    ex: remainingSeconds,
  });

  if (input.acceptsBottles) {
    pipeline.zadd(keys.bottlePool("any"), {
      score: mailbox.expiresAt,
      member: usernameLower,
    });
    if (mailbox.gender !== "unspecified") {
      pipeline.zadd(keys.bottlePool(mailbox.gender), {
        score: mailbox.expiresAt,
        member: usernameLower,
      });
    }
  } else {
    pipeline.zrem(keys.bottlePool("any"), usernameLower);
    pipeline.zrem(keys.bottlePool("male"), usernameLower);
    pipeline.zrem(keys.bottlePool("female"), usernameLower);
    pipeline.zrem(keys.bottlePool("other"), usernameLower);
  }

  await pipeline.exec();

  return { acceptsBottles: input.acceptsBottles };
}
