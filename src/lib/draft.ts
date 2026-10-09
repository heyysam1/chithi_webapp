/**
 * Letter-composer draft autosave — pure storage logic (no DOM).
 *
 * Drafts live in the browser's localStorage so a half-written letter survives
 * a refresh, a dead tab, or a dropped connection. This module owns the key
 * scheme, (de)serialization, and the debounced writer; the React hook in
 * `src/hooks/useLetterDraft.ts` wires it to the composer.
 *
 * NOTE: drafts never leave the device — nothing here touches the network.
 */

export const DRAFT_VERSION = 1 as const;
export const DRAFT_KEY_PREFIX = "chithi:draft:";
/** Autosave debounce delay (ms) used by the composer hook. */
export const DRAFT_SAVE_DEBOUNCE_MS = 1000;

export type DraftLockKind = "none" | "capsule" | "riddle";

/** Serializable subset of the composer's AdvancedModeState. */
export interface DraftMode {
  lockKind: DraftLockKind;
  unlockAt: number;
  riddleQuestion: string;
  riddleAnswer: string;
  burnAfterReading: boolean;
}

export interface LetterDraft {
  version: 1;
  body: string;
  paper: string;
  stamp: string;
  font: string;
  hints: string[];
  isAnonymous: boolean;
  senderName: string;
  mode: DraftMode;
  /** Epoch ms of the last autosave. */
  updatedAt: number;
}

/** Everything the hook needs to capture a draft (version/updatedAt are stamped on write). */
export interface DraftInput {
  body: string;
  paper: string;
  stamp: string;
  font: string;
  hints: string[];
  isAnonymous: boolean;
  senderName: string;
  mode: DraftMode;
}

/** Minimal storage surface so the logic is testable without a DOM. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Namespaced draft key, one slot per recipient. Bottle mode (no recipient)
 * shares a single `chithi:draft:bottle` slot. Lowercased so `Sami` and `sami`
 * don't fork two drafts.
 */
export function draftKey(recipientUsername?: string): string {
  const slug = (recipientUsername ?? "").trim().toLowerCase() || "bottle";
  return `${DRAFT_KEY_PREFIX}${slug}`;
}

export function serializeDraft(input: DraftInput): string {
  const draft: LetterDraft = {
    version: DRAFT_VERSION,
    body: input.body,
    paper: input.paper,
    stamp: input.stamp,
    font: input.font,
    hints: [...input.hints],
    isAnonymous: input.isAnonymous,
    senderName: input.senderName,
    mode: { ...input.mode },
    updatedAt: Date.now(),
  };
  return JSON.stringify(draft);
}

/**
 * Defensive parse: returns null for anything that isn't a well-formed draft
 * (missing/corrupt JSON, wrong version, missing body, unknown lock kind).
 * Unknown-but-harmless fields fall back to composer defaults so an older or
 * newer draft shape degrades gracefully instead of crashing restore.
 */
export function parseDraft(raw: string | null | undefined): LetterDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const d = parsed as Record<string, unknown>;
  if (d.version !== DRAFT_VERSION) return null;
  if (typeof d.body !== "string") return null;

  const mode = (d.mode ?? {}) as Record<string, unknown>;
  const lockKind = mode.lockKind;
  if (lockKind !== "none" && lockKind !== "capsule" && lockKind !== "riddle") {
    return null;
  }

  return {
    version: DRAFT_VERSION,
    body: d.body,
    paper: typeof d.paper === "string" ? d.paper : "parchment",
    stamp: typeof d.stamp === "string" ? d.stamp : "wax",
    font: typeof d.font === "string" ? d.font : "handwriting1",
    hints: Array.isArray(d.hints)
      ? d.hints.filter((h): h is string => typeof h === "string")
      : [],
    isAnonymous: d.isAnonymous !== false,
    senderName: typeof d.senderName === "string" ? d.senderName : "",
    mode: {
      lockKind,
      unlockAt: typeof mode.unlockAt === "number" ? mode.unlockAt : 0,
      riddleQuestion:
        typeof mode.riddleQuestion === "string" ? mode.riddleQuestion : "",
      riddleAnswer: typeof mode.riddleAnswer === "string" ? mode.riddleAnswer : "",
      burnAfterReading: mode.burnAfterReading === true,
    },
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : 0,
  };
}

/** An empty/whitespace body is never worth persisting. */
export function isEmptyDraftBody(body: string): boolean {
  return body.trim().length === 0;
}

/** Read a draft; never throws (corrupt entries read as "no draft"). */
export function readDraft(storage: StorageLike, key: string): LetterDraft | null {
  try {
    return parseDraft(storage.getItem(key));
  } catch {
    return null;
  }
}

/**
 * Write a draft. Returns false (without throwing) when the body is empty or
 * the write fails (quota exceeded, private mode, etc.) — a failed autosave
 * must never crash the composer.
 */
export function writeDraft(
  storage: StorageLike,
  key: string,
  input: DraftInput
): boolean {
  if (isEmptyDraftBody(input.body)) return false;
  try {
    storage.setItem(key, serializeDraft(input));
    return true;
  } catch {
    return false;
  }
}

/** Delete a draft; never throws. */
export function removeDraft(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore — a missing/failed delete is not worth surfacing.
  }
}

/**
 * Debounced writer so rapid keystrokes don't hammer localStorage.
 * `schedule()` restarts the timer; `flush()` writes any pending input
 * immediately (used on unmount/navigation); `cancel()` drops it.
 * Pure apart from setTimeout — testable with fake timers.
 */
export function createDraftSaver(
  storage: StorageLike,
  key: string,
  delayMs: number = DRAFT_SAVE_DEBOUNCE_MS
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: DraftInput | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending !== null) {
      const input = pending;
      pending = null;
      writeDraft(storage, key, input);
    }
  };

  const schedule = (input: DraftInput) => {
    pending = input;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return { schedule, flush, cancel };
}
