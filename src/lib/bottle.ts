import { SendBottleInput } from "./schemas";
import { MailboxRecord, LetterRecord, PaperStyleId, StampId } from "./types";
import { MAILBOX_LETTER_CAP } from "./constants";
import { keys } from "./keys";
import { getRedis } from "./redis";
import { generateLetterId } from "./ids";
import { toPlainText, hasExcessivelyLongWord, sanitizeSenderName } from "./sanitize";
import { ApiError } from "./api";
import { keyTtlSeconds } from "./mailbox";
import { DELIVER_BOTTLE_SCRIPT } from "./scripts";

/**
 * Matches an active, eligible candidate recipient and their mailbox record (§COR-07).
 * Does NOT consume the 24h pair guard until delivery is atomic.
 */
export async function selectBottleCandidate(
  target: "anyone" | "male" | "female",
  senderViewerHash: string,
  senderUsernameLower?: string
): Promise<{ recipient: string; mailbox: MailboxRecord }> {
  const redis = getRedis();
  const poolKey =
    target === "anyone"
      ? keys.bottlePool("any")
      : keys.bottlePool(target);

  const now = Date.now();

  // 1. Prune expired mailboxes from pool
  await redis.zremrangebyscore(poolKey, 0, now);

  // 2. Count active candidates
  const card = await redis.zcard(poolKey);
  if (card === 0) {
    throw new ApiError("BOTTLE_NO_MATCH", "errors.bottleNoMatch", 409);
  }

  // 3. Retry matching up to 10 times across available candidates
  for (let attempt = 0; attempt < 10; attempt++) {
    const randomIndex = Math.floor(Math.random() * card);
    const candidateArray = await redis.zrange(poolKey, randomIndex, randomIndex);
    const candidate = candidateArray[0];

    if (!candidate) continue;

    // Reject self-targeting
    if (senderUsernameLower && candidate === senderUsernameLower) {
      continue;
    }

    // Verify mailbox exists and is active
    const rawMailbox = await redis.get<string | MailboxRecord>(keys.mailbox(candidate));
    if (!rawMailbox) {
      await redis.zrem(poolKey, candidate);
      continue;
    }

    const mailbox: MailboxRecord =
      typeof rawMailbox === "string" ? JSON.parse(rawMailbox) : rawMailbox;

    if (now > mailbox.expiresAt || !mailbox.acceptsBottles) {
      await redis.zrem(poolKey, candidate);
      continue;
    }

    // Check letter cap
    const letterCount = await redis.zcard(keys.mailboxLetters(candidate));
    if (letterCount >= MAILBOX_LETTER_CAP) {
      continue;
    }

    // Verify pair key not already held (§COR-07: check only, do not acquire yet)
    const pairKey = keys.bottlePair(senderViewerHash, candidate);
    const alreadyPaired = await redis.get(pairKey);
    if (alreadyPaired) {
      continue;
    }

    return { recipient: candidate, mailbox };
  }

  throw new ApiError("BOTTLE_NO_MATCH", "errors.bottleNoMatch", 409);
}

/**
 * Sends an anonymous message in a bottle with atomic delivery and pair reservation (§COR-06, §COR-07).
 */
export async function sendBottle(
  input: SendBottleInput,
  senderViewerHash: string,
  senderUsernameLower?: string
): Promise<{ delivered: true }> {
  const redis = getRedis();

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

  // Retry candidate selection and atomic delivery up to 3 times in case of pair collisions
  for (let deliveryAttempt = 0; deliveryAttempt < 3; deliveryAttempt++) {
    const { recipient, mailbox } = await selectBottleCandidate(
      input.target,
      senderViewerHash,
      senderUsernameLower
    );

    const now = Date.now();
    const remainingSeconds = keyTtlSeconds(mailbox);
    const letterId = generateLetterId();

    const letterRecord: LetterRecord = {
      id: letterId,
      recipient,
      body: cleanBody,
      paper: input.paper as PaperStyleId,
      stamp: input.stamp as StampId,
      hints: cleanHints,
      source: "bottle",
      createdAt: now,
      lock: { kind: "none" },
      burnAfterReading: false,
      openedAt: null,
      burnAt: null,
      reaction: null,
      published: false,
      senderName: input.isAnonymous ? null : (sanitizeSenderName(input.senderName ?? "", 40) || null),
      // Bottles are always delivered immediately and never replies.
      scheduledFor: null,
      replyTo: null,
      version: 1,
    };

    const pairKey = keys.bottlePair(senderViewerHash, recipient);
    let delivered = false;

    try {
      // Execute atomic DELIVER_BOTTLE_SCRIPT (§COR-07)
      const res = await redis.eval<number>(
        DELIVER_BOTTLE_SCRIPT,
        [
          pairKey,
          keys.letter(letterId),
          keys.mailboxLetters(recipient),
          keys.mailboxUnread(recipient),
        ],
        [JSON.stringify(letterRecord), letterId, now, remainingSeconds]
      );

      if (res === 1) {
        delivered = true;
        return { delivered: true };
      }
      // If pair acquisition failed, loop and try next candidate
    } catch (err) {
      // If delivery failed with an unexpected error, clean up the pairKey if it was acquired
      if (!delivered) {
        await redis.del(pairKey).catch(() => {});
      }
      throw err;
    }
  }

  throw new ApiError("BOTTLE_NO_MATCH", "errors.bottleNoMatch", 409);
}
