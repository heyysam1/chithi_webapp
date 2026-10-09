import { describe, it, expect } from "vitest";
import { countGraphemes } from "../src/lib/sanitize";
import { toLocalDateTimeInputValue } from "../src/components/letter/AdvancedModePanel";
import { LETTER_BODY_MAX } from "../src/lib/constants";

describe("FRONT-04: capsule datetime-local timezone fix", () => {
  it("formats as YYYY-MM-DDTHH:MM", () => {
    expect(toLocalDateTimeInputValue(1786220400000)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
    );
  });

  it("uses local wall-clock fields, not UTC", () => {
    const ms = 1786220430000;
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(toLocalDateTimeInputValue(ms)).toBe(expected);
  });

  it("round-trips through datetime-local parsing with no timezone shift", () => {
    // datetime-local parses its value as LOCAL time. The old code built the
    // value with toISOString() (UTC), so parse-back differed by the local UTC
    // offset (6h in Asia/Dhaka). This must now be exact to the minute.
    const samples = [
      1786220430000,
      Date.now() + 60_000,
      Date.now() + 72 * 3600_000,
    ];
    for (const ms of samples) {
      const parsedBack = new Date(toLocalDateTimeInputValue(ms)).getTime();
      expect(parsedBack).toBe(ms - (ms % 60_000));
    }
  });

  it("min bound (+60s) parses back to a time at or after now", () => {
    const before = Date.now();
    const parsedBack = new Date(
      toLocalDateTimeInputValue(before + 60_000)
    ).getTime();
    expect(parsedBack).toBeGreaterThanOrEqual(before - (before % 60_000));
  });
});

describe("FRONT-04: grapheme-consistent length counting (H4)", () => {
  it("counts emoji as single graphemes, not UTF-16 code units", () => {
    expect("👍".length).toBe(2);
    expect(countGraphemes("👍")).toBe(1);
    expect(countGraphemes("👍👍")).toBe(2);
  });

  it("counts ZWJ sequences and flags as one grapheme", () => {
    expect(countGraphemes("👨‍👩‍👧‍👦")).toBe(1);
    expect(countGraphemes("🇧🇩")).toBe(1);
  });

  it("counts Bengali conjuncts and combining marks as one grapheme", () => {
    expect(countGraphemes("ক্ষ")).toBe(1); // ক + ্ + ষ
    expect(countGraphemes("á")).toBe(1); // a + combining acute
    expect(countGraphemes("")).toBe(0);
    expect(countGraphemes("hello")).toBe(5);
  });

  it("does not wrongly reject emoji-heavy letters under the grapheme cap", () => {
    // The old submit check used body.length (UTF-16): 1500 emoji = 3000
    // code units > 2000, rejected even though the UI counter showed 1500/2000.
    const emojiHeavy = "👍".repeat(1500);
    expect(emojiHeavy.length).toBeGreaterThan(LETTER_BODY_MAX);
    expect(countGraphemes(emojiHeavy)).toBeLessThanOrEqual(LETTER_BODY_MAX);
  });

  it("still rejects letters over the grapheme cap", () => {
    expect(countGraphemes("a".repeat(2001))).toBeGreaterThan(LETTER_BODY_MAX);
  });
});
