import { test } from "vitest";
import assert from "node:assert/strict";

import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";
import { createMailbox } from "../src/lib/mailbox";
import {
  sendLetter,
  listLetters,
  getLetter,
  getThreadLetters,
  getThreadDepth,
} from "../src/lib/letters";
import { ApiError } from "../src/lib/api";
import { MAX_THREAD_DEPTH } from "../src/lib/constants";
import type { LetterRecord } from "../src/lib/types";
import type { SendLetterInput } from "../src/lib/schemas";

// Unique ids per test: the Redis shim is a process-wide singleton.
let counter = 0;
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${counter++}`;

const hasRealRedis = Boolean(process.env.UPSTASH_TEST_URL);

function makeLetter(
  id: string,
  recipient: string,
  overrides: Partial<LetterRecord> = {}
): LetterRecord {
  return {
    id,
    recipient,
    body: "scheduled test body",
    paper: "parchment",
    stamp: "wax",
    hints: [],
    source: "direct",
    createdAt: Date.now(),
    lock: { kind: "none" },
    burnAfterReading: false,
    openedAt: null,
    burnAt: null,
    reaction: null,
    published: false,
    senderName: null,
    scheduledFor: null,
    replyTo: null,
    version: 1,
    ...overrides,
  };
}

async function seedLetter(
  recipient: string,
  overrides: Partial<LetterRecord> = {}
): Promise<LetterRecord> {
  const redis = getRedis();
  const letter = makeLetter(uid("ltr"), recipient, overrides);
  await redis.set(keys.letter(letter.id), JSON.stringify(letter), { ex: 3600 });
  await redis.zadd(keys.mailboxLetters(recipient), {
    score: letter.createdAt,
    member: letter.id,
  });
  return letter;
}

function sendInput(
  recipient: string,
  overrides: Partial<SendLetterInput> = {}
): SendLetterInput {
  return {
    recipient,
    body: "a brand new test letter body",
    paper: "parchment",
    stamp: "wax",
    hints: [],
    burnAfterReading: false,
    isAnonymous: true,
    mode: { kind: "none" },
    ...overrides,
  } as SendLetterInput;
}

test("scheduled letter is hidden from listLetters until due, then appears", async () => {
  const username = uid("schedlist");
  const future = Date.now() + 3_600_000;
  const letter = await seedLetter(username, { scheduledFor: future });

  const before = await listLetters(username);
  assert.ok(
    !before.items.some((s) => s.id === letter.id),
    "future-scheduled letter must not be listed"
  );

  // Fast-forward: mark it due and re-list.
  const redis = getRedis();
  await redis.set(
    keys.letter(letter.id),
    JSON.stringify({ ...letter, scheduledFor: Date.now() - 1000 }),
    { ex: 3600 }
  );
  const after = await listLetters(username);
  const found = after.items.find((s) => s.id === letter.id);
  assert.ok(found, "due letter must be listed");
  assert.ok(
    typeof found.scheduledFor === "number",
    "summary carries scheduledFor"
  );
});

test("getLetter returns NOT_FOUND for a future-scheduled letter (no leak)", async () => {
  const username = uid("schedget");
  await createMailbox({
    username,
    name: "Sched Get",
    durationKey: "24h",
    gender: "unspecified",
  });
  const letter = await seedLetter(username, {
    scheduledFor: Date.now() + 3_600_000,
  });

  await assert.rejects(
    () => getLetter(username, letter.id),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});

test.skipIf(!hasRealRedis)(
  "getLetter opens a scheduled letter once it is due (real Redis)",
  async () => {
    const username = uid("scheddue");
    await createMailbox({
      username,
      name: "Sched Due",
      durationKey: "24h",
      gender: "unspecified",
    });
    const letter = await seedLetter(username, {
      scheduledFor: Date.now() - 1000,
    });
    const view = await getLetter(username, letter.id);
    assert.equal(view.state, "open");
  }
);

test("sendLetter rejects scheduledFor in the past/too soon and past mailbox expiry", async () => {
  const username = uid("schedrej");
  const created = await createMailbox({
    username,
    name: "Sched Reject",
    durationKey: "24h",
    gender: "unspecified",
  });

  // Too soon (<= now + 60s). Fails before the Lua claim, so the shim is fine.
  await assert.rejects(
    () => sendLetter(sendInput(username, { scheduledFor: Date.now() + 30_000 }), "vh"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "VALIDATION_FAILED");
      return true;
    }
  );

  // Past mailbox expiry.
  await assert.rejects(
    () =>
      sendLetter(
        sendInput(username, { scheduledFor: created.expiresAt + 1000 }),
        "vh"
      ),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "VALIDATION_FAILED");
      return true;
    }
  );
});

test("sendLetter rejects an invalid replyTo with 400", async () => {
  const username = uid("replyrej");
  await createMailbox({
    username,
    name: "Reply Reject",
    durationKey: "24h",
    gender: "unspecified",
  });

  // Non-existent letter id.
  await assert.rejects(
    () => sendLetter(sendInput(username, { replyTo: "no_such_letter" }), "vh"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "VALIDATION_FAILED");
      return true;
    }
  );

  // Letter belonging to a different mailbox.
  const other = uid("replyother");
  const foreign = await seedLetter(other, {});
  await assert.rejects(
    () => sendLetter(sendInput(username, { replyTo: foreign.id }), "vh"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "VALIDATION_FAILED");
      return true;
    }
  );
});

test("getThreadLetters returns the chain oldest → newest", async () => {
  const username = uid("threadorder");
  const a = await seedLetter(username, {});
  const b = await seedLetter(username, { replyTo: a.id });
  const c = await seedLetter(username, { replyTo: b.id });

  const thread = await getThreadLetters(c.id, username);
  assert.deepEqual(
    thread.map((s) => s.id),
    [a.id, b.id, c.id]
  );
  assert.equal(thread[2]?.replyTo, b.id);
  assert.equal(await getThreadDepth(c.id, username), 2);
});

test("getThreadLetters is cycle-safe and getThreadDepth counts ancestors", async () => {
  const username = uid("threadcycle");
  const a = await seedLetter(username, {});
  const b = await seedLetter(username, { replyTo: a.id });

  // Introduce a cycle: A replies to B, B replies to A.
  const redis = getRedis();
  await redis.set(
    keys.letter(a.id),
    JSON.stringify({ ...a, replyTo: b.id }),
    { ex: 3600 }
  );

  const thread = await getThreadLetters(a.id, username);
  assert.ok(thread.length <= 2, "cycle must terminate the walk");
  assert.deepEqual(
    new Set(thread.map((s) => s.id)).size,
    thread.length,
    "no duplicates from the cycle"
  );

  // Depth: break the cycle first for a clean count check.
  await redis.set(keys.letter(a.id), JSON.stringify(a), { ex: 3600 });
  assert.equal(await getThreadDepth(a.id, username), 0);
  assert.equal(await getThreadDepth(b.id, username), 1);
});

test("reply at max thread depth is rejected with REPLY_DEPTH_EXCEEDED", async () => {
  const username = uid("threadmax");
  await createMailbox({
    username,
    name: "Thread Max",
    durationKey: "24h",
    gender: "unspecified",
  });

  // Build a chain of MAX_THREAD_DEPTH + 1 letters: depths 0..MAX_THREAD_DEPTH.
  let parent = await seedLetter(username, {});
  for (let d = 1; d <= MAX_THREAD_DEPTH; d++) {
    parent = await seedLetter(username, { replyTo: parent.id });
  }
  assert.equal(await getThreadDepth(parent.id, username), MAX_THREAD_DEPTH);

  // Replying to the depth-5 letter would be the 6th message → rejected.
  // The depth gate runs before the Lua claim, so this works on the shim.
  await assert.rejects(
    () => sendLetter(sendInput(username, { replyTo: parent.id }), "vh"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "REPLY_DEPTH_EXCEEDED");
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test("reply at depth 4 passes the depth gate", async () => {
  const username = uid("threadok");
  await createMailbox({
    username,
    name: "Thread Ok",
    durationKey: "24h",
    gender: "unspecified",
  });

  // Chain depths 0..4.
  let parent = await seedLetter(username, {});
  for (let d = 1; d <= 4; d++) {
    parent = await seedLetter(username, { replyTo: parent.id });
  }
  assert.equal(await getThreadDepth(parent.id, username), 4);

  // Depth gate allows it; on the shim the send then fails at the Lua claim
  // step, which proves the gate was passed (a gate rejection would be
  // REPLY_DEPTH_EXCEEDED instead).
  await assert.rejects(
    () => sendLetter(sendInput(username, { replyTo: parent.id }), "vh2"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(
        !(
          err instanceof ApiError && err.code === "REPLY_DEPTH_EXCEEDED"
        ),
        "must not be rejected by the depth gate"
      );
      return true;
    }
  );
});

test.skipIf(!hasRealRedis)(
  "end-to-end: scheduled send + reply chain via real Redis",
  async () => {
    const username = uid("schede2e");
    await createMailbox({
      username,
      name: "Sched E2E",
      durationKey: "24h",
      gender: "unspecified",
    });

    // A valid future-scheduled send succeeds end to end.
    const due = Date.now() + 3_600_000;
    const { id } = await sendLetter(
      sendInput(username, { scheduledFor: due }),
      `vh_${username}`
    );
    const before = await listLetters(username);
    assert.ok(!before.items.some((s) => s.id === id));

    // Reply chain through the real send path.
    const first = await sendLetter(sendInput(username, {}), `vh2_${username}`);
    const second = await sendLetter(
      sendInput(username, { replyTo: first.id }),
      `vh3_${username}`
    );
    const thread = await getThreadLetters(second.id, username);
    assert.deepEqual(
      thread.map((s) => s.id),
      [first.id, second.id]
    );
  }
);
