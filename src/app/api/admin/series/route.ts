import { NextRequest } from "next/server";
import { apiOk, apiErr } from "@/lib/api";
import { ALL_METRICS, getMetricSeries } from "@/lib/metrics";
import { guardAdmin } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string | null): number | null {
  if (!s || !DATE_RE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

function toDateStr(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const metric = url.searchParams.get("metric") || "";
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    if (!ALL_METRICS.includes(metric as (typeof ALL_METRICS)[number])) {
      return apiErr("VALIDATION_FAILED", "errors.generic", 400, {
        metric: ["unknown metric"],
      });
    }

    let from = parseDate(fromParam);
    const to = parseDate(toParam);
    if (from === null || to === null) {
      return apiErr("VALIDATION_FAILED", "errors.generic", 400, {
        date: ["expected YYYY-MM-DD"],
      });
    }
    if (from > to) {
      return apiErr("VALIDATION_FAILED", "errors.generic", 400, {
        date: ["from must not be after to"],
      });
    }

    // Clamp the window to MAX_RANGE_DAYS; document the clamp in the reply.
    const rangeDays = Math.round((to - from) / 86_400_000) + 1;
    let clamped = false;
    let fromStr = toDateStr(from);
    if (rangeDays > MAX_RANGE_DAYS) {
      from = to - (MAX_RANGE_DAYS - 1) * 86_400_000;
      fromStr = toDateStr(from);
      clamped = true;
    }

    const points = await getMetricSeries(metric, fromStr, toDateStr(to));

    return apiOk({ metric, from: fromStr, to: toDateStr(to), clamped, points });
  } catch {
    return apiErr("INTERNAL", "errors.generic", 500);
  }
}
