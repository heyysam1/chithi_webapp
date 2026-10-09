import { formatDistanceToNow } from "date-fns";
import { bn, enUS } from "date-fns/locale";
import { Locale } from "./types";
import { PERMANENT_EXPIRES_AT } from "./constants";

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/**
 * Converts English digits (0-9) in any number or string to Bengali script (০-৯).
 */
export function toBengaliDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit);
}

/**
 * Formats epoch ms into days, hours, minutes, seconds countdown parts.
 */
export function getCountdownParts(targetEpochMs: number): {
  totalSeconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
} {
  const diffMs = Math.max(0, targetEpochMs - Date.now());
  const totalSeconds = Math.floor(diffMs / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalSeconds,
    days,
    hours,
    minutes,
    seconds,
    isExpired: totalSeconds <= 0,
  };
}

/**
 * Formats countdown string like "2d 04:12:35" or "04:12:35"
 */
export function formatCountdown(
  targetEpochMs: number,
  locale: Locale = "en"
): string {
  // Permanent owner mailbox: never show a numeric countdown anywhere.
  if (targetEpochMs >= PERMANENT_EXPIRES_AT) {
    return locale === "bn" ? "অসীম" : "Infinite";
  }

  const { days, hours, minutes, seconds, isExpired } = getCountdownParts(targetEpochMs);

  if (isExpired) {
    return locale === "bn" ? "সময় শেষ" : "Expired";
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const hh = pad(hours);
  const mm = pad(minutes);
  const ss = pad(seconds);

  let formatted = days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;

  if (locale === "bn") {
    formatted = toBengaliDigits(formatted);
    if (days > 0) {
      formatted = formatted.replace("d", "দিন");
    }
  }

  return formatted;
}

/**
 * Formats relative time (e.g. "3 hours ago" or "৩ ঘণ্টা আগে")
 */
export function formatRelativeTime(epochMs: number, locale: Locale = "en"): string {
  try {
    return formatDistanceToNow(new Date(epochMs), {
      addSuffix: true,
      locale: locale === "bn" ? bn : enUS,
    });
  } catch {
    const fallback = `${Math.round((Date.now() - epochMs) / 60000)}m ago`;
    return locale === "bn" ? toBengaliDigits(fallback) : fallback;
  }
}
