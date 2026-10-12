import { describe, it, expect } from "vitest";
import { paginateLetterBody } from "../src/lib/paginate";

describe("paginateLetterBody", () => {
  it("returns short bodies as a single unchanged page", () => {
    const body = "Hello, this is a short letter.";
    expect(paginateLetterBody(body)).toEqual([body]);
  });

  it("returns an empty body as one empty page", () => {
    expect(paginateLetterBody("")).toEqual([""]);
  });

  it("packs paragraphs up to the budget", () => {
    const p1 = "a".repeat(300);
    const p2 = "b".repeat(300);
    const p3 = "c".repeat(300);
    const pages = paginateLetterBody(`${p1}\n\n${p2}\n\n${p3}`, 650);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toBe(`${p1}\n\n${p2}`);
    expect(pages[1]).toBe(p3);
  });

  it("splits a long paragraph on word boundaries", () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const pages = paginateLetterBody(words, 200);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(200);
      expect(page.startsWith(" ")).toBe(false);
    }
    // No word is lost or broken.
    expect(pages.join(" ").replace(/\s+/g, " ")).toBe(words);
  });

  it("hard-splits a single token longer than the budget", () => {
    const token = "x".repeat(1500);
    const pages = paginateLetterBody(token, 600);
    expect(pages.map((p) => p.length)).toEqual([600, 600, 300]);
    expect(pages.join("")).toBe(token);
  });

  it("keeps Bengali text intact across pages", () => {
    const para = "আমি তোমাকে অনেক ভালোবাসি। ".repeat(60);
    const pages = paginateLetterBody(para, 300);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("").replace(/\s+/g, "")).toBe(para.replace(/\s+/g, ""));
  });
});
