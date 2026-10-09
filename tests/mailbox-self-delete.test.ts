/**
 * Self-service permanent mailbox deletion: DELETE /api/mailbox
 * - No auth -> 401, no username -> 400, bad passcode shape -> 400
 * - Wrong passcode -> 401 generic (no enumeration)
 * - Permanent owner mailbox -> 403 (can never be self-deleted)
 * - Happy path -> 200, mailbox record gone, session cookie cleared
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";
import { createMailbox } from "../src/lib/mailbox";
import type { MailboxRecord } from "../src/lib/types";
import { DELETE as deleteMailbox } from "../src/app/api/mailbox/route";

// Unique usernames per test: the Redis shim is a process-wide singleton.
let counter = 0;
const uname = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${counter++}`;

function deleteRequest(
  username: string | null,
  token: string | null,
  body: unknown
): NextRequest {
  const url =
    username === null
      ? "http://localhost/api/mailbox"
      : `http://localhost/api/mailbox?username=${encodeURIComponent(username)}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return new NextRequest(url, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });
}

async function makeMailbox() {
  const username = uname("delme");
  const created = await createMailbox({
    name: "Delete Tester",
    username,
    durationKey: "12h",
    gender: "unspecified",
  });
  return created;
}

test("DELETE /api/mailbox without auth -> 401", async () => {
  const res = await deleteMailbox(
    deleteRequest("ghost", null, { passcode: "123456" })
  );
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "UNAUTHORIZED");
});

test("DELETE /api/mailbox without username -> 400", async () => {
  const res = await deleteMailbox(
    deleteRequest(null, "sometoken", { passcode: "123456" })
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.code, "VALIDATION_FAILED");
});

test("DELETE /api/mailbox with malformed passcode -> 400", async () => {
  const { username, accessToken } = await makeMailbox();
  for (const bad of ["12345", "1234567", "abcdef", "", 123456, null]) {
    const res = await deleteMailbox(
      deleteRequest(username, accessToken, { passcode: bad })
    );
    assert.equal(res.status, 400, `expected 400 for ${String(bad)}`);
  }
  // Mailbox must still exist after rejected attempts
  const redis = getRedis();
  const stillThere = await redis.get(keys.mailbox(username.toLowerCase()));
  assert.ok(stillThere, "mailbox must survive malformed passcode attempts");
});

test("DELETE /api/mailbox with wrong passcode -> 401, nothing deleted", async () => {
  const { username, accessToken, recoveryPasscode } = await makeMailbox();
  assert.notEqual(recoveryPasscode, "000000");
  const res = await deleteMailbox(
    deleteRequest(username, accessToken, { passcode: "000000" })
  );
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "UNAUTHORIZED");
  // Generic error: must not reveal whether the passcode or account failed
  assert.ok(
    !JSON.stringify(json).includes(username),
    "error must not leak the username"
  );
  const redis = getRedis();
  const stillThere = await redis.get(keys.mailbox(username.toLowerCase()));
  assert.ok(stillThere, "mailbox must survive a wrong passcode");
});

test("DELETE /api/mailbox refuses the permanent owner mailbox -> 403", async () => {
  const { username, accessToken, recoveryPasscode } = await makeMailbox();
  // Flip the record to permanent (simulates the owner mailbox)
  const redis = getRedis();
  const raw = await redis.get<string | MailboxRecord>(
    keys.mailbox(username.toLowerCase())
  );
  assert.ok(raw, "mailbox should exist");
  const record: MailboxRecord =
    typeof raw === "string" ? JSON.parse(raw) : raw;
  record.isPermanent = true;
  await redis.set(keys.mailbox(username.toLowerCase()), JSON.stringify(record));

  const res = await deleteMailbox(
    deleteRequest(username, accessToken, { passcode: recoveryPasscode })
  );
  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.error.code, "FORBIDDEN");
  const stillThere = await redis.get(keys.mailbox(username.toLowerCase()));
  assert.ok(stillThere, "permanent mailbox must never be deleted");
});

test("DELETE /api/mailbox happy path -> 200, data wiped, cookie cleared", async () => {
  const { username, accessToken, recoveryPasscode } = await makeMailbox();
  const usernameLower = username.toLowerCase();
  const redis = getRedis();

  const res = await deleteMailbox(
    deleteRequest(username, accessToken, { passcode: recoveryPasscode })
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.deleted, true);

  // Mailbox record, recovery hash, reservation all gone
  assert.equal(await redis.get(keys.mailbox(usernameLower)), null);
  assert.equal(await redis.get(keys.mailboxRecovery(usernameLower)), null);
  assert.equal(await redis.get(keys.mailboxReservation(usernameLower)), null);

  // Session cookie cleared on the response
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.ok(
    setCookie.includes(`chithi_s_${usernameLower}`),
    `expected session cookie clear, got: ${setCookie}`
  );
  assert.ok(
    /max-age=0/i.test(setCookie) || /expires=/i.test(setCookie),
    "cookie must be expired"
  );
});
