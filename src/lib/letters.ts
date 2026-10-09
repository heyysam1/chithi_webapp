import { SendLetterInput } from "./schemas";
import {
  LetterRecord,
  LetterSummary,
  MailboxRecord,
  PaperStyleId,
  StampId,
  OpenLetter,
  LetterView,
} from "./types";
import {
  CAPSULE_MIN_LEAD_MS,
  BURN_WINDOW_MS,
  MAILBOX_LETTER_CAP,
  RIDDLE_MAX_ATTEMPTS,
  INBOX_PAGE_SIZE,
  MAX_THREAD_DEPTH,
} from "./constants";
import { keys } from "./keys";
import { getRedis } from "./redis";
import { generateLetterId } from "./ids";
import { toPlainText, hasExcessivelyLongWord, sanitizeSenderName } from "./sanitize";
import { hashRiddleAnswer, sha256 } from "./crypto";
import { ApiError } from "./api";
import { getMailbox, remainingTtlSeconds, keyTtlSeconds, MAX_KEY_TTL_S } from "./mailbox";
import {
  OPEN_LETTER_SCRIPT,
  SOLVE_RIDDLE_SCRIPT,
  DELETE_LETTER_SCRIPT,
  SET_REACTION_SCRIPT,
} from "./scripts";

/**
 * Atomically claims a send slot: re-checks the mailbox letter cap and the
 * duplicate-body flood guard, then reserves both in a single Lua script so
 * concurrent sends cannot slip through the check-then-act race (§COR-01).
 *
 * KEYS[1]: mailbox letters zset (mb:ltrs:{recipient})
 * KEYS[2]: flood guard key (flood:{viewerHash}:{recipient})
 * ARGV[1]: letter cap (number)
 * ARGV[2]: sha256(body) hex
 * ARGV[3]: flood key TTL seconds
 * ARGV[4]: zadd score (now ms)
 * ARGV[5]: letterId
 * ARGV[6]: letters zset TTL seconds
 * Returns: 1 = slot claimed, 0 = mailbox full, -1 = duplicate flood
 */
const CLAIM_SEND_SLOT_SCRIPT = `
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[1]) then
  return 0
end

local recent = redis.call('GET', KEYS[2])
if recent and recent == ARGV[2] then
  return -1
end

redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[3]))
redis.call('ZADD', KEYS[1], tonumber(ARGV[4]), ARGV[5])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
return 1
`;

function toLetterSummary(letter: LetterRecord): LetterSummary {
  return {
    id: letter.id,
    stamp: letter.stamp,
    paper: letter.paper,
    createdAt: letter.createdAt,
    source: letter.source,
    hasHints: letter.hints.length > 0,
    hintCount: letter.hints.length,
    lockKind: letter.lock.kind,
    unlockAt: letter.lock.kind === "capsule" ? letter.lock.unlockAt : undefined,
    question: letter.lock.kind === "riddle" ? letter.lock.question : undefined,
    attemptsRemaining:
      letter.lock.kind === "riddle"
        ? Math.max(0, RIDDLE_MAX_ATTEMPTS - letter.lock.attempts)
        : undefined,
    isOpened: letter.openedAt !== null,
    burnAt: letter.burnAt,
    burnAfterReading: letter.burnAfterReading,
    reaction: letter.reaction,
    published: letter.published,
    senderName: letter.senderName,
    scheduledFor: letter.scheduledFor ?? null,
    replyTo: letter.replyTo ?? null,
  };
}

async function letterTtlSeconds(letter: LetterRecord): Promise<number> {
  const mailbox = await getMailbox(letter.recipient);
  if (!mailbox) throw new ApiError("GONE", "errors.mailboxExpired", 410);
  // Physical Redis key TTL: capped for Redis (the permanent mailbox's logical
  // TTL exceeds Redis' 2^31-1 second limit). All callers use this as a key TTL.
  return Math.min(remainingTtlSeconds(mailbox), MAX_KEY_TTL_S);
}

export async function sendLetter(
  input: SendLetterInput,
  viewerHash: string
): Promise<{ id: string }> {
  const redis = getRedis();
  const recipientLower = input.recipient.toLowerCase();

  // 1. Verify recipient mailbox exists and is alive
  const rawMailbox = await redis.get<string | MailboxRecord>(keys.mailbox(recipientLower));
  if (!rawMailbox) {
    throw new ApiError("NOT_FOUND", "errors.mailboxNotFound", 404);
  }

  const mailbox: MailboxRecord =
    typeof rawMailbox === "string" ? JSON.parse(rawMailbox) : rawMailbox;

  const now = Date.now();

  if (now > mailbox.expiresAt) {
    throw new ApiError("GONE", "errors.mailboxExpired", 410);
  }

  // 2. Enforce mailbox letter cap
  const currentCount = await redis.zcard(keys.mailboxLetters(recipientLower));
  if (currentCount >= MAILBOX_LETTER_CAP) {
    throw new ApiError("MAILBOX_FULL", "errors.mailboxFull", 409);
  }

  // 3. Flood guard check (§10.3)
  const bodyHash = sha256(input.body);
  const floodKey = keys.floodGuard(viewerHash, recipientLower);
  const recentHash = await redis.get<string>(floodKey);
  if (recentHash === bodyHash) {
    throw new ApiError("RATE_LIMITED", "errors.duplicateLetterFlood", 429);
  }

  // 4. Sanitize body and hints
  if (hasExcessivelyLongWord(input.body)) {
    throw new ApiError("VALIDATION_FAILED", "errors.validation.wordTooLong", 400);
  }
  const cleanBody = toPlainText(input.body);

  const cleanHints: string[] = [];
  if (input.hints) {
    for (const h of input.hints) {
      if (h && h.trim().length > 0) {
        if (hasExcessivelyLongWord(h)) {
          throw new ApiError("VALIDATION_FAILED", "errors.validation.wordTooLong", 400);
        }
        cleanHints.push(toPlainText(h, 60));
      }
    }
  }

  // 5. Validate & configure locks
  let lockRecord: LetterRecord["lock"] = { kind: "none" };

  if (input.mode.kind === "capsule") {
    const { unlockAt } = input.mode;
    if (unlockAt < now + CAPSULE_MIN_LEAD_MS) {
      throw new ApiError("VALIDATION_FAILED", "errors.capsuleLeadTooShort", 400);
    }
    if (unlockAt > mailbox.expiresAt) {
      throw new ApiError("VALIDATION_FAILED", "errors.capsulePastMailboxExpiry", 400);
    }
    lockRecord = { kind: "capsule", unlockAt };
  } else if (input.mode.kind === "riddle") {
    const { question, answer } = input.mode;
    const cleanQ = toPlainText(question, 140);
    const answerHash = hashRiddleAnswer(answer);
    lockRecord = {
      kind: "riddle",
      question: cleanQ,
      answerHash,
      attempts: 0,
      solvedAt: null,
    };
  }

  // 5b. Validate scheduled delivery and reply target
  let scheduledFor: number | null = null;
  if (input.scheduledFor != null) {
    if (input.scheduledFor <= now + 60_000) {
      throw new ApiError("VALIDATION_FAILED", "errors.scheduleTooSoon", 400);
    }
    if (input.scheduledFor > mailbox.expiresAt) {
      throw new ApiError(
        "VALIDATION_FAILED",
        "errors.schedulePastMailboxExpiry",
        400
      );
    }
    scheduledFor = input.scheduledFor;
  }

  let replyTo: string | null = null;
  if (input.replyTo) {
    const rawParent = await redis.get<string | LetterRecord>(
      keys.letter(input.replyTo)
    );
    let parent: LetterRecord | null = null;
    try {
      parent =
        typeof rawParent === "string"
          ? (JSON.parse(rawParent) as LetterRecord)
          : (rawParent as LetterRecord | null);
    } catch {
      parent = null;
    }
    if (
      !parent ||
      parent.recipient !== recipientLower ||
      (parent.scheduledFor != null && parent.scheduledFor > now)
    ) {
      throw new ApiError("VALIDATION_FAILED", "errors.replyToInvalid", 400);
    }
    // Cap thread depth so reply chains can't become endless messaging
    // threads. The original letter is depth 0; replying to a letter already
    // at MAX_THREAD_DEPTH would exceed it.
    const parentDepth = await getThreadDepth(parent.id, recipientLower);
    if (parentDepth >= MAX_THREAD_DEPTH) {
      throw new ApiError("REPLY_DEPTH_EXCEEDED", "errors.replyDepthExceeded", 400);
    }
    replyTo = parent.id;
  }

  // 6. Atomically claim the send slot (letter cap + flood guard + zset
  //    reservation) in one Lua script. The checks in steps 2-3 above are
  //    fast-fail only; this script is the real guard so concurrent sends
  //    cannot both slip through (§COR-01).
  const letterId = generateLetterId();
  const remainingSeconds = keyTtlSeconds(mailbox);
  const claim = await redis.eval<number>(
    CLAIM_SEND_SLOT_SCRIPT,
    [keys.mailboxLetters(recipientLower), floodKey],
    [MAILBOX_LETTER_CAP, bodyHash, 600, now, letterId, remainingSeconds]
  );
  if (claim === 0) {
    throw new ApiError("MAILBOX_FULL", "errors.mailboxFull", 409);
  }
  if (claim === -1) {
    throw new ApiError("RATE_LIMITED", "errors.duplicateLetterFlood", 429);
  }

  const letterRecord: LetterRecord = {
    id: letterId,
    recipient: recipientLower,
    body: cleanBody,
    paper: input.paper as PaperStyleId,
    stamp: input.stamp as StampId,
    hints: cleanHints,
    source: "direct",
    createdAt: now,
    lock: lockRecord,
    burnAfterReading: Boolean(input.burnAfterReading),
    openedAt: null,
    burnAt: null,
    reaction: null,
    published: false,
    senderName: input.isAnonymous ? null : (sanitizeSenderName(input.senderName ?? "", 40) || null),
    scheduledFor,
    replyTo,
    version: 1,
  };

  // NOTE: the letters zset entry, its TTL, and the flood-guard key were all
  // written atomically by CLAIM_SEND_SLOT_SCRIPT above. Only the letter
  // record itself and the unread counter remain for this pipeline.
  const pipeline = redis.pipeline();
  pipeline.set(keys.letter(letterId), JSON.stringify(letterRecord), {
    ex: remainingSeconds,
  });
  pipeline.incr(keys.mailboxUnread(recipientLower));
  await pipeline.exec();

  return { id: letterId };
}

export async function listLetters(
  usernameLower: string,
  cursor: number = 0
): Promise<{ items: LetterSummary[]; nextCursor: number | null }> {
  const redis = getRedis();

  const start = Math.max(0, cursor);
  const stop = start + INBOX_PAGE_SIZE - 1;

  const letterIds: string[] = await redis.zrange(
    keys.mailboxLetters(usernameLower),
    start,
    stop,
    { rev: true }
  );

  if (!letterIds || letterIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const letterKeys = letterIds.map((id) => keys.letter(id));
  const rawLetters = await redis.mget<unknown[]>(...letterKeys);

  const summaries: LetterSummary[] = [];
  const ghostIds: string[] = [];
  const now = Date.now();

  for (let i = 0; i < letterIds.length; i++) {
    const id = letterIds[i];
    const raw = rawLetters[i];

    if (!id || !raw) {
      if (id) ghostIds.push(id);
      continue;
    }

    let letter: LetterRecord;
    try {
      letter = typeof raw === "string" ? JSON.parse(raw) : (raw as LetterRecord);
    } catch {
      if (id) ghostIds.push(id);
      continue;
    }

    if (letter.burnAt !== null && now > letter.burnAt) {
      ghostIds.push(id);
      continue;
    }

    // Scheduled letters stay hidden until they are due. They are not
    // ghost-pruned — they will surface naturally once scheduledFor passes.
    if (letter.scheduledFor != null && letter.scheduledFor > now) {
      continue;
    }

    summaries.push(toLetterSummary(letter));
  }

  // Ghost-prune on the fetched slice only (§PERF-04)
  if (ghostIds.length > 0) {
    const pipeline = redis.pipeline();
    pipeline.zrem(keys.mailboxLetters(usernameLower), ...ghostIds);
    for (const gid of ghostIds) {
      pipeline.del(keys.letter(gid));
    }
    pipeline.exec().catch((err) => console.error("Ghost pruning error:", err));
  }

  const nextCursor = letterIds.length === INBOX_PAGE_SIZE ? start + INBOX_PAGE_SIZE : null;

  // Self-healing: if on first page and all letters fit, unread counter can be safely reconciled
  if (start === 0 && nextCursor === null) {
    const trueUnreadCount = summaries.filter((s) => !s.isOpened).length;
    const mailbox = await getMailbox(usernameLower);
    if (mailbox) {
      const ttl = keyTtlSeconds(mailbox);
      await redis.set(keys.mailboxUnread(usernameLower), trueUnreadCount, { ex: ttl });
    }
  }

  return { items: summaries, nextCursor };
}

export async function getLetter(
  usernameLower: string,
  letterId: string
): Promise<LetterView> {
  const redis = getRedis();
  const raw = await redis.get<string | LetterRecord>(keys.letter(letterId));

  if (!raw) {
    throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
  }

  const letter: LetterRecord = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (letter.recipient !== usernameLower) {
    throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
  }

  const now = Date.now();

  // Scheduled letters behave as if they don't exist until due — no info leak.
  if (letter.scheduledFor != null && letter.scheduledFor > now) {
    throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
  }

  if (letter.burnAt !== null && now > letter.burnAt) {
    await redis.del(keys.letter(letterId));
    await redis.zrem(keys.mailboxLetters(usernameLower), letterId);
    throw new ApiError("GONE", "errors.letterBurned", 410);
  }

  const baseSummary: LetterSummary = toLetterSummary(letter);

  if (letter.lock.kind === "capsule" && now < letter.lock.unlockAt) {
    return { state: "locked", summary: baseSummary };
  }

  if (letter.lock.kind === "riddle" && !letter.lock.solvedAt) {
    return { state: "locked", summary: baseSummary };
  }

  const ttl = await letterTtlSeconds(letter);
  const updatedRaw = await redis.eval<string | null>(
    OPEN_LETTER_SCRIPT,
    [keys.letter(letterId), keys.mailboxUnread(usernameLower)],
    [now, BURN_WINDOW_MS, ttl]
  );

  const updatedLetter: LetterRecord = updatedRaw
    ? typeof updatedRaw === "string"
      ? JSON.parse(updatedRaw)
      : updatedRaw
    : letter;

  const openLetter: OpenLetter = {
    id: updatedLetter.id,
    recipient: updatedLetter.recipient,
    body: updatedLetter.body,
    paper: updatedLetter.paper,
    stamp: updatedLetter.stamp,
    hints: updatedLetter.hints,
    source: updatedLetter.source,
    createdAt: updatedLetter.createdAt,
    lock:
      updatedLetter.lock.kind === "riddle"
        ? {
            kind: "riddle",
            question: updatedLetter.lock.question,
            attempts: updatedLetter.lock.attempts,
            solvedAt: updatedLetter.lock.solvedAt,
          }
        : updatedLetter.lock,
    burnAfterReading: updatedLetter.burnAfterReading,
    openedAt: updatedLetter.openedAt ?? now,
    burnAt: updatedLetter.burnAt,
    reaction: updatedLetter.reaction,
    published: updatedLetter.published,
    senderName: updatedLetter.senderName,
    version: 1,
  };

  return { state: "open", letter: openLetter };
}

export async function unlockLetter(
  usernameLower: string,
  letterId: string,
  answer: string
): Promise<{ solved: boolean; body: string }> {
  const redis = getRedis();
  const raw = await redis.get<string | LetterRecord>(keys.letter(letterId));

  if (!raw) {
    throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
  }

  const letter: LetterRecord = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (letter.recipient !== usernameLower) {
    throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
  }

  const now = Date.now();

  // Burned letters are gone — same cleanup as getLetter().
  if (letter.burnAt !== null && now > letter.burnAt) {
    await redis.del(keys.letter(letterId));
    await redis.zrem(keys.mailboxLetters(usernameLower), letterId);
    throw new ApiError("GONE", "errors.letterBurned", 410);
  }

  // Time-capsule letters must not be readable before unlockAt. The unlock
  // endpoint previously returned the body for any non-riddle lock, bypassing
  // the capsule timer that getLetter() enforces.
  if (letter.lock.kind === "capsule" && now < letter.lock.unlockAt) {
    throw new ApiError("LOCKED", "errors.letterLockedCapsule", 423);
  }

  if (letter.lock.kind !== "riddle") {
    // Plain or already-unlocked capsule letter: open it the same way getLetter
    // does so burn-after-reading triggers and the unread counter decrements.
    const ttl = await letterTtlSeconds(letter);
    const updatedRaw = await redis.eval<string | null>(
      OPEN_LETTER_SCRIPT,
      [keys.letter(letterId), keys.mailboxUnread(usernameLower)],
      [now, BURN_WINDOW_MS, ttl]
    );
    const updatedLetter: LetterRecord = updatedRaw
      ? typeof updatedRaw === "string"
        ? JSON.parse(updatedRaw)
        : updatedRaw
      : letter;
    return { solved: true, body: updatedLetter.body };
  }

  if (typeof letter.lock.solvedAt === "number" && letter.lock.solvedAt > 0) {
    return { solved: true, body: letter.body };
  }

  if (letter.lock.attempts >= RIDDLE_MAX_ATTEMPTS) {
    throw new ApiError("ATTEMPTS_EXCEEDED", "errors.riddleAttemptsExceeded", 423);
  }

  const incomingHash = hashRiddleAnswer(answer);
  const ttl = await letterTtlSeconds(letter);

  const resRaw = await redis.eval<string>(
    SOLVE_RIDDLE_SCRIPT,
    [keys.letter(letterId), keys.mailboxUnread(usernameLower)],
    [incomingHash, now, RIDDLE_MAX_ATTEMPTS, BURN_WINDOW_MS, ttl]
  );

  const res = typeof resRaw === "string" ? JSON.parse(resRaw) : resRaw;

  if (res.status === "NOT_FOUND") {
    throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
  }
  if (res.status === "ATTEMPTS_EXCEEDED") {
    throw new ApiError("ATTEMPTS_EXCEEDED", "errors.riddleAttemptsExceeded", 423);
  }
  if (res.status === "WRONG_ANSWER") {
    throw new ApiError("WRONG_ANSWER", "errors.riddleWrongAnswer", 422, {
      attemptsRemaining: [String(res.attemptsRemaining)],
    });
  }

  return { solved: true, body: res.body };
}

export async function deleteLetter(
  usernameLower: string,
  letterId: string
): Promise<{ deleted: true }> {
  const redis = getRedis();
  const raw = await redis.get<string | LetterRecord>(keys.letter(letterId));

  if (raw) {
    const letter: LetterRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (letter.recipient !== usernameLower) {
      throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
    }
  }

  await redis.eval<number>(
    DELETE_LETTER_SCRIPT,
    [
      keys.letter(letterId),
      keys.mailboxLetters(usernameLower),
      keys.mailboxUnread(usernameLower),
      keys.letterReactions(letterId),
    ],
    [letterId]
  );

  return { deleted: true };
}

export async function reactToLetter(
  usernameLower: string,
  letterId: string,
  reaction: "heart" | "heartCrack"
): Promise<{ reaction: "heart" | "heartCrack" }> {
  const redis = getRedis();
  const raw = await redis.get<string | LetterRecord>(keys.letter(letterId));

  if (!raw) {
    throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
  }

  const letter: LetterRecord = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (letter.recipient !== usernameLower) {
    throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
  }

  const ttl =
    letter.burnAfterReading && letter.burnAt !== null
      ? Math.max(1, Math.ceil((letter.burnAt - Date.now()) / 1000))
      : await letterTtlSeconds(letter);

  const res = await redis.eval<number>(
    SET_REACTION_SCRIPT,
    [keys.letter(letterId), keys.letterReactions(letterId)],
    [reaction, ttl]
  );

  if (res === 0) {
    throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
  }

  return { reaction };
}

/**
 * Walks the replyTo chain upward from the anchor letter and returns the
 * thread as LetterSummary[] ordered oldest → newest.
 *
 * - Every letter in the chain must belong to `usernameLower`; the anchor
 *   itself throws FORBIDDEN on a recipient mismatch, deeper mismatches end
 *   the walk (they can only exist via data corruption).
 * - Future-scheduled letters are invisible: the anchor throws NOT_FOUND
 *   (same as getLetter), deeper ones end the walk.
 * - Cycle-safe (visited set) and hop-capped at 25.
 */
export async function getThreadLetters(
  letterId: string,
  usernameLower: string
): Promise<LetterSummary[]> {
  const redis = getRedis();
  const chain: LetterSummary[] = [];
  const seen = new Set<string>();
  const now = Date.now();

  let currentId: string | null = letterId;
  for (let hops = 0; hops < 25 && currentId; hops++) {
    if (seen.has(currentId)) break; // replyTo cycle — stop, don't loop
    seen.add(currentId);

    const raw: string | LetterRecord | null =
      await redis.get<string | LetterRecord>(keys.letter(currentId));
    let letter: LetterRecord | null = null;
    try {
      letter =
        typeof raw === "string"
          ? (JSON.parse(raw) as LetterRecord)
          : (raw as LetterRecord | null);
    } catch {
      letter = null;
    }
    if (!letter) break;

    if (letter.recipient !== usernameLower) {
      if (hops === 0) {
        throw new ApiError("FORBIDDEN", "errors.forbidden", 403);
      }
      break;
    }

    if (letter.scheduledFor != null && letter.scheduledFor > now) {
      if (hops === 0) {
        throw new ApiError("NOT_FOUND", "errors.letterNotFound", 404);
      }
      break;
    }

    chain.push(toLetterSummary(letter));
    currentId = letter.replyTo ?? null;
  }

  return chain.reverse();
}

/**
 * Depth of a letter in its reply thread: number of ancestors, where the
 * original letter is depth 0. Reuses getThreadLetters so cycle-safety,
 * ownership, and scheduled-visibility rules are identical.
 */
export async function getThreadDepth(
  letterId: string,
  usernameLower: string
): Promise<number> {
  const chain = await getThreadLetters(letterId, usernameLower);
  return Math.max(0, chain.length - 1);
}

/**
 * All letters of a mailbox with full bodies, for the owner's export.
 * Includes future-scheduled letters (the owner's own data); excludes
 * burned letters. Ordered oldest → newest for readable exports.
 */
export async function getLettersForExport(
  usernameLower: string
): Promise<Array<LetterSummary & { body: string }>> {
  const redis = getRedis();
  const letterIds: string[] = await redis.zrange(
    keys.mailboxLetters(usernameLower),
    0,
    -1
  );
  if (!letterIds || letterIds.length === 0) return [];

  const rawLetters = await redis.mget<unknown[]>(
    ...letterIds.map((id) => keys.letter(id))
  );
  const now = Date.now();
  const out: Array<LetterSummary & { body: string }> = [];

  for (const raw of rawLetters) {
    if (!raw) continue;
    let letter: LetterRecord;
    try {
      letter = typeof raw === "string" ? JSON.parse(raw) : (raw as LetterRecord);
    } catch {
      continue;
    }
    if (letter.recipient !== usernameLower) continue;
    if (letter.burnAt !== null && now > letter.burnAt) continue;
    out.push({ ...toLetterSummary(letter), body: letter.body });
  }

  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}
