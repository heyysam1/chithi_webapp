export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_REGEX = /^[a-z0-9_](?:[a-z0-9_.-]{1,18})[a-z0-9_]$/i;

export const RESERVED_USERNAMES = [
  "api",
  "inbox",
  "feed",
  "bottle",
  "about",
  "recover",
  "profile",
  "active",
  "sitemap",
  "robots",
  "manifest",
  "icon",
  "favicon",
  "opengraph-image",
  "textures",
  "fonts",
  "og",
  "en",
  "bn",
  "letter",
  "letters",
  "mailbox",
  "session",
  "music",
  "cron",
  "settings",
  "privacy",
  "terms",
  "u",
  "admin",
  "chithi",
  "null",
  "undefined",
  "new",
  "help",
  "support",
  "report",
  "developer",
] as const;

export const LETTER_BODY_MIN = 1;
export const LETTER_BODY_MAX = 2000;

export const HINT_MAX_COUNT = 3;
export const HINT_MAX_LEN = 60;

export const RIDDLE_Q_MAX = 140;
export const RIDDLE_ANSWER_MIN = 1;
export const RIDDLE_ANSWER_MAX = 60;
export const RIDDLE_MAX_ATTEMPTS = 5;

export const CAPSULE_MIN_LEAD_MS = 60_000;
export const BURN_WINDOW_MS = 60_000;

export const MAILBOX_LETTER_CAP = 300;

/**
 * Maximum reply-thread depth. The original letter is depth 0; a reply to a
 * letter already at this depth is rejected so threads can't become an
 * endless messaging channel.
 */
export const MAX_THREAD_DEPTH = 5;

export const FEED_PAGE_SIZE = 24;
export const INBOX_PAGE_SIZE = 20;

export const DURATIONS = {
  "12h": 43200,
  "24h": 86400,
  "3d": 259200,
  "7d": 604800,
} as const;

/** Extension options offered on the profile page (24h / 3d / 5d / 7d). */
export const EXTEND_DURATIONS = {
  "24h": 86400,
  "3d": 259200,
  "5d": 432000,
  "7d": 604800,
} as const;

/** Max lifetime extensions per mailbox (lifetime cap). */
export const MAX_EXTENSIONS_PER_MAILBOX = 3;

/** Platform ceiling: a mailbox may never live longer than 7 days from creation. */
export const PLATFORM_MAX_LIFETIME_S = 7 * 86400;

/** Logical expiry for the env-configured permanent owner mailbox: 2100-01-01T00:00:00Z. Client-safe (no server imports). */
export const PERMANENT_EXPIRES_AT = 4102444800000;

export const FEED_TTL_S = 172800; // 48 hours
export const MAX_JSON_BODY_BYTES = 16_384;
export const PASSCODE_LENGTH = 6;

export const MOTION = {
  ease: [0.22, 1, 0.36, 1] as const,
  duration: {
    fast: 0.18,
    base: 0.32,
    slow: 0.6,
    envelope: 0.9,
  },
  stagger: 0.05,
} as const;
