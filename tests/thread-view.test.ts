import { describe, it, expect } from "vitest";
import { truncateSnippet, THREAD_SNIPPET_LENGTH } from "@/lib/thread";

describe("truncateSnippet", () => {
  it("returns empty string for missing input", () => {
    expect(truncateSnippet(undefined)).toBe("");
    expect(truncateSnippet(null)).toBe("");
    expect(truncateSnippet("")).toBe("");
    expect(truncateSnippet("   \n\t ")).toBe("");
  });

  it("collapses whitespace and trims", () => {
    expect(truncateSnippet("hello   world\nnew\tline")).toBe("hello world new line");
  });

  it("leaves short text unchanged", () => {
    expect(truncateSnippet("a short letter")).toBe("a short letter");
  });

  it("leaves text of exactly maxLength unchanged", () => {
    const text = "x".repeat(THREAD_SNIPPET_LENGTH);
    expect(truncateSnippet(text)).toBe(text);
    expect(truncateSnippet(text).endsWith("…")).toBe(false);
  });

  it("truncates long text with an ellipsis", () => {
    const text = "y".repeat(THREAD_SNIPPET_LENGTH + 50);
    const out = truncateSnippet(text);
    expect(out.endsWith("…")).toBe(true);
    // 120 chars + ellipsis, measured in code points
    expect(Array.from(out).length).toBe(THREAD_SNIPPET_LENGTH + 1);
  });

  it("respects a custom maxLength", () => {
    const out = truncateSnippet("abcdefghijklmnopqrstuvwxyz", 10);
    expect(out).toBe("abcdefghij…");
  });

  it("never splits a surrogate pair (emoji-safe)", () => {
    const text = "😀".repeat(THREAD_SNIPPET_LENGTH + 10);
    const out = truncateSnippet(text);
    // Array.from keeps each emoji as one unit; no lone surrogates
    expect(Array.from(out).length).toBe(THREAD_SNIPPET_LENGTH + 1);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out)).toBe(false);
  });
});
