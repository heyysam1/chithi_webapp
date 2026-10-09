import { NextRequest } from "next/server";
import { apiOk, apiErr, ApiError } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_COUNT = 200;
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

interface ReportItem {
  key: string;
  targetType: "letter" | "feed";
  targetId: string;
  count: number;
  distinct: number;
}

/**
 * GET /api/admin/reports
 * Lists abuse reports from report:* hash keys. Returns counts only —
 * never reporter identities or reported content bodies.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const redis = getRedis();
    const reportKeys: string[] = [];
    let cursor = "0";
    let iterations = 0;

    do {
      const [next, foundKeys] = await redis.scan(cursor, {
        match: "report:*",
        count: SCAN_COUNT,
      });
      cursor = next;
      for (const k of foundKeys) {
        if (/^report:(letter|feed):.+/.test(k)) {
          reportKeys.push(k);
        }
      }
      iterations++;
    } while (cursor !== "0" && iterations < MAX_SCAN_ITERATIONS);

    const items: ReportItem[] = [];
    for (const key of reportKeys) {
      const data = await redis.hgetall<Record<string, string | number>>(key);
      const parts = key.split(":");
      const targetType = parts[1] as "letter" | "feed";
      const targetId = parts.slice(2).join(":");
      items.push({
        key,
        targetType,
        targetId,
        count: Number(data?.count ?? 0),
        distinct: Number(data?.distinct ?? 0),
      });
    }

    // Most-reported first.
    items.sort((a, b) => b.count - a.count);

    return apiOk({ items });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[GET /api/admin/reports error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
