import { describe, it, expect } from "vitest";
import {
  formatLettersAsText,
  buildExportFilename,
  downloadTextFile,
  formatExportDate,
  EN_EXPORT_STRINGS,
  BN_EXPORT_STRINGS,
  type ExportableLetter,
  type ExportTextOptions,
} from "../src/lib/exportLetters";

const PAPER_NAMES = {
  parchment: "Paper Parchment",
  midnight: "Paper Midnight",
  rose: "Paper Rose",
  typewriter: "Paper Typewriter",
  rainy: "Paper Rain",
} as const;

const STAMP_NAMES = {
  wax: "Crimson Wax",
  topSecret: "Top Secret",
  memory: "Hourglass",
  heartbreak: "Heartbreak",
} as const;

function makeLetter(overrides: Partial<ExportableLetter> = {}): ExportableLetter {
  return {
    id: "ltr_1",
    stamp: "wax",
    paper: "parchment",
    createdAt: 1_700_000_000_000,
    source: "direct",
    hasHints: false,
    hintCount: 0,
    lockKind: "none",
    isOpened: true,
    burnAt: null,
    burnAfterReading: false,
    reaction: null,
    published: false,
    senderName: null,
    body: "Hello world",
    ...overrides,
  };
}

function makeOpts(overrides: Partial<ExportTextOptions> = {}): ExportTextOptions {
  return {
    mailboxName: "Sami",
    username: "sami07",
    exportedAt: 1_760_000_000_000,
    locale: "en",
    paperNames: { ...PAPER_NAMES },
    stampNames: { ...STAMP_NAMES },
    ...overrides,
  };
}

describe("inbox export", () => {
  describe("formatLettersAsText", () => {
    it("renders the header with mailbox name, username, export date and count", () => {
      const text = formatLettersAsText([makeLetter()], makeOpts());
      expect(text).toContain("Chithi — Letter Export");
      expect(text).toContain("Sami (@sami07)");
      expect(text).toContain("Total letters: 1");
      expect(text).toContain("Exported on:");
    });

    it("orders letters oldest-first regardless of input order", () => {
      const newer = makeLetter({ id: "new", createdAt: 2_000, body: "newer body" });
      const older = makeLetter({ id: "old", createdAt: 1_000, body: "older body" });
      const text = formatLettersAsText([newer, older], makeOpts());
      expect(text.indexOf("older body")).toBeLessThan(text.indexOf("newer body"));
      expect(text).toContain("Letter 1 of 2");
      expect(text).toContain("Letter 2 of 2");
    });

    it("renders one section per letter with date, paper, stamp, sender and body", () => {
      const letter = makeLetter({
        body: "Line one\nLine two",
        paper: "rose",
        stamp: "heartbreak",
        senderName: "Rahim",
        source: "bottle",
      });
      const text = formatLettersAsText([letter], makeOpts());
      expect(text).toContain("Paper: Paper Rose");
      expect(text).toContain("Stamp: Heartbreak");
      expect(text).toContain("From: Rahim");
      expect(text).toContain("Via: Drift bottle");
      expect(text).toContain("Date:");
      expect(text).toContain("Line one\nLine two");
    });

    it("uses the anonymous label when there is no sender name", () => {
      const text = formatLettersAsText([makeLetter({ senderName: null })], makeOpts());
      expect(text).toContain("From: Anonymous");
      const blank = formatLettersAsText(
        [makeLetter({ senderName: "   " })],
        makeOpts()
      );
      expect(blank).toContain("From: Anonymous");
    });

    it("shows a distinct message and no letter sections for an empty inbox", () => {
      const text = formatLettersAsText([], makeOpts());
      expect(text).toContain("No letters to export.");
      expect(text).not.toContain("Letter 1 of");
      expect(text).toContain("Total letters: 0");
      expect(text).toContain("— End of export —");
    });

    it("preserves special characters, emoji and newlines in the body verbatim", () => {
      const body = "প্রিয় <বন্ধু> & \"friends\" — emoji 😊\n\ttabbed\nnew line";
      const text = formatLettersAsText([makeLetter({ body })], makeOpts());
      expect(text).toContain(body);
    });

    it("renders reply info only when replyTo is present", () => {
      const withReply = makeLetter({ replyTo: "ltr_0" });
      const text = formatLettersAsText(
        [withReply],
        makeOpts({ replyDates: { ltr_0: 1_699_000_000_000 } })
      );
      expect(text).toContain("In reply to letter from:");

      const idOnly = formatLettersAsText([withReply], makeOpts());
      expect(idOnly).toContain("In reply to letter from: #ltr_0");

      const withoutReply = formatLettersAsText([makeLetter()], makeOpts());
      expect(withoutReply).not.toContain("In reply to");
    });

    it("renders the scheduled line only when scheduledFor is present", () => {
      const scheduled = makeLetter({ scheduledFor: 1_800_000_000_000 });
      const text = formatLettersAsText([scheduled], makeOpts());
      expect(text).toContain("Scheduled for:");

      const plain = formatLettersAsText([makeLetter()], makeOpts());
      expect(plain).not.toContain("Scheduled for:");
    });

    it("renders reactions when present", () => {
      const heart = formatLettersAsText(
        [makeLetter({ reaction: "heart" })],
        makeOpts()
      );
      expect(heart).toContain("Reaction: heart");

      const crack = formatLettersAsText(
        [makeLetter({ reaction: "heartCrack" })],
        makeOpts()
      );
      expect(crack).toContain("Reaction: heartbreak");

      const none = formatLettersAsText([makeLetter()], makeOpts());
      expect(none).not.toContain("Reaction:");
    });

    it("falls back to the raw id when a paper or stamp name is missing", () => {
      const text = formatLettersAsText(
        [makeLetter({ paper: "rainy" })],
        makeOpts({ paperNames: {} as ExportTextOptions["paperNames"] })
      );
      expect(text).toContain("Paper: rainy");
    });

    it("applies Bengali strings when locale is bn", () => {
      const text = formatLettersAsText(
        [makeLetter({ senderName: null })],
        makeOpts({ locale: "bn" })
      );
      expect(text).toContain(BN_EXPORT_STRINGS.title);
      expect(text).toContain("প্রেরক");
      expect(text).not.toContain(EN_EXPORT_STRINGS.title);
    });

    it("accepts string overrides for any label", () => {
      const text = formatLettersAsText(
        [],
        makeOpts({ strings: { emptyInbox: "Nothing here." } })
      );
      expect(text).toContain("Nothing here.");
    });
  });

  describe("buildExportFilename", () => {
    it("builds chithi-<username>-<yyyy-mm-dd>.txt", () => {
      // 2026-10-09T00:00:00Z in local terms may shift the day; assert shape instead.
      const name = buildExportFilename("sami07", 1_760_000_000_000);
      expect(name).toMatch(/^chithi-sami07-\d{4}-\d{2}-\d{2}\.txt$/);
    });

    it("sanitizes unsafe username characters", () => {
      const name = buildExportFilename("Sami 07!@#", 1_760_000_000_000);
      expect(name).toMatch(/^chithi-sami07-\d{4}-\d{2}-\d{2}\.txt$/);
    });

    it("falls back to 'mailbox' for an empty username", () => {
      const name = buildExportFilename("   ", 1_760_000_000_000);
      expect(name).toMatch(/^chithi-mailbox-\d{4}-\d{2}-\d{2}\.txt$/);
    });
  });

  describe("formatExportDate", () => {
    it("returns a human-readable date string", () => {
      const out = formatExportDate(1_760_000_000_000, "en");
      expect(out).toMatch(/20\d{2}/);
      expect(out.length).toBeGreaterThan(8);
    });

    it("never throws for invalid input", () => {
      expect(() => formatExportDate(NaN, "en")).not.toThrow();
    });
  });

  describe("downloadTextFile", () => {
    it("is a safe no-op outside the browser", () => {
      expect(() => downloadTextFile("x.txt", "hello")).not.toThrow();
    });
  });
});
