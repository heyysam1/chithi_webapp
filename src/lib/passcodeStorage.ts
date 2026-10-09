/**
 * Passcode storage — the 6-digit recovery passcode lives ONLY in the
 * user's own browser (the server keeps just a one-way salted hash).
 *
 * Two layers:
 * - localStorage: persistent across tabs and browser restarts. Powers the
 *   profile "passcode info" modal so the user can always see/copy it.
 * - sessionStorage: one-time flag for the inbox key-card display right
 *   after creation. Cleared once the card is dismissed.
 */
const key = (username: string) => `chithi:passcode:${username.toLowerCase()}`;

export function savePasscode(username: string, passcode: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(username), passcode);
    sessionStorage.setItem(key(username), passcode);
  } catch {
    // Storage unavailable (private mode etc.) — non-fatal.
  }
}

/**
 * Silent save: persistent copy only, no session flag.
 * Used after recovery logins so the one-time key card does NOT pop up —
 * the card is shown only once, right after mailbox creation.
 */
export function savePasscodeQuiet(username: string, passcode: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(username), passcode);
  } catch {
    // Storage unavailable (private mode etc.) — non-fatal.
  }
}

/** Persistent read for the profile passcode modal. Migrates legacy saves. */
export function readPasscode(username: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const persistent = localStorage.getItem(key(username));
    if (persistent) return persistent;
    const legacy = sessionStorage.getItem(key(username));
    if (legacy) {
      localStorage.setItem(key(username), legacy);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/** One-time read for the inbox key card (does not touch localStorage). */
export function readOneTimePasscode(username: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key(username));
  } catch {
    return null;
  }
}

/** Dismiss the one-time key card; the persistent copy stays. */
export function clearOneTimePasscode(username: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key(username));
  } catch {
    // ignore
  }
}
