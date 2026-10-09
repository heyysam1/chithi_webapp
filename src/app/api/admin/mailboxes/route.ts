import { NextRequest } from "next/server";
import { apiOk, apiErr, ApiError } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import type { MailboxRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_COUNT = 500;
const MAX_SCAN_ITERATIONS = 20;

function adminErrorMessage(code: string): string {
  switch (code) {
    case "NO_ADMIN_SESSION":
      return "Admin login required.";
    case "NOT_OWNER_MAILBOX":
      return "This session is not the owner admin mailbox.";
    case "ADMIN_NOT_CONFIGURED":
      return "Admin panel is not configured on this server.";
    default:
      return code;
  }
}

/**
 * GET /api/admin/mailboxes?q=<prefix>&limit=20
 * Search mailboxes by username prefix (case-insensitive).
 * Returns metadata only — never hashes or tokens.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const limitRaw = parseInt(url.searchParams.get("limit") || "20", 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 100);

    const redis = getRedis();
    const usernames: string[] = [];
    let cursor = "0";
    let iterations = 0;

    do {
      const [next, foundKeys] = await redis.scan(cursor, {
        match: "mb:*",
        count: SCAN_COUNT,
      });
      cursor = next;
      for (const k of foundKeys) {
        // Only bare mailbox records (mb:{username}); skip mb:name:*, mb:ltrs:*,
        // mb:unread:*, mb:recover:*, mb:idx:*.
        const m = /^mb:([^:]+)$/.exec(k);
        if (m && m[1] && (!q || m[1].startsWith(q))) {
          usernames.push(m[1]);
          if (usernames.length >= limit) break;
        }
      }
      iterations++;
    } while (cursor !== "0" && usernames.length < limit && iterations < MAX_SCAN_ITERATIONS);

    if (usernames.length === 0) {
      return apiOk({ items: [] });
    }

    const raws = await redis.mget<unknown[]>(
      ...usernames.map((u) => keys.mailbox(u))
    );
    const letterCounts = await Promise.all(
      usernames.map((u) => redis.zcard(keys.mailboxLetters(u)))
    );

    const items: Array<{
      username: string;
      createdAt: number;
      expiresAt: number;
      letterCount: number;
      extensionsUsed: number;
      isPermanent: boolean;
    }> = [];

    for (let i = 0; i < usernames.length; i++) {
      const raw = raws[i];
      if (!raw) continue;
      let mb: MailboxRecord;
      try {
        mb = typeof raw === "string" ? (JSON.parse(raw) as MailboxRecord) : (raw as MailboxRecord);
      } catch {
        continue;
      }
      items.push({
        username: mb.username,
        createdAt: mb.createdAt,
        expiresAt: mb.expiresAt,
        letterCount: letterCounts[i] ?? 0,
        extensionsUsed: mb.extensionsUsed ?? 0,
        isPermanent: mb.isPermanent === true,
      });
    }

    return apiOk({ items });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[GET /api/admin/mailboxes error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
