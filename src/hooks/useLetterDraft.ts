"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDraftSaver,
  draftKey,
  readDraft,
  removeDraft,
  DRAFT_SAVE_DEBOUNCE_MS,
  type DraftInput,
  type LetterDraft,
} from "@/lib/draft";

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Draft autosave for the letter composer.
 *
 * - On mount (or when the recipient changes) loads any restorable draft into
 *   `draft` so the UI can offer a restore banner.
 * - `saveDraft(input)` debounces the localStorage write (~1s); empty bodies
 *   are skipped and quota errors are swallowed by the storage layer.
 * - `clearDraft()` deletes the stored draft (call after a successful send).
 */
export function useLetterDraft(recipientUsername?: string) {
  const key = draftKey(recipientUsername);
  const [draft, setDraft] = useState<LetterDraft | null>(null);
  const saverRef = useRef<ReturnType<typeof createDraftSaver> | null>(null);

  // Load any restorable draft for this recipient.
  useEffect(() => {
    const storage = getLocalStorage();
    setDraft(storage ? readDraft(storage, key) : null);
    // A recipient switch invalidates any pending write for the old key.
    saverRef.current?.cancel();
    saverRef.current = null;
  }, [key]);

  const saveDraft = useCallback(
    (input: DraftInput) => {
      const storage = getLocalStorage();
      if (!storage) return;
      if (!saverRef.current) {
        saverRef.current = createDraftSaver(storage, key, DRAFT_SAVE_DEBOUNCE_MS);
      }
      saverRef.current.schedule(input);
    },
    [key]
  );

  const clearDraft = useCallback(() => {
    const storage = getLocalStorage();
    saverRef.current?.cancel();
    saverRef.current = null;
    if (storage) removeDraft(storage, key);
    setDraft(null);
  }, [key]);

  // Flush a pending write if the composer unmounts (e.g. navigation).
  useEffect(() => {
    return () => {
      saverRef.current?.flush();
    };
  }, []);

  return {
    draft,
    saveDraft,
    clearDraft,
    hasDraft: draft !== null,
  };
}

export type { DraftInput, LetterDraft };
