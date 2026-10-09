import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp, getRateKey, getViewerHash } from "../src/lib/api";
import {
  checkRateLimit,
  recordAbuseViolation,
  LimiterBucket,
} from "../src/lib/ratelimit";
import { createMailbox } from "../src/lib/mailbox";
import { POST as exchangePOST } from "../src/app/api/session/exchange/route";
import { resolveBottleSender } from "../src/lib/bottleSender";

function reqWithHeaders(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/_test", {
    method: "POST",
    headers,
  });
}

describe("SEC-FIX: client IP extraction must not trust the spoofable leftmost XFF entry", () => {
  it("prefers x-real-ip (platform-authoritative) over x-forwarded-for", () => {
    const req = reqWithHeaders({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.9, 203.0.113.7",
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("uses the rightmost XFF entry — the one the closest proxy appended", () => {
    const req = reqWithHeaders({
      "x-forwarded-for": "198.51.100.9, 192.0.2.44, 203.0.113.7",
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("tolerates empty tokens and trailing commas in XFF", () => {
    const req = reqWithHeaders({ "x-forwarded-for": "198.51.100.9, ,203.0.113.7," });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to 'unknown' when no IP headers are present (fail-closed shared bucket)", () => {
    const req = reqWithHeaders({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("getRateKey is identical for requests with different spoofed prefixes but the same real (rightmost) IP", () => {
    const a = reqWithHeaders({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    const b = reqWithHeaders({ "x-forwarded-for": "2.2.2.2, 203.0.113.7" });
    expect(getRateKey(a)).toBe(getRateKey(b));
  });

  it("getRateKey differs when the real (rightmost) IP differs", () => {
    const a = reqWithHeaders({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    const b = reqWithHeaders({ "x-forwarded-for": "1.1.1.1, 203.0.113.8" });
    expect(getRateKey(a)).not.toBe(getRateKey(b));
  });

  it("getViewerHash ignores a rotating spoofed prefix (reaction/flood/pair-guard identity is stable)", () => {
    const headers = { "user-agent": "test-agent/1.0" };
    const a = reqWithHeaders({
      ...headers,
      "x-forwarded-for": "9.9.9.1, 203.0.113.7",
    });
    const b = reqWithHeaders({
      ...headers,
      "x-forwarded-for": "9.9.9.2, 203.0.113.7",
    });
    expect(getViewerHash(a)).toBe(getViewerHash(b));
  });
});

describe("SEC-FIX: new limiter buckets are registered and callable", () => {
  it.each<LimiterBucket>(["exchange", "settings"])(
    "bucket '%s' is accepted by checkRateLimit",
    async (bucket) => {
      const result = await checkRateLimit(bucket, "ratelfixtest-bucket-probe");
      expect(result.success).toBe(true);
    }
  );
});

describe("SEC-FIX: recovery abuse block is scoped per (username, IP), not per bare username", () => {
  const victim = "ratelfixtestvictim";
  const attackerIpKey = "ratelfixtest-attacker-ip";
  const ownerIpKey = "ratelfixtest-owner-ip";

  it("an attacker tripping the abuse block does not block the real owner", async () => {
    const attackerScope = `recover:${victim}:${attackerIpKey}`;
    const ownerScope = `recover:${victim}:${ownerIpKey}`;

    // Attacker exhausts their own (username, IP) budget: 3 rate-limit
    // violations trip the 15-minute abuse block for THEIR scope only.
    await recordAbuseViolation(attackerScope);
    await recordAbuseViolation(attackerScope);
    await recordAbuseViolation(attackerScope);

    const attackerCheck = await checkRateLimit("recover_user", attackerScope);
    expect(attackerCheck.success).toBe(false);

    // The legitimate owner, on a different IP, is unaffected.
    const ownerCheck = await checkRateLimit("recover_user", ownerScope);
    expect(ownerCheck.success).toBe(true);
  });
});

describe("SEC-FIX: bottle send never trusts a logged-out sender's claimed username", () => {
  it("returns undefined when there is no session cookie, even with a claimed senderUsername", () => {
    const req = reqWithHeaders({});
    expect(resolveBottleSender(req, "somevictim")).toBeUndefined();
  });

  it("returns undefined when there is no session cookie and no claim", () => {
    const req = reqWithHeaders({});
    expect(resolveBottleSender(req, undefined)).toBeUndefined();
  });

  it("returns the session cookie username (not the claim) when a session exists", () => {
    const req = reqWithHeaders({ cookie: "chithi_s_sami=realtoken123" });
    expect(resolveBottleSender(req, "somevictim")).toBe("sami");
  });

  it("honours the claim only as a disambiguator among the caller's own session cookies", () => {
    const req = reqWithHeaders({
      cookie: "chithi_s_sami=tok1; chithi_s_rimi=tok2",
    });
    expect(resolveBottleSender(req, "rimi")).toBe("rimi");
    // A claimed name with no matching session cookie is ignored.
    expect(resolveBottleSender(req, "stranger")).toBe("sami");
  });
});

describe("SEC-FIX: /api/session/exchange is rate-limited and not a username oracle", () => {
  const username = "ratelfixexch1";

  it("setup: create a mailbox to exchange against", async () => {
    const created = await createMailbox({
      name: "Exchange Test",
      username,
      durationKey: "24h",
      gender: "unspecified",
    });
    expect(created.accessToken).toBeTruthy();
  });

  function exchangeReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/session/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("nonexistent username returns 403, not 404 (no existence oracle)", async () => {
    const res = await exchangePOST(exchangeReq({ username: "ghostuser999", key: "x" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("wrong key on an existing mailbox returns 403, not 410/404", async () => {
    const res = await exchangePOST(exchangeReq({ username, key: "wrong-key" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("correct key still exchanges successfully (legit users unaffected)", async () => {
    const created = await createMailbox({
      name: "Exchange Test 2",
      username: "ratelfixexch2",
      durationKey: "24h",
      gender: "unspecified",
    });
    const res = await exchangePOST(
      exchangeReq({ username: "ratelfixexch2", key: created.accessToken })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.exchanged).toBe(true);
  });
});
