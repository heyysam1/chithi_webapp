import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  draftKey,
  serializeDraft,
  parseDraft,
  readDraft,
  writeDraft,
  removeDraft,
  createDraftSaver,
  isEmptyDraftBody,
  DRAFT_KEY_PREFIX,
  type DraftInput,
  type StorageLike,
} from "@/lib/draft";

/** In-memory stand-in for localStorage. */
function makeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

function sampleInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    body: "মনের কথা",
    paper: "parchment",
    stamp: "wax",
    font: "handwriting1",
    hints: ["hint one", ""],
    isAnonymous: true,
    senderName: "",
    mode: {
      lockKind: "none",
      unlockAt: 0,
      riddleQuestion: "",
      riddleAnswer: "",
      burnAfterReading: false,
    },
    ...overrides,
  };
}

describe("draftKey", () => {
  it("namespaces drafts per recipient", () => {
    expect(draftKey("sami")).toBe(`${DRAFT_KEY_PREFIX}sami`);
    expect(draftKey("rimi")).toBe(`${DRAFT_KEY_PREFIX}rimi`);
    expect(draftKey("sami")).not.toBe(draftKey("rimi"));
  });

  it("lowercases and trims the recipient", () => {
    expect(draftKey("  Sami ")).toBe(draftKey("sami"));
  });

  it("uses a shared bottle slot when there is no recipient", () => {
    expect(draftKey(undefined)).toBe(`${DRAFT_KEY_PREFIX}bottle`);
    expect(draftKey("")).toBe(`${DRAFT_KEY_PREFIX}bottle`);
  });
});

describe("serializeDraft / parseDraft", () => {
  it("round-trips all fields", () => {
    const input = sampleInput();
    const draft = parseDraft(serializeDraft(input));
    expect(draft).not.toBeNull();
    expect(draft!.body).toBe(input.body);
    expect(draft!.paper).toBe(input.paper);
    expect(draft!.stamp).toBe(input.stamp);
    expect(draft!.font).toBe(input.font);
    expect(draft!.hints).toEqual(input.hints);
    expect(draft!.isAnonymous).toBe(true);
    expect(draft!.mode.lockKind).toBe("none");
    expect(draft!.version).toBe(1);
    expect(typeof draft!.updatedAt).toBe("number");
  });

  it("returns null for missing input", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(undefined)).toBeNull();
    expect(parseDraft("")).toBeNull();
  });

  it("recovers from corrupted JSON", () => {
    expect(parseDraft("{not json")).toBeNull();
    expect(parseDraft("[1,2,3")).toBeNull();
  });

  it("rejects wrong versions and non-objects", () => {
    expect(parseDraft(JSON.stringify({ version: 2, body: "x" }))).toBeNull();
    expect(parseDraft(JSON.stringify({ body: "x" }))).toBeNull();
    expect(parseDraft(JSON.stringify([1, 2]))).toBeNull();
    expect(parseDraft(JSON.stringify("hello"))).toBeNull();
  });

  it("rejects drafts without a body or with an unknown lock kind", () => {
    expect(parseDraft(JSON.stringify({ version: 1 }))).toBeNull();
    expect(
      parseDraft(
        JSON.stringify({ version: 1, body: "x", mode: { lockKind: "exploding" } })
      )
    ).toBeNull();
  });

  it("falls back to composer defaults for missing optional fields", () => {
    const draft = parseDraft(
      JSON.stringify({ version: 1, body: "x", mode: { lockKind: "none" } })
    );
    expect(draft).not.toBeNull();
    expect(draft!.paper).toBe("parchment");
    expect(draft!.stamp).toBe("wax");
    expect(draft!.font).toBe("handwriting1");
    expect(draft!.hints).toEqual([]);
    expect(draft!.isAnonymous).toBe(true);
  });
});

describe("writeDraft / readDraft / removeDraft", () => {
  it("skips empty or whitespace-only bodies", () => {
    const storage = makeStorage();
    expect(writeDraft(storage, "k", sampleInput({ body: "   " }))).toBe(false);
    expect(writeDraft(storage, "k", sampleInput({ body: "" }))).toBe(false);
    expect(storage.map.size).toBe(0);
  });

  it("writes and reads back a draft", () => {
    const storage = makeStorage();
    expect(writeDraft(storage, "k", sampleInput())).toBe(true);
    const draft = readDraft(storage, "k");
    expect(draft?.body).toBe("মনের কথা");
  });

  it("never throws on quota errors", () => {
    const storage = makeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => writeDraft(storage, "k", sampleInput())).not.toThrow();
    expect(writeDraft(storage, "k", sampleInput())).toBe(false);
  });

  it("readDraft returns null for corrupt entries instead of throwing", () => {
    const storage = makeStorage();
    storage.map.set("k", "{broken");
    expect(readDraft(storage, "k")).toBeNull();
  });

  it("removeDraft deletes the entry and never throws", () => {
    const storage = makeStorage();
    writeDraft(storage, "k", sampleInput());
    expect(() => removeDraft(storage, "k")).not.toThrow();
    expect(readDraft(storage, "k")).toBeNull();
  });
});

describe("isEmptyDraftBody", () => {
  it("treats whitespace-only as empty", () => {
    expect(isEmptyDraftBody("")).toBe(true);
    expect(isEmptyDraftBody("  \n\t ")).toBe(true);
    expect(isEmptyDraftBody(" x ")).toBe(false);
  });
});

describe("createDraftSaver (debounce)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid schedules into a single write with the latest input", () => {
    const storage = makeStorage();
    const saver = createDraftSaver(storage, "k", 1000);
    saver.schedule(sampleInput({ body: "one" }));
    saver.schedule(sampleInput({ body: "two" }));
    saver.schedule(sampleInput({ body: "three" }));
    expect(storage.map.size).toBe(0); // nothing written yet
    vi.advanceTimersByTime(1000);
    expect(storage.map.size).toBe(1);
    expect(readDraft(storage, "k")?.body).toBe("three");
  });

  it("flush() writes pending input immediately", () => {
    const storage = makeStorage();
    const saver = createDraftSaver(storage, "k", 1000);
    saver.schedule(sampleInput({ body: "pending" }));
    saver.flush();
    expect(readDraft(storage, "k")?.body).toBe("pending");
  });

  it("cancel() drops the pending write", () => {
    const storage = makeStorage();
    const saver = createDraftSaver(storage, "k", 1000);
    saver.schedule(sampleInput({ body: "dropped" }));
    saver.cancel();
    vi.advanceTimersByTime(5000);
    expect(storage.map.size).toBe(0);
  });

  it("still skips empty bodies through the debounced path", () => {
    const storage = makeStorage();
    const saver = createDraftSaver(storage, "k", 1000);
    saver.schedule(sampleInput({ body: "   " }));
    vi.advanceTimersByTime(1000);
    expect(storage.map.size).toBe(0);
  });
});
