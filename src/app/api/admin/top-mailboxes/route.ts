import { NextRequest } from "next/server";
import { apiOk, apiErr } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";
import { PERMANENT_EXPIRES_AT } from "@/lib/constants";
import type { MailboxRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_COUNT = 500;
const MAX_SCAN_ITERATIONS = 20;
const TOP_N = 10;

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
 * GET /api/admin/top-mailboxes
 * Server-side top-10 mailboxes by letter count (metadata only — never
 * letter bodies, hashes, or tokens). Fixes the old client-side ranking,
 * which only saw the first 100 mailboxes and went silently wrong past that.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const redis = getRedis();
    const usernames: string[] = [];
    let cursor: number | string = 0;
    let iterations = 0;
    let truncated = false;

    for (;;) {
      const [next, foundKeys] = await redis.scan(cursor, {
        match: "mb:*",
        count: SCAN_COUNT,
      });
      for (const k of foundKeys) {
        // Only bare mailbox records (mb:{username}); skip mb:name:*,
        // mb:ltrs:*, mb:unread:*, mb:recover:*, mb:idx:*.
        const m = /^mb:([^:]+)$/.exec(k);
        if (m && m[1]) {
          usernames.push(m[1]);
          if (usernames.length >= 2000) {
            truncated = true;
            break;
          }
        }
      }
      if (truncated) break;
      cursor = next;
      iterations++;
      if (String(cursor) === "0" || iterations >= MAX_SCAN_ITERATIONS) break;
    }

    if (usernames.length === 0) {
      return apiOk({ items: [], truncated: false });
    }

    const letterCounts = await Promise.all(
      usernames.map((u) => redis.zcard(keys.mailboxLetters(u)))
    );

    const ranked = usernames
      .map((username, i) => ({
        username,
        letterCount: letterCounts[i] ?? 0,
      }))
      .sort((a, b) => b.letterCount - a.letterCount)
      .slice(0, TOP_N);

    // isPermanent flag for the crown icon (owner mailbox marker).
    const records = await redis.mget<unknown[]>(
      ...ranked.map((r) => keys.mailbox(r.username))
    );
    const items = ranked.map((r, i) => {
      const rec = records[i] as MailboxRecord | null;
      return {
        ...r,
        isPermanent:
          typeof rec?.expiresAt === "number" &&
          rec.expiresAt >= PERMANENT_EXPIRES_AT,
      };
    });

    return apiOk({ items, truncated });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    console.error("[GET /api/admin/top-mailboxes error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
