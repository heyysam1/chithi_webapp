import { DURATIONS, EXTEND_DURATIONS } from "./constants";

export type DurationKey = keyof typeof DURATIONS;

export type ExtendDurationKey = keyof typeof EXTEND_DURATIONS;

export type Gender = "male" | "female" | "other" | "unspecified";

export type PaperStyleId =
  | "parchment"
  | "midnight"
  | "rose"
  | "typewriter"
  | "rainy";

export type StampId = "wax" | "topSecret" | "memory" | "heartbreak";

export type FontId =
  | "dearSecret"
  | "heartfelt"
  | "untoldTale"
  | "bnCursive"
  | "bnDiary"
  | "bnScribble"
  | "bnTypewriter"
  | "bnSerif"
  | "handwriting1"
  | "handwriting2"
  | "handwriting3"
  | "typewriter"
  | "serif"
  | "casual"
  | "calligraphy"
  | "pencil";

export interface MailboxRecord {
  name?: string;
  username: string;
  usernameLower: string;
  accessTokenHash: string;
  gender: Gender;
  acceptsBottles: boolean;
  createdAt: number;
  lastLoginAt: number;
  expiresAt: number;
  durationKey: DurationKey;
  letterCount: number;
  version: 1;
  /** True for the env-configured permanent owner mailbox: never expires, never purged. */
  isPermanent?: boolean;
  /** Lifetime expiry extensions used. Old records lack the field — read paths must default to 0. */
  extensionsUsed: number;
}

export type LetterLock =
  | { kind: "none" }
  | { kind: "capsule"; unlockAt: number }
  | {
      kind: "riddle";
      question: string;
      answerHash: string;
      attempts: number;
      solvedAt: number | null;
    };

export interface LetterRecord {
  id: string;
  recipient: string;
  body: string;
  paper: PaperStyleId;
  stamp: StampId;
  hints: string[];
  source: "direct" | "bottle";
  createdAt: number;
  lock: LetterLock;
  burnAfterReading: boolean;
  openedAt: number | null;
  burnAt: number | null;
  reaction: "heart" | "heartCrack" | null;
  published: boolean;
  senderName?: string | null;
  /** Epoch ms when a scheduled letter becomes deliverable. Null = deliver immediately. */
  scheduledFor: number | null;
  /** Letter ID this letter replies to (same mailbox). Null = not a reply. */
  replyTo: string | null;
  version: 1;
}

export interface FeedRecord {
  id: string;
  body: string;
  paper: PaperStyleId;
  stamp: StampId;
  createdAt: number;
  hearts: number;
  heartCracks: number;
  version: 1;
}

export interface LetterSummary {
  id: string;
  stamp: StampId;
  paper: PaperStyleId;
  createdAt: number;
  source: "direct" | "bottle";
  hasHints: boolean;
  hintCount: number;
  lockKind: "none" | "capsule" | "riddle";
  unlockAt?: number;
  question?: string;
  attemptsRemaining?: number;
  isOpened: boolean;
  burnAt: number | null;
  burnAfterReading: boolean;
  reaction: "heart" | "heartCrack" | null;
  published: boolean;
  senderName?: string | null;
  scheduledFor?: number | null;
  replyTo?: string | null;
}

export interface OpenLetter {
  id: string;
  recipient: string;
  body: string;
  paper: PaperStyleId;
  stamp: StampId;
  hints: string[];
  source: "direct" | "bottle";
  createdAt: number;
  lock:
    | { kind: "none" }
    | { kind: "capsule"; unlockAt: number }
    | {
        kind: "riddle";
        question: string;
        attempts: number;
        solvedAt: number | null;
      };
  burnAfterReading: boolean;
  openedAt: number;
  burnAt: number | null;
  reaction: "heart" | "heartCrack" | null;
  published: boolean;
  senderName?: string | null;
  version: 1;
}

export type LetterView =
  | { state: "locked"; summary: LetterSummary }
  | { state: "open"; letter: OpenLetter };

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "GONE"
  | "LOCKED"
  | "WRONG_ANSWER"
  | "ATTEMPTS_EXCEEDED"
  | "USERNAME_TAKEN"
  | "MAILBOX_FULL"
  | "BOTTLE_NO_MATCH"
  | "ALREADY_DONE"
  | "RATE_LIMITED"
  | "EXTENSIONS_EXHAUSTED"
  | "MAX_EXPIRY_REACHED"
  | "REPLY_DEPTH_EXCEEDED"
  | "PERMANENT_MAILBOX"
  | "INTERNAL";

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
  };
}

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public messageKey: string,
    public status: number,
    public details?: Record<string, string[]>
  ) {
    super(messageKey);
    this.name = "ApiError";
  }
}

export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type Locale = "en" | "bn";
