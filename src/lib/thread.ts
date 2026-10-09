/**
 * Pure helpers for the reply-thread UI (src/components/envelope/ThreadView.tsx).
 * Kept free of React / i18n so they are trivially unit-testable.
 */

/** Default snippet length for thread items (characters, code-point safe). */
export const THREAD_SNIPPET_LENGTH = 120;

/**
 * Collapse whitespace and truncate a letter body to a short preview snippet.
 * Never splits a surrogate pair (uses code points, not UTF-16 units).
 * Returns "" for missing/blank input.
 */
export function truncateSnippet(
  body: string | undefined | null,
  maxLength: number = THREAD_SNIPPET_LENGTH
): string {
  if (!body) return "";
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  return chars.slice(0, maxLength).join("").trimEnd() + "…";
}
