/**
 * Typed client for the /api/admin/* endpoints.
 *
 * Auth is session-cookie based: the admin logs in with the owner mailbox's
 * username + passcode (POST /api/admin/login sets the session cookie), and
 * same-origin fetch sends the cookie automatically. No token needed.
 *
 * The API contract: `{ok:true,data}` on success,
 * `{ok:false,error:{code,message}}` on failure.
 *
 * NEVER surfaces letter bodies — all admin endpoints are metadata-only.
 */

export class AdminApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.status = status;
  }
}

export async function adminFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new AdminApiError("network", "Network error", 0);
  }
  let json: {
    ok?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
  } | null = null;
  try {
    json = (await res.json()) as {
      ok?: boolean;
      data?: T;
      error?: { code?: string; message?: string };
    } | null;
  } catch {
    // Non-JSON response.
  }
  if (!res.ok || !json || json.ok !== true) {
    throw new AdminApiError(
      json?.error?.code || `http_${res.status}`,
      json?.error?.message || `Request failed (${res.status})`,
      res.status
    );
  }
  return json.data as T;
}

/* ---- Response shapes (per the admin API contract) ---- */

export interface OverviewData {
  mailboxes: { total: number; active: number; expired: number };
  letters: { total: number };
  bottles: {
    total: number;
    pools: { any: number; male: number; female: number; other: number };
  };
  feed: { total: number };
  storage: { keys: number };
  reports: { pending: number };
  sessions: { active: number };
  traffic: {
    visitsToday: number;
    uniqueVisitorsToday: number;
    visitsWeek: number;
    uniqueVisitorsWeek: number;
  };
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface SeriesData {
  points: SeriesPoint[];
}

export interface MailboxItem {
  username: string;
  createdAt: number;
  expiresAt: number;
  letterCount: number;
  extensionsUsed: number;
  isPermanent: boolean;
}

/** Metadata only — no letter bodies, ever. */
export interface MailboxDetail extends MailboxItem {
  name?: string;
  gender?: string;
  unreadCount?: number;
  acceptsBottles?: boolean;
}

export interface MailboxListData {
  items: MailboxItem[];
}

export interface ReportItem {
  key: string;
  targetType: string;
  targetId: string;
  count: number;
  distinct: number;
}

export interface ReportsData {
  items: ReportItem[];
}

export interface TopMailboxesData {
  items: { username: string; letterCount: number; isPermanent: boolean }[];
  truncated: boolean;
}

export interface MaintenanceData {
  enabled: boolean;
}

export interface BanInfo {
  key: string;
  kind: "ip" | "user";
  identifier: string;
  reason: string | null;
  by: string | null;
  at: number | null;
  ttlSeconds: number | null;
}

export interface BanListData {
  bans: BanInfo[];
}

/* ---- Date helpers (YYYY-MM-DD, local time) ---- */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

export function todayISO(): string {
  return toISODate(new Date());
}
