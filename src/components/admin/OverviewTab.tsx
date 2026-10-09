"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/hooks/useLocale";
import {
  adminFetch,
  daysAgoISO,
  todayISO,
  type OverviewData,
  type SeriesData,
  type SeriesPoint,
} from "@/lib/adminApi";
import { StatCard } from "./StatCard";
import { AreaChart } from "./AreaChart";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Activity,
  Database,
  Eye,
  Flag,
  Mail,
  Newspaper,
  Package,
  Users,
} from "lucide-react";

const ACTIVITY_METRICS = [
  "letters_sent",
  "mailboxes_created",
  "visits",
  "bottles_sent",
] as const;

type Period = "7d" | "30d" | "custom";

/**
 * Admin dashboard landing tab: stat cards, activity chart, system health.
 * i18n keys under `admin.overview.*` (added by reviewer — do not edit i18n files here).
 */
export function OverviewTab() {
  const { t } = useLocale();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [ovError, setOvError] = useState<string | null>(null);

  const [metric, setMetric] = useState<string>("letters_sent");
  const [period, setPeriod] = useState<Period>("7d");
  const [from, setFrom] = useState<string>(daysAgoISO(6));
  const [to, setTo] = useState<string>(todayISO());
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // Overview stats on mount (traffic incl. unique visitors is part of it).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminFetch<OverviewData>("/api/admin/overview");
        if (!cancelled) setOverview(data);
      } catch (e) {
        if (!cancelled)
          setOvError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSeries = useCallback(async () => {
    const f =
      period === "7d" ? daysAgoISO(6) : period === "30d" ? daysAgoISO(29) : from;
    const end = period === "custom" ? to : todayISO();
    if (f > end) {
      setChartError(t("admin.overview.invalidRange"));
      setPoints([]);
      return;
    }
    setChartLoading(true);
    setChartError(null);
    try {
      const s = await adminFetch<SeriesData>(
        `/api/admin/series?metric=${encodeURIComponent(metric)}&from=${f}&to=${end}`
      );
      setPoints(s.points);
    } catch (e) {
      setChartError(e instanceof Error ? e.message : "Failed to load");
      setPoints([]);
    } finally {
      setChartLoading(false);
    }
  }, [metric, period, from, to, t]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      {ovError ? (
        <p role="alert" className="text-sm text-danger">
          {ovError}
        </p>
      ) : !overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={t("admin.overview.statActiveMailboxes")}
            value={overview.mailboxes.active}
            icon={<Users size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.overview.statLettersTotal")}
            value={overview.letters.total}
            icon={<Mail size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.overview.statBottlesPool")}
            value={overview.bottles.total}
            icon={<Package size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.overview.statPendingReports")}
            value={overview.reports.pending}
            icon={<Flag size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.overview.statStorageKeys")}
            value={overview.storage.keys}
            icon={<Database size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.overview.statFeedPosts")}
            value={overview.feed.total}
            icon={<Newspaper size={18} strokeWidth={1.5} />}
          />
          {/* 7th card spans full width on mobile so it doesn't dangle at half width */}
          <div className="col-span-2 lg:col-span-1">
            <StatCard
              label={t("admin.overview.statActiveSessions")}
              value={overview.sessions.active}
              icon={<Activity size={18} strokeWidth={1.5} />}
            />
          </div>
        </div>
      )}

      {/* Traffic: unique visitors vs page views */}
      {overview &&
        (() => {
          const traffic = overview.traffic ?? {
            uniqueVisitorsToday: 0,
            visitsToday: 0,
            uniqueVisitorsWeek: 0,
            visitsWeek: 0,
          };
          return (
            <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-4">
              <h3 className="text-base font-serif font-bold text-ink">
                {t("admin.overview.traffic")}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label={t("admin.overview.uniqueVisitors")}
                  value={traffic.uniqueVisitorsToday}
                  sub={`${traffic.uniqueVisitorsWeek.toLocaleString()} · ${t("admin.overview.last7days")}`}
                  icon={<Users size={18} strokeWidth={1.5} />}
                />
                <StatCard
                  label={t("admin.overview.pageViews")}
                  value={traffic.visitsToday}
                  sub={`${traffic.visitsWeek.toLocaleString()} · ${t("admin.overview.last7days")}`}
                  icon={<Eye size={18} strokeWidth={1.5} />}
                />
              </div>
            </div>
          );
        })()}

      {/* Activity chart */}
      <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <h3 className="text-base font-serif font-bold text-ink mr-auto max-sm:basis-full max-sm:mr-0">
            {t("admin.overview.activityTitle")}
          </h3>
          <label className="flex flex-col gap-1 max-sm:flex-1 max-sm:min-w-0">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              {t("admin.overview.metricLabel")}
            </span>
            <Select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="!w-full sm:!w-44"
            >
              {ACTIVITY_METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(`admin.overview.metrics.${m}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 max-sm:flex-1 max-sm:min-w-0">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
              {t("admin.overview.periodLabel")}
            </span>
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="!w-full sm:!w-36"
            >
              <option value="7d">{t("admin.overview.period7d")}</option>
              <option value="30d">{t("admin.overview.period30d")}</option>
              <option value="custom">
                {t("admin.overview.periodCustom")}
              </option>
            </Select>
          </label>
          {period === "custom" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                  {t("admin.overview.fromLabel")}
                </span>
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="min-h-[44px] px-4 py-2.5 text-sm bg-surface-raised text-ink rounded-xl border border-edge hover:border-wax focus:outline-none focus:border-wax [color-scheme:light_dark] cursor-pointer"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                  {t("admin.overview.toLabel")}
                </span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={todayISO()}
                  onChange={(e) => setTo(e.target.value)}
                  className="min-h-[44px] px-4 py-2.5 text-sm bg-surface-raised text-ink rounded-xl border border-edge hover:border-wax focus:outline-none focus:border-wax [color-scheme:light_dark] cursor-pointer"
                />
              </label>
            </>
          )}
        </div>

        {chartError ? (
          <p role="alert" className="text-sm text-danger">
            {chartError}
          </p>
        ) : chartLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <AreaChart
                points={points}
                height={260}
                emptyLabel={t("admin.overview.noData")}
              />
            </div>
          </div>
        )}
      </div>

      {/* System health mini-panel */}
      {overview && (
        <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-3">
          <h3 className="text-base font-serif font-bold text-ink">
            {t("admin.overview.healthTitle")}
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-canvas dark:bg-black/20 border border-edge">
              <dt className="text-ink-muted text-xs">
                {t("admin.overview.healthStorage")}
              </dt>
              <dd className="font-mono font-bold text-ink">
                {overview.storage.keys.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-canvas dark:bg-black/20 border border-edge">
              <dt className="text-ink-muted text-xs">
                {t("admin.overview.healthSessions")}
              </dt>
              <dd className="font-mono font-bold text-ink">
                {overview.sessions.active.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-canvas dark:bg-black/20 border border-edge">
              <dt className="text-ink-muted text-xs">
                {t("admin.overview.healthReports")}
              </dt>
              <dd className="font-mono font-bold text-ink">
                {overview.reports.pending.toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
