/**
 * Permanent (never-expiring) owner mailbox — env-configured, login via the
 * existing /recover flow. Uses DUMMY credentials set in-process only; the
 * real values live in env vars and are never committed.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

const DUMMY = {
  PERMANENT_MAILBOX_ENABLED: "true",
  PERMANENT_MAILBOX_NAME: "Test Owner",
  PERMANENT_MAILBOX_USERNAME: "permowner",
  PERMANENT_MAILBOX_PASSCODE: "123456",
};

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("permanent mailbox: env validation fails fast", () => {
  it("throws when enabled but credentials are missing", async () => {
    vi.resetModules();
    process.env.PERMANENT_MAILBOX_ENABLED = "true";
    delete process.env.PERMANENT_MAILBOX_NAME;
    delete process.env.PERMANENT_MAILBOX_USERNAME;
    delete process.env.PERMANENT_MAILBOX_PASSCODE;
    await expect(import("../src/lib/env")).rejects.toThrow(/permanent mailbox/i);
  });

  it("throws when the username is not a valid mailbox username", async () => {
    vi.resetModules();
    Object.assign(process.env, {
      PERMANENT_MAILBOX_ENABLED: "true",
      PERMANENT_MAILBOX_NAME: "Test Owner",
      PERMANENT_MAILBOX_USERNAME: "not valid!!",
      PERMANENT_MAILBOX_PASSCODE: "123456",
    });
    await expect(import("../src/lib/env")).rejects.toThrow(/USERNAME/i);
  });

  it("throws when the passcode is not 6 digits", async () => {
    vi.resetModules();
    Object.assign(process.env, {
      PERMANENT_MAILBOX_ENABLED: "true",
      PERMANENT_MAILBOX_NAME: "Test Owner",
      PERMANENT_MAILBOX_USERNAME: "permowner",
      PERMANENT_MAILBOX_PASSCODE: "secret!",
    });
    await expect(import("../src/lib/env")).rejects.toThrow(/PASSCODE/i);
  });
});

describe("permanent mailbox: behavior", () => {
  let mb: typeof import("../src/lib/mailbox");
  let redis: ReturnType<typeof import("../src/lib/redis").getRedis>;
  let keys: typeof import("../src/lib/keys").keys;
  let hashWithPepper: typeof import("../src/lib/crypto").hashWithPepper;
  let POST_recover: typeof import("../src/app/api/mailbox/recover/route").POST;
  let POST_create: typeof import("../src/app/api/mailbox/create/route").POST;

  beforeAll(async () => {
    Object.assign(process.env, DUMMY);
    vi.resetModules();
    mb = await import("../src/lib/mailbox");
    redis = (await import("../src/lib/redis")).getRedis();
    keys = (await import("../src/lib/keys")).keys;
    hashWithPepper = (await import("../src/lib/crypto")).hashWithPepper;
    POST_recover = (await import("../src/app/api/mailbox/recover/route")).POST;
    POST_create = (await import("../src/app/api/mailbox/create/route")).POST;
  });

  it("first login creates the permanent mailbox record", async () => {
    const out = await mb.recoverPermanentMailbox({
      name: "Test Owner",
      username: "permowner",
      passcode: "123456",
    });
    expect(out.username).toBe("permowner");
    expect(out.accessToken).toBeTruthy();
    // Passcode is returned unrotated so the /recover UI can display it.
    expect(out.recoveryPasscode).toBe("123456");

    const raw = await redis.get<string>(keys.mailbox("permowner"));
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw as string);
    expect(record.isPermanent).toBe(true);
    expect(record.expiresAt).toBe(mb.PERMANENT_EXPIRES_AT);
    expect(record.expiresAt).toBe(4102444800000); // 2100-01-01
  });

  it("second login reuses the record, rotates the token, never the passcode", async () => {
    const first = await mb.recoverPermanentMailbox({
      name: "Test Owner",
      username: "permowner",
      passcode: "123456",
    });
    const second = await mb.recoverPermanentMailbox({
      name: "Test Owner",
      username: "permowner",
      passcode: "123456",
    });
    // Access token rotates per login (same as normal recovery).
    expect(second.accessToken).not.toBe(first.accessToken);
    // Passcode hash in Redis still matches the env passcode — never rotated.
    const stored = await redis.get<string>(keys.mailboxRecovery("permowner"));
    expect(stored).toBe(hashWithPepper("123456"));
  });

  it("rejects a wrong passcode with 401 and reveals nothing", async () => {
    await expect(
      mb.recoverPermanentMailbox({ name: "Test Owner", username: "permowner", passcode: "000000" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("rejects a wrong name with 401", async () => {
    await expect(
      mb.recoverPermanentMailbox({ name: "Impostor", username: "permowner", passcode: "123456" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("matches the username case-insensitively", async () => {
    expect(mb.isPermanentMailbox("PermOwner")).toBe(true);
    expect(mb.isPermanentMailbox("PERMOWNER")).toBe(true);
    expect(mb.isPermanentMailbox("someoneelse")).toBe(false);
    const out = await mb.recoverPermanentMailbox({
      name: "test owner",
      username: "PERMOWNER",
      passcode: "123456",
    });
    expect(out.username).toBe("permowner");
  });

  it("login works through the real POST /api/mailbox/recover route", async () => {
    const res = await POST_recover(
      jsonReq("http://localhost/api/mailbox/recover", {
        name: "Test Owner",
        username: "permowner",
        passcode: "123456",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.username).toBe("permowner");
    expect(json.data.recoveryPasscode).toBe("123456");
    expect(json.data.accessToken).toBeTruthy();
  });

  it("route rejects a wrong passcode with 401", async () => {
    const res = await POST_recover(
      jsonReq("http://localhost/api/mailbox/recover", {
        name: "Test Owner",
        username: "permowner",
        passcode: "999999",
      })
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/mailbox/create reserves the permanent username (409, no leak)", async () => {
    const res = await POST_create(
      jsonReq("http://localhost/api/mailbox/create", {
        name: "Squatter",
        username: "permowner",
        durationKey: "24h",
        gender: "unspecified",
      })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("USERNAME_TAKEN");
  });

  it("Redis key TTLs are capped for Redis (logical expiry stays 2100)", async () => {
    const capped = mb.keyTtlSeconds({ expiresAt: mb.PERMANENT_EXPIRES_AT });
    expect(capped).toBeLessThanOrEqual(2147483647);
    expect(capped).toBeGreaterThan(0);
    // Normal mailboxes are unaffected by the cap.
    const normal = mb.keyTtlSeconds({ expiresAt: Date.now() + 86400_000 });
    expect(normal).toBeLessThanOrEqual(86401);
  });

  it("cleanup cron skips the permanent mailbox but still purges normal ones", async () => {
    // Control: a normal mailbox whose active-index entry is stale gets purged.
    const created = await mb.createMailbox({
      name: "Stale",
      username: "stalebox1",
      durationKey: "24h",
      gender: "unspecified",
    });
    void created;
    await redis.zadd(keys.activeIndex(), {
      score: Date.now() - 30 * 86400_000,
      member: "stalebox1",
    });

    // Force the permanent mailbox's index entry stale too.
    await mb.recoverPermanentMailbox({
      name: "Test Owner",
      username: "permowner",
      passcode: "123456",
    });
    await redis.zadd(keys.activeIndex(), {
      score: Date.now() - 30 * 86400_000,
      member: "permowner",
    });

    const purged = await mb.cleanupInactiveMailboxes();
    expect(purged).toBeGreaterThanOrEqual(1);

    // Normal mailbox is gone...
    expect(await mb.getMailbox("stalebox1")).toBeNull();
    // ...permanent mailbox survives with its permanence intact.
    const perm = await mb.getMailbox("permowner");
    expect(perm).not.toBeNull();
    expect(perm!.isPermanent).toBe(true);
    expect(perm!.expiresAt).toBe(mb.PERMANENT_EXPIRES_AT);
  });
});
