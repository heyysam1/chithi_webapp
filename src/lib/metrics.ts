/**
 * Aggregate metrics for the admin dashboard.
 *
 * Privacy design: counters and HyperLogLog sketches only. Counter keys are
 * `stats:{metric}:{YYYY-MM-DD}`; unique-visitor sketches are
 * `stats:uv:{YYYY-MM-DD}` holding one-way SHA-256 hashes of (IP + day).
 * (Asia/Dhaka calendar day). No IPs, user agents, usernames, or any
 * identity is ever stored. Retention is 400 days via key TTL.
 *
 * Instrumentation is fire-and-forget: `incrMetric` never throws and must
 * never affect the request it instruments. Callers use
 * `void incrMetric(...)` to make the fire-and-forget intent explicit.
 */

import { getRedis } from "./redis";
import { keys } from "./keys";

export type MetricName =
  | "letters_sent"
  | "mailboxes_created"
  | "visits"
  | "bottles_sent"
  | "bottles_claimed"
  | "anonymous_letters"
  | "feat_scheduled"
  | "feat_capsule"
  | "feat_riddle"
  | "feat_burn"
  | "feat_extend"
  | "feat_export"
  | "feat_reaction";

export const ALL_METRICS: MetricName[] = [
  "letters_sent",
  "mailboxes_created",
  "visits",
  "bottles_sent",
  "bottles_claimed",
  "anonymous_letters",
  "feat_scheduled",
  "feat_capsule",
  "feat_riddle",
  "feat_burn",
  "feat_extend",
  "feat_export",
  "feat_reaction",
];

/** Retention for daily metric keys: 400 days, in seconds. */
export const METRIC_TTL_SECONDS = 400 * 24 * 60 * 60;

/** Maximum days getMetricSeries will return in one call. */
export const METRIC_SERIES_MAX_DAYS = 400;

/** YYYY-MM-DD calendar date in Asia/Dhaka. */
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function metricDayKey(metric: string, dateStr: string): string {
  return keys.metricDay(metric, dateStr);
}

/**
 * Increment today's counter for a metric. Never throws, never rejects —
 * safe to call fire-and-forget from request handlers.
 */
export async function incrMetric(metric: MetricName, by = 1): Promise<void> {
  try {
    const redis = getRedis();
    const key = keys.metricDay(metric, todayStr());
    // RedisLike exposes incr only (no incrby); loop for by > 1 (rare path).
    const steps = Math.max(1, Math.floor(by));
    for (let i = 0; i < steps; i++) {
      await redis.incr(key);
    }
    await redis.expire(key, METRIC_TTL_SECONDS);
  } catch {
    // Metrics must never break the instrumented request.
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface MetricPoint {
  date: string;
  value: number;
}

/** Shared YYYY-MM-DD range validation; returns the list of day strings. */
function dateRangeDays(from: string, to: string): string[] {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new Error("Invalid date format; expected YYYY-MM-DD");
  }
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    throw new Error("Invalid date range");
  }
  const days: string[] = [];
  for (
    let d = new Date(start);
    d <= end && days.length < METRIC_SERIES_MAX_DAYS;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Daily series for a metric over [from, to] (inclusive, YYYY-MM-DD).
 * Missing days read as 0. Throws on invalid input — callers (admin API)
 * convert this into a 400 response.
 */
export async function getMetricSeries(
  metric: string,
  from: string,
  to: string
): Promise<MetricPoint[]> {
  const days = dateRangeDays(from, to);
  const redis = getRedis();
  const values = await redis.mget(
    ...days.map((day) => keys.metricDay(metric, day))
  );
  return days.map((date, i) => ({
    date,
    value: Number(values[i] ?? 0) || 0,
  }));
}

/**
 * Daily unique-visitor series over [from, to] (inclusive, YYYY-MM-DD),
 * read from the per-day HyperLogLog sketches. Missing days read as 0.
 * Same input validation as getMetricSeries — throws on invalid input so
 * callers (admin API) can convert it into a 400 response.
 *
 * Privacy: PFCOUNT returns an estimated cardinality only; the underlying
 * SHA-256 hashes can never be reversed into IPs or identities.
 */
export async function getUniqueVisitorSeries(
  from: string,
  to: string
): Promise<MetricPoint[]> {
  const days = dateRangeDays(from, to);
  const redis = getRedis();
  const counts = await Promise.all(
    days.map(async (day) => {
      try {
        return await redis.pfcount(keys.uniqueVisitorsDay(day));
      } catch {
        return 0;
      }
    })
  );
  return days.map((date, i) => ({
    date,
    value: Number(counts[i]) || 0,
  }));
}
