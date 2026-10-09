import { test } from "vitest";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";
import {
  createMailbox,
  recoverMailbox,
  getPublicMailbox,
  revokeMailboxAccess,
} from "../src/lib/mailbox";
import { sendLetter, unlockLetter } from "../src/lib/letters";
import { requireMailboxOwner } from "../src/lib/auth";
import { ApiError } from "../src/lib/api";
import { POST as sendLetterPost } from "../src/app/api/letters/send/route";
import { MAILBOX_LETTER_CAP } from "../src/lib/constants";
import type { LetterRecord } from "../src/lib/types";

// Unique usernames per test: the Redis shim is a process-wide singleton.
let counter = 0;
const uname = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${counter++}`;

const hasRealRedis = Boolean(process.env.UPSTASH_TEST_URL);

function makeCapsuleLetter(id: string, recipient: string, unlockAt: number): LetterRecord {
  return {
    id,
    recipient,
    body: "sealed capsule body",
    paper: "parchment",
    stamp: "wax",
    hints: [],
    source: "direct",
    createdAt: Date.now(),
    lock: { kind: "capsule", unlockAt },
    burnAfterReading: false,
    openedAt: null,
    burnAt: null,
    reaction: null,
    published: false,
    senderName: null,
    scheduledFor: null,
    replyTo: null,
    version: 1,
  };
}

test("C-1: unlockLetter refuses to return a time-capsule body before unlockAt", async () => {
  const redis = getRedis();
  const username = uname("capsulegate");
  const letterId = `capsule_${username}`;

  await redis.set(keys.letter(letterId), JSON.stringify(makeCapsuleLetter(letterId, username, Date.now() + 3_600_000)), {
    ex: 3600,
  });

  await assert.rejects(
    () => unlockLetter(username, letterId, "any answer"),
    (err: unknown) => {
      assert.ok(err instanceof ApiError, "expected ApiError");
      assert.equal(err.code, "LOCKED");
      assert.equal(err.status, 423);
      assert.equal(err.messageKey, "errors.letterLockedCapsule");
      return true;
    },
    "capsule letter must not leak its body before unlockAt"
  );
});

test.skipIf(!hasRealRedis)(
  "C-1: unlockLetter opens an unlocked capsule and triggers burn-after-reading",
  async () => {
    const redis = getRedis();
    const username = uname("capsuleopen");
    await createMailbox({ username, name: "Capsule Opener", durationKey: "24h", gender: "unspecified" });

    // Burn-after-reading letter with no lock: unlock must mark it opened and arm the burn.
    const { id } = await sendLetter(
      {
        recipient: username,
        body: "this letter should burn after the unlock endpoint reads it",
        paper: "parchment",
        stamp: "wax",
        hints: [],
        mode: { kind: "none" },
        burnAfterReading: true,
        isAnonymous: true,
      },
      "viewer_burn_unlock"
    );

    const res = await unlockLetter(username, id, "");
    assert.equal(res.solved, true);
    assert.equal(res.body, "this letter should burn after the unlock endpoint reads it");

    const raw = await redis.get<string>(keys.letter(id));
    assert.ok(raw, "letter record must still exist until the burn window elapses");
    const letter = JSON.parse(raw) as LetterRecord;
    assert.ok(typeof letter.openedAt === "number", "openedAt must be set by the unlock path");
    assert.ok(typeof letter.burnAt === "number" && letter.burnAt > Date.now(), "burnAt must be armed");
  }
);

test("H-1: recoverMailbox keeps the recovery passcode permanent (no rotation)", async () => {
  const username = uname("permanent");
  const created = await createMailbox({
    username,
    name: "Permanent Tester",
    durationKey: "24h",
    gender: "unspecified",
  });

  const first = await recoverMailbox({
    username,
    name: "Permanent Tester",
    passcode: created.recoveryPasscode,
  });
  assert.match(first.recoveryPasscode, /^\d{6}$/);
  assert.equal(
    first.recoveryPasscode,
    created.recoveryPasscode,
    "recovery must NOT change the passcode"
  );

  // The same passcode keeps working for later recoveries.
  const second = await recoverMailbox({
    username,
    name: "Permanent Tester",
    passcode: created.recoveryPasscode,
  });
  assert.equal(second.recoveryPasscode, created.recoveryPasscode);
  assert.ok(second.accessToken);
});

test("C-2: logout revokes the bearer token server-side", async () => {
  const username = uname("logoutrevoke");
  const created = await createMailbox({
    username,
    name: "Logout Tester",
    durationKey: "24h",
    gender: "unspecified",
  });

  const authed = () =>
    requireMailboxOwner(
      new Request("http://localhost/api/probe", {
        headers: { cookie: `chithi_s_${username}=${encodeURIComponent(created.accessToken)}` },
      }),
      username
    );

  // Token works before revocation.
  await authed();

  assert.equal(await revokeMailboxAccess(username), true);

  // The same token is now dead server-side.
  await assert.rejects(
    () => authed(),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 403);
      return true;
    },
    "revoked token must no longer authenticate"
  );

  // Revoking a missing mailbox is a safe no-op.
  assert.equal(await revokeMailboxAccess("no_such_mailbox_xyz"), false);

  // Passcode recovery still works after a logout revocation.
  const recovered = await recoverMailbox({
    username,
    name: "Logout Tester",
    passcode: created.recoveryPasscode,
  });
  assert.ok(recovered.accessToken);
  await requireMailboxOwner(
    new Request("http://localhost/api/probe", {
      headers: { cookie: `chithi_s_${username}=${encodeURIComponent(recovered.accessToken)}` },
    }),
    username
  );
});

test("getPublicMailbox returns expiresAt for the capsule UI", async () => {
  const username = uname("pubmeta");
  const created = await createMailbox({
    username,
    name: "Meta Tester",
    durationKey: "24h",
    gender: "unspecified",
  });

  const meta = await getPublicMailbox(username);
  assert.equal(meta.exists, true);
  assert.equal(meta.expiresAt, created.expiresAt);
});

function sendRequest(recipient: string, token: string | null, cookie: string | null): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (cookie) headers["cookie"] = cookie;
  return new NextRequest("http://localhost/api/letters/send", {
    method: "POST",
    headers,
    body: JSON.stringify({
      recipient,
      body: "a short self-send probe letter body",
      paper: "parchment",
      stamp: "wax",
      mode: { kind: "none" },
    }),
  });
}

test("H-5: send route blocks self-send for Bearer-token callers", async () => {
  const username = uname("selfsend");
  const created = await createMailbox({
    username,
    name: "Self Sender",
    durationKey: "24h",
    gender: "unspecified",
  });

  // Bearer path (previously bypassed the guard).
  const bearerRes = await sendLetterPost(sendRequest(username, created.accessToken, null));
  assert.equal(bearerRes.status, 403);
  assert.equal((await bearerRes.json()).error.code, "FORBIDDEN");

  // Cookie path (pre-existing behavior, must keep working).
  const cookieRes = await sendLetterPost(
    sendRequest(username, null, `chithi_s_${username}=${encodeURIComponent(created.accessToken)}`)
  );
  assert.equal(cookieRes.status, 403);
  assert.equal((await cookieRes.json()).error.code, "FORBIDDEN");
});

test("H-5: send route does not false-positive on another mailbox's token", async () => {
  const recipient = uname("selfsendrec");
  const sender = uname("selfsendsnd");
  await createMailbox({ username: recipient, name: "Recipient", durationKey: "24h", gender: "unspecified" });
  const senderCreated = await createMailbox({
    username: sender,
    name: "Sender",
    durationKey: "24h",
    gender: "unspecified",
  });

  // A token belonging to a DIFFERENT mailbox must pass the self-send guard.
  // (Without real Redis the request then fails at the Lua send-claim step;
  // the assertion is only that it is NOT rejected as self-send.)
  const res = await sendLetterPost(sendRequest(recipient, senderCreated.accessToken, null));
  assert.notEqual(res.status, 403, "another mailbox's token must not trigger the self-send guard");
});

test("H-8: letter cap is enforced before the atomic claim", async () => {
  const redis = getRedis();
  const username = uname("capfull");
  await createMailbox({ username, name: "Cap Tester", durationKey: "24h", gender: "unspecified" });

  for (let i = 0; i < MAILBOX_LETTER_CAP; i++) {
    await redis.zadd(keys.mailboxLetters(username), { score: Date.now(), member: `ghost_${i}` });
  }

  await assert.rejects(
    () =>
      sendLetter(
        {
          recipient: username,
          body: "this letter must be refused: mailbox is full",
          paper: "parchment",
          stamp: "wax",
          hints: [],
          mode: { kind: "none" },
          burnAfterReading: false,
          isAnonymous: true,
        },
        "viewer_cap"
      ),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "MAILBOX_FULL");
      assert.equal(err.status, 409);
      return true;
    }
  );
});

test.skipIf(!hasRealRedis)(
  "H-8: concurrent identical sends cannot both slip the flood guard",
  async () => {
    const username = uname("floodrace");
    await createMailbox({ username, name: "Flood Racer", durationKey: "24h", gender: "unspecified" });

    const input = {
      recipient: username,
      body: "identical body sent twice at the same instant",
      paper: "parchment" as const,
      stamp: "wax" as const,
      hints: [] as string[],
      mode: { kind: "none" } as const,
      burnAfterReading: false,
      isAnonymous: true,
    };

    const results = await Promise.allSettled([
      sendLetter(input, "viewer_race_hash"),
      sendLetter(input, "viewer_race_hash"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one send must win the atomic claim");
    assert.equal(rejected.length, 1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(reason instanceof ApiError && reason.code === "RATE_LIMITED");
  }
);
