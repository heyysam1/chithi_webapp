import type {
  LetterSummary,
  Locale,
  PaperStyleId,
  StampId,
} from "./types";

/**
 * A letter with its full body, as needed for export.
 * `replyTo` (letter id) / `scheduledFor` come from LetterSummary and are
 * rendered only when present (populated by the reply-thread and
 * scheduled-send features).
 */
export interface ExportableLetter extends LetterSummary {
  body: string;
}

/** Every user-visible string in the plain-text export. Override for bn. */
export interface ExportStrings {
  title: string;
  mailbox: string;
  exportedOn: string;
  totalLetters: string;
  letter: string;
  of: string;
  date: string;
  paper: string;
  stamp: string;
  from: string;
  via: string;
  direct: string;
  bottle: string;
  inReplyTo: string;
  scheduledFor: string;
  reaction: string;
  heart: string;
  heartCrack: string;
  anonymous: string;
  emptyInbox: string;
  endOfExport: string;
}

export const EN_EXPORT_STRINGS: ExportStrings = {
  title: "Chithi — Letter Export",
  mailbox: "Mailbox",
  exportedOn: "Exported on",
  totalLetters: "Total letters",
  letter: "Letter",
  of: "of",
  date: "Date",
  paper: "Paper",
  stamp: "Stamp",
  from: "From",
  via: "Via",
  direct: "Direct letter",
  bottle: "Drift bottle",
  inReplyTo: "In reply to letter from",
  scheduledFor: "Scheduled for",
  reaction: "Reaction",
  heart: "heart",
  heartCrack: "heartbreak",
  anonymous: "Anonymous",
  emptyInbox: "No letters to export.",
  endOfExport: "— End of export —",
};

export const BN_EXPORT_STRINGS: ExportStrings = {
  title: "চিঠি — চিঠির তালিকা",
  mailbox: "ডাকবাক্স",
  exportedOn: "এক্সপোর্টের তারিখ",
  totalLetters: "মোট চিঠি",
  letter: "চিঠি",
  of: "/",
  date: "তারিখ",
  paper: "কাগজ",
  stamp: "সিলমোহর",
  from: "প্রেরক",
  via: "মাধ্যম",
  direct: "সরাসরি চিঠি",
  bottle: "সাগরের বোতল",
  inReplyTo: "উত্তরে পাঠানো চিঠি, তারিখ",
  scheduledFor: "পাঠানোর নির্ধারিত সময়",
  reaction: "প্রতিক্রিয়া",
  heart: "হার্ট",
  heartCrack: "ভাঙা হার্ট",
  anonymous: "বেনামী",
  emptyInbox: "এক্সপোর্ট করার মতো কোনো চিঠি নেই।",
  endOfExport: "— তালিকা শেষ —",
};

export interface ExportTextOptions {
  mailboxName: string;
  username: string;
  exportedAt?: number;
  locale?: Locale;
  paperNames: Record<PaperStyleId, string>;
  stampNames: Record<StampId, string>;
  strings?: Partial<ExportStrings>;
  /** Optional map of letter id -> createdAt, used to date "in reply to" lines. */
  replyDates?: Record<string, number>;
}

/** Labels for the ExportButton modal. All user-visible strings come via props. */
export interface ExportButtonLabels {
  buttonLabel: string;
  modalTitle: string;
  modalHint?: string;
  downloadTxt: string;
  printPdf: string;
  papers: Record<PaperStyleId, string>;
  stamps: Record<StampId, string>;
}

function resolveStrings(
  locale: Locale,
  overrides?: Partial<ExportStrings>
): ExportStrings {
  const base = locale === "bn" ? BN_EXPORT_STRINGS : EN_EXPORT_STRINGS;
  return { ...base, ...(overrides ?? {}) };
}

/** Readable date+time, e.g. "9 Oct 2026, 14:30" (locale-aware). */
export function formatExportDate(epochMs: number, locale: Locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(epochMs));
  } catch {
    const d = new Date(epochMs);
    return Number.isNaN(d.getTime()) ? "—" : d.toISOString();
  }
}

const SECTION_RULE = "-".repeat(40);
const HEADER_RULE = "=".repeat(40);

function paperName(
  id: PaperStyleId,
  names: Record<PaperStyleId, string>
): string {
  return names[id] ?? id;
}

function stampName(id: StampId, names: Record<StampId, string>): string {
  return names[id] ?? id;
}

/**
 * Builds a clean, readable plain-text export of the given letters.
 * Letters are ordered oldest-first. Bodies are preserved verbatim
 * (newlines and special characters untouched).
 */
export function formatLettersAsText(
  letters: ExportableLetter[],
  opts: ExportTextOptions
): string {
  const locale = opts.locale ?? "en";
  const s = resolveStrings(locale, opts.strings);
  const exportedAt = opts.exportedAt ?? Date.now();
  const sorted = [...letters].sort((a, b) => a.createdAt - b.createdAt);

  const lines: string[] = [];
  lines.push(HEADER_RULE);
  lines.push(s.title);
  lines.push(HEADER_RULE);
  lines.push(`${s.mailbox}: ${opts.mailboxName} (@${opts.username})`);
  lines.push(`${s.exportedOn}: ${formatExportDate(exportedAt, locale)}`);
  lines.push(`${s.totalLetters}: ${sorted.length}`);
  lines.push("");

  if (sorted.length === 0) {
    lines.push(s.emptyInbox);
  }

  sorted.forEach((letter, index) => {
    lines.push(SECTION_RULE);
    lines.push(`${s.letter} ${index + 1} ${s.of} ${sorted.length}`);
    lines.push(SECTION_RULE);
    lines.push(`${s.date}: ${formatExportDate(letter.createdAt, locale)}`);
    lines.push(`${s.paper}: ${paperName(letter.paper, opts.paperNames)}`);
    lines.push(`${s.stamp}: ${stampName(letter.stamp, opts.stampNames)}`);
    lines.push(
      `${s.from}: ${letter.senderName?.trim() ? letter.senderName : s.anonymous}`
    );
    lines.push(
      `${s.via}: ${letter.source === "bottle" ? s.bottle : s.direct}`
    );
    if (letter.replyTo) {
      const replyAt = opts.replyDates?.[letter.replyTo];
      const ref =
        typeof replyAt === "number"
          ? formatExportDate(replyAt, locale)
          : `#${letter.replyTo}`;
      lines.push(`${s.inReplyTo}: ${ref}`);
    }
    if (typeof letter.scheduledFor === "number") {
      lines.push(`${s.scheduledFor}: ${formatExportDate(letter.scheduledFor, locale)}`);
    }
    if (letter.reaction === "heart") {
      lines.push(`${s.reaction}: ${s.heart}`);
    } else if (letter.reaction === "heartCrack") {
      lines.push(`${s.reaction}: ${s.heartCrack}`);
    }
    lines.push("");
    lines.push(letter.body);
    lines.push("");
  });

  lines.push(HEADER_RULE);
  lines.push(s.endOfExport);
  lines.push(HEADER_RULE);
  lines.push("");

  return lines.join("\n");
}

/** e.g. chithi-sami07-2026-10-09.txt */
export function buildExportFilename(username: string, at: number = Date.now()): string {
  const safe =
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "") || "mailbox";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `chithi-${safe}-${ymd}.txt`;
}

/** Triggers a client-side download of the given text. No-op outside the browser. */
export function downloadTextFile(filename: string, text: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
