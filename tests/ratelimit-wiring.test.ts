import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const checkRateLimitMock = vi.fn(
  async (_bucket: string, _identifier: string) => ({
    success: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60_000,
  })
);

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) =>
    (checkRateLimitMock as (...a: unknown[]) => unknown)(...args),
}));

const requireMailboxOwnerMock = vi.fn(async () => ({
  mailbox: { usernameLower: "wiringuser" },
  token: "tok",
}));

vi.mock("@/lib/auth", () => ({
  requireMailboxOwner: (...args: unknown[]) =>
    (requireMailboxOwnerMock as (...a: unknown[]) => unknown)(...args),
}));

const reactToLetterMock = vi.fn(async () => ({
  reaction: "heart",
  hearts: 1,
  heartCracks: 0,
}));

vi.mock("@/lib/letters", () => ({
  reactToLetter: (...args: unknown[]) =>
    (reactToLetterMock as (...a: unknown[]) => unknown)(...args),
}));

const updateMailboxSettingsMock = vi.fn(async () => ({
  acceptsBottles: false,
}));

vi.mock("@/lib/mailbox", () => ({
  updateMailboxSettings: (...args: unknown[]) =>
    (updateMailboxSettingsMock as (...a: unknown[]) => unknown)(...args),
  // Not exercised in wiring tests; present so the recover route module loads.
  recoverMailbox: vi.fn(async () => {
    throw new Error("recoverMailbox is stubbed in wiring tests");
  }),
}));

import { POST as reactLetterPOST } from "@/app/api/letters/[id]/react/route";
import { PATCH as settingsPATCH } from "@/app/api/mailbox/settings/route";
import { POST as exchangePOST } from "@/app/api/session/exchange/route";
import { POST as recoverPOST } from "@/app/api/mailbox/recover/route";

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SEC-FIX wiring: routes apply their rate limiter before business logic", () => {
  it("POST /api/letters/[id]/react checks the 'react' bucket before reacting", async () => {
    const res = await reactLetterPOST(
      jsonReq("http://localhost/api/letters/abc123/react?username=wiringuser", {
        reaction: "heart",
      }),
      { params: Promise.resolve({ id: "abc123" }) }
    );

    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith("react", expect.any(String));
    expect(reactToLetterMock).toHaveBeenCalledTimes(1);
    // Limiter runs before the reaction write.
    const rlOrder = checkRateLimitMock.mock.invocationCallOrder[0];
    const reactOrder = reactToLetterMock.mock.invocationCallOrder[0];
    expect(rlOrder).toBeDefined();
    expect(reactOrder).toBeDefined();
    expect(rlOrder as number).toBeLessThan(reactOrder as number);
  });

  it("PATCH /api/mailbox/settings checks the 'settings' bucket before updating", async () => {
    const req = new NextRequest(
      "http://localhost/api/mailbox/settings?username=wiringuser",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptsBottles: false }),
      }
    );
    const res = await settingsPATCH(req);

    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith("settings", expect.any(String));
    expect(updateMailboxSettingsMock).toHaveBeenCalledTimes(1);
    const rlOrder = checkRateLimitMock.mock.invocationCallOrder[0];
    const settingsOrder = updateMailboxSettingsMock.mock.invocationCallOrder[0];
    expect(rlOrder).toBeDefined();
    expect(settingsOrder).toBeDefined();
    expect(rlOrder as number).toBeLessThan(settingsOrder as number);
  });

  it("POST /api/session/exchange checks the 'exchange' bucket even when the body is invalid (limit runs before parse)", async () => {
    const res = await exchangePOST(jsonReq("http://localhost/api/session/exchange", {}));

    // Invalid body -> 400, but the limiter must still have run first.
    expect(res.status).toBe(400);
    expect(checkRateLimitMock).toHaveBeenCalledWith("exchange", expect.any(String));
  });

  it("POST /api/mailbox/recover scopes the 'recover_user' bucket per (username, caller IP)", async () => {
    const body = JSON.stringify({
      name: "Wiring Victim",
      username: "wiringvictim",
      passcode: "000000",
    });

    const mkReq = (ip: string) =>
      new NextRequest("http://localhost/api/mailbox/recover", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": ip },
        body,
      });

    await recoverPOST(mkReq("203.0.113.10"));
    await recoverPOST(mkReq("203.0.113.11"));

    const userBucketCalls = checkRateLimitMock.mock.calls.filter(
      (c) => c[0] === "recover_user"
    );
    expect(userBucketCalls).toHaveLength(2);

    const idA = userBucketCalls[0]?.[1];
    const idB = userBucketCalls[1]?.[1];
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    // Identifier carries the target username AND the caller identity ...
    expect(idA).toContain("wiringvictim");
    expect(idB).toContain("wiringvictim");
    // ... and differs per caller IP, so one attacker's abuse budget can
    // never lock the real owner out.
    expect(idA).not.toBe(idB);
  });
});
