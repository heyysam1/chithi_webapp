import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  timingSafeEqual,
  hashWithPepper,
  normaliseRiddleAnswer,
} from "../src/lib/crypto";
import { toPlainText, stripUrls, countGraphemes } from "../src/lib/sanitize";
import { remainingTtlSeconds } from "../src/lib/mailbox";
import { formatCountdown } from "../src/lib/time";
import { PERMANENT_EXPIRES_AT } from "../src/lib/constants";
import {
  savePasscode,
  savePasscodeQuiet,
  readPasscode,
  readOneTimePasscode,
} from "../src/lib/passcodeStorage";
import { InMemoryRedisShim } from "../src/lib/redis";

describe("HYG-03: Unit Utilities & Cryptographic Functions", () => {
  describe("normaliseRiddleAnswer", () => {
    it("lowercases and trims whitespace", () => {
      expect(normaliseRiddleAnswer("  Hello World  ")).toBe("hello world");
      expect(normaliseRiddleAnswer("FOUR")).toBe("four");
    });

    it("collapses multiple consecutive internal whitespace into single space", () => {
      expect(normaliseRiddleAnswer("The    Secret    Key")).toBe("the secret key");
    });

    it("handles Bengali script and Unicode NFC normalization", () => {
      const bengaliInput = "  মেঘনা নদী  ";
      expect(normaliseRiddleAnswer(bengaliInput)).toBe("মেঘনা নদী");
    });

    it("handles empty or whitespace-only strings gracefully", () => {
      expect(normaliseRiddleAnswer("   ")).toBe("");
      expect(normaliseRiddleAnswer("")).toBe("");
    });
  });

  describe("timingSafeEqual", () => {
    it("returns true for identical strings", () => {
      const a = "a-very-secret-token-123456789";
      const b = "a-very-secret-token-123456789";
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    it("returns false for strings of same length but different content", () => {
      const a = "a-very-secret-token-123456789";
      const b = "a-very-secret-token-987654321";
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    it("returns false for strings of different lengths without throwing", () => {
      const a = "short";
      const b = "much-longer-string-to-compare";
      expect(timingSafeEqual(a, b)).toBe(false);
      expect(timingSafeEqual(b, a)).toBe(false);
    });

    it("handles empty strings correctly", () => {
      expect(timingSafeEqual("", "")).toBe(true);
      expect(timingSafeEqual("", "not-empty")).toBe(false);
      expect(timingSafeEqual("not-empty", "")).toBe(false);
    });
  });

  describe("hashWithPepper determinism", () => {
    it("returns identical 64-char hex hash for identical input", () => {
      const secret = "super-secret-user-passcode-or-token";
      const hash1 = hashWithPepper(secret);
      const hash2 = hashWithPepper(secret);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("returns divergent hashes for different secrets", () => {
      const hash1 = hashWithPepper("passcode_1");
      const hash2 = hashWithPepper("passcode_2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("toPlainText Bengali preservation and HTML/URL stripping", () => {
    it("strictly preserves Bengali characters, ligatures, and ZWNJ (\\u200C)", () => {
      const bengaliPhrase = "আমি তোমাকে ভালোবাস\u200Cি এবং চিঠির কথা মনে পড়ে";
      const cleaned = toPlainText(bengaliPhrase);
      expect(cleaned).toContain("\u200C");
      expect(cleaned).toBe(bengaliPhrase.normalize("NFC"));
    });

    it("preserves Bengali Zero Width Joiner (\\u200D)", () => {
      const phraseWithZWJ = "যুক্তাক্ষর\u200Dলিপি";
      const cleaned = toPlainText(phraseWithZWJ);
      expect(cleaned).toContain("\u200D");
    });

    it("strips malicious HTML and script tags", () => {
      const dirty = "<script>alert('xss')</script>Hello <b>world</b> <img src=x onerror=alert(1)>";
      const cleaned = toPlainText(dirty);
      expect(cleaned).not.toContain("<script>");
      expect(cleaned).not.toContain("<img");
      expect(cleaned).not.toContain("<b>");
      expect(cleaned).toContain("Hello world");
    });

    it("strips URLs and replaces with [link removed]", () => {
      const textWithUrls = "Visit https://chithi.app or www.malicious.com today!";
      const cleaned = toPlainText(textWithUrls);
      expect(cleaned).toContain("[link removed]");
      expect(cleaned).not.toContain("https://chithi.app");
      expect(cleaned).not.toContain("www.malicious.com");
    });

    it("enforces maxChars parameter safely with grapheme awareness", () => {
      const text = "1234567890".repeat(20);
      const cleaned = toPlainText(text, 50);
      expect(countGraphemes(cleaned)).toBeLessThanOrEqual(50);
    });
  });

  describe("remainingTtlSeconds", () => {
    it("calculates remaining TTL accurately from expiresAt", () => {
      const now = Date.now();
      const mailbox = { expiresAt: now + 3600 * 1000 };
      const ttl = remainingTtlSeconds(mailbox);
      expect(ttl).toBeGreaterThanOrEqual(3595);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it("floors at 1 second even if expiresAt is in the past", () => {
      const mailboxInPast = { expiresAt: Date.now() - 5000 };
      expect(remainingTtlSeconds(mailboxInPast)).toBe(1);
    });

    it("floors at 1 second if expiresAt is 0", () => {
      const mailboxZero = { expiresAt: 0 };
      expect(remainingTtlSeconds(mailboxZero)).toBe(1);
    });
  });

  describe("HYG-04: InMemoryRedisShim correctness and type safety", () => {
    it("eval throws error stating Lua scripts require a real Redis", async () => {
      const shim = new InMemoryRedisShim();
      await expect(
        shim.eval("redis.call('get', KEYS[1])", ["test_key"], [])
      ).rejects.toThrow("Lua scripts require a real Redis; set UPSTASH_REDIS_REST_URL");
    });

    it("set throws WRONGTYPE when key is already used as a hash", async () => {
      const shim = new InMemoryRedisShim();
      await shim.hincrby("type_conflict_key", "field1", 1);
      await expect(
        shim.set("type_conflict_key", "simple_string_val")
      ).rejects.toThrow("WRONGTYPE Operation against a key holding the wrong kind of value");
    });

    it("set throws WRONGTYPE when key is already used as a zset", async () => {
      const shim = new InMemoryRedisShim();
      await shim.zadd("zset_conflict_key", { score: 100, member: "item1" });
      await expect(
        shim.set("zset_conflict_key", "simple_string_val")
      ).rejects.toThrow("WRONGTYPE Operation against a key holding the wrong kind of value");
    });

    it("hincrby throws WRONGTYPE when key is already used as a string", async () => {
      const shim = new InMemoryRedisShim();
      await shim.set("string_key", "simple_val");
      await expect(
        shim.hincrby("string_key", "field1", 1)
      ).rejects.toThrow("WRONGTYPE Operation against a key holding the wrong kind of value");
    });

    it("zadd throws WRONGTYPE when key is already used as a string", async () => {
      const shim = new InMemoryRedisShim();
      await shim.set("string_key_for_zadd", "simple_val");
      await expect(
        shim.zadd("string_key_for_zadd", { score: 10, member: "m1" })
      ).rejects.toThrow("WRONGTYPE Operation against a key holding the wrong kind of value");
    });
  });
});

describe("M1: formatCountdown Infinite boundary", () => {
  it("returns Infinite at exactly PERMANENT_EXPIRES_AT (en)", () => {
    expect(PERMANENT_EXPIRES_AT).toBe(4102444800000);
    expect(formatCountdown(PERMANENT_EXPIRES_AT, "en")).toBe("Infinite");
  });

  it("returns Infinite at exactly PERMANENT_EXPIRES_AT (bn)", () => {
    expect(formatCountdown(PERMANENT_EXPIRES_AT, "bn")).toBe("অসীম");
  });

  it("returns Infinite above PERMANENT_EXPIRES_AT", () => {
    expect(formatCountdown(PERMANENT_EXPIRES_AT + 1, "en")).toBe("Infinite");
    expect(formatCountdown(PERMANENT_EXPIRES_AT + 1, "bn")).toBe("অসীম");
  });

  it("returns a numeric countdown 1ms below the boundary (not Infinite)", () => {
    const justBelow = PERMANENT_EXPIRES_AT - 1;
    expect(formatCountdown(justBelow, "en")).not.toBe("Infinite");
    expect(formatCountdown(justBelow, "bn")).not.toBe("অসীম");
    // Still a far-future numeric countdown, not "Expired".
    expect(formatCountdown(justBelow, "en")).not.toBe("Expired");
  });
});

describe("M2: savePasscode vs savePasscodeQuiet storage behavior", () => {
  const makeStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    };
  };

  beforeEach(() => {
    // passcodeStorage no-ops without window; give it mocked browser storage.
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = makeStorage();
    (globalThis as any).sessionStorage = makeStorage();
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).sessionStorage;
  });

  it("savePasscode writes to BOTH localStorage and sessionStorage", () => {
    savePasscode("someone", "111222");
    // Persistent copy for the profile modal.
    expect(readPasscode("someone")).toBe("111222");
    // One-time flag for the inbox key card.
    expect(readOneTimePasscode("someone")).toBe("111222");
  });

  it("savePasscodeQuiet writes ONLY to localStorage (no key-card flag)", () => {
    savePasscodeQuiet("someone", "333444");
    // Persistent copy still there.
    expect(readPasscode("someone")).toBe("333444");
    // No session flag, so the one-time key card does not pop up.
    expect(readOneTimePasscode("someone")).toBeNull();
  });

  it("quiet save after a loud save does not leak a session flag", () => {
    savePasscode("someone", "555666");
    expect(readOneTimePasscode("someone")).toBe("555666");
    sessionStorage.removeItem("chithi:passcode:someone");
    savePasscodeQuiet("someone", "777888");
    expect(readPasscode("someone")).toBe("777888");
    expect(readOneTimePasscode("someone")).toBeNull();
  });
});
