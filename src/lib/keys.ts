/**
 * Centralized Redis keyspace builders.
 * Strictly all Redis keys used across the application are constructed here.
 * No inline key string literals elsewhere.
 */

export const keys = {
  /**
   * Mailbox record JSON: mb:{usernameLower}
   */
  mailbox: (usernameLower: string): string => `mb:${usernameLower.toLowerCase()}`,

  /**
   * Username reservation lock (SET NX): mb:name:{usernameLower}
   */
  mailboxReservation: (usernameLower: string): string =>
    `mb:name:${usernameLower.toLowerCase()}`,

  /**
   * Passcode hash for recovery: mb:recover:{usernameLower}
   */
  mailboxRecovery: (usernameLower: string): string =>
    `mb:recover:${usernameLower.toLowerCase()}`,

  /**
   * Letter record JSON: ltr:{letterId}
   */
  letter: (letterId: string): string => `ltr:${letterId}`,

  /**
   * Mailbox letters sorted set (member letterId, score createdAt ms): mb:ltrs:{usernameLower}
   */
  mailboxLetters: (usernameLower: string): string =>
    `mb:ltrs:${usernameLower.toLowerCase()}`,

  /**
   * Mailbox unread count: mb:unread:{usernameLower}
   */
  mailboxUnread: (usernameLower: string): string =>
    `mb:unread:${usernameLower.toLowerCase()}`,

  /**
   * Message in a bottle candidate pools: bottle:pool:{gender}
   */
  bottlePool: (gender: "any" | "male" | "female" | "other"): string =>
    `bottle:pool:${gender}`,

  /**
   * Bottle pair delivery guard: bottle:pair:{senderViewerHash}:{usernameLower}
   */
  bottlePair: (senderViewerHash: string, usernameLower: string): string =>
    `bottle:pair:${senderViewerHash}:${usernameLower.toLowerCase()}`,

  /**
   * Public feed chronological sorted set: feed:ids
   */
  feedIds: (): string => "feed:ids",

  /**
   * Public feed trending sorted set: feed:trending
   */
  feedTrending: (): string => "feed:trending",

  /**
   * Public feed record JSON: feed:{feedId}
   */
  feedItem: (feedId: string): string => `feed:${feedId}`,

  /**
   * Letter reactions hash: react:ltr:{letterId}
   */
  letterReactions: (letterId: string): string => `react:ltr:${letterId}`,

  /**
   * Feed item reaction deduplication key: react:dedup:{feedId}:{viewerHash}
   */
  feedReactionDedup: (feedId: string, viewerHash: string): string =>
    `react:dedup:${feedId}:${viewerHash}`,

  /**
   * Abuse reports hash: report:{targetType}:{targetId}
   */
  report: (targetType: "letter" | "feed", targetId: string): string =>
    `report:${targetType}:${targetId}`,

  /**
   * Flood guard for duplicate letters: flood:{viewerHash}:{recipientLower}
   */
  floodGuard: (viewerHash: string, recipientLower: string): string =>
    `flood:${viewerHash}:${recipientLower.toLowerCase()}`,

  /**
   * Active mailboxes index sorted set: mb:idx:active
   * Uses mb:idx: prefix to guarantee zero collision with user mailboxes per DATA-01.
   */
  activeIndex: (): string => "mb:idx:active",

  /**
   * Rate limit bucket key: rl:{bucket}:{identifier}
   */
  rateLimit: (bucket: string, identifier: string): string =>
    `rl:${bucket}:${identifier}`,

  /**
   * Temporary IP abuse block: abuse:block:{rateKey}
   */
  abuseBlock: (rateKey: string): string =>
    `abuse:block:${rateKey}`,

  /**
   * IP abuse violation counter: abuse:count:{rateKey}
   */
  abuseCount: (rateKey: string): string =>
    `abuse:count:${rateKey}`,

  /**
   * Admin maintenance-mode flag: admin:maintenance ("1" = enabled)
   */
  adminMaintenance: (): string => "admin:maintenance",

  /**
   * Daily aggregate metric counter: stats:{metric}:{YYYY-MM-DD}
   * Aggregate only — never stores identities. TTL 400 days.
   */
  metricDay: (metric: string, dateStr: string): string =>
    `stats:${metric}:${dateStr}`,
} as const;
