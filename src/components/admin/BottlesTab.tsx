"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/hooks/useLocale";
import {
  adminFetch,
  daysAgoISO,
  todayISO,
  type OverviewData,
  type SeriesData,
} from "@/lib/adminApi";
import { StatCard } from "./StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { MailQuestion, Package } from "lucide-react";

/**
 * Dual-series grouped bar chart (sent vs claimed), hand-rolled SVG.
 * Wax bars = sent, peach bars = claimed. Theme-aware via CSS-var classes.
 */
function GroupedBarChart({
  dates,
  sent,
  claimed,
  height = 220,
  emptyLabel,
  sentLabel,
  claimedLabel,
}: {
  dates: string[];
  sent: Map<string, number>;
  claimed: Map<string, number>;
  height?: number;
  emptyLabel: string;
  sentLabel: string;
  claimedLabel: string;
}) {
  const allZero = dates.every(
    (d) => (sent.get(d) ?? 0) === 0 && (claimed.get(d) ?? 0) === 0
  );
  if (dates.length === 0 || allZero) {
    return <p className="text-sm text-ink-muted text-center py-10">{emptyLabel}</p>;
  }

  const W = 680;
  const H = height;
  const padL = 40;
  const padR = 8;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(
    1,
    ...dates.map((d) => Math.max(sent.get(d) ?? 0, claimed.get(d) ?? 0))
  );
  const n = dates.length;
  const slot = innerW / n;
  const barW = Math.max(3, Math.min(16, slot * 0.3));
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max * i) / 4));
  const labelEvery = Math.max(1, Math.ceil(n / 10));

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-wax inline-block" />
          {sentLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-peach inline-block" />
          {claimedLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Sent vs claimed bottles"
      >
        {ticks.map((tv, i) => {
          const y = padT + innerH - (tv / max) * innerH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                className="stroke-edge"
                strokeWidth={1}
                strokeDasharray={tv === 0 ? undefined : "3 4"}
              />
              <text
                x={padL - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                className="fill-ink-muted"
              >
                {tv}
              </text>
            </g>
          );
        })}
        {dates.map((d, i) => {
          const sv = sent.get(d) ?? 0;
          const cv = claimed.get(d) ?? 0;
          const sh = Math.max(sv > 0 ? 3 : 0, (sv / max) * innerH);
          const ch = Math.max(cv > 0 ? 3 : 0, (cv / max) * innerH);
          const cx = padL + i * slot + slot / 2;
          return (
            <g key={d}>
              <title>{`${d}: ${sentLabel} ${sv}, ${claimedLabel} ${cv}`}</title>
              <rect
                x={cx - barW - 1}
                y={padT + innerH - sh}
                width={barW}
                height={sh}
                rx={Math.min(4, barW / 2)}
                className="fill-wax opacity-80"
              />
              <rect
                x={cx + 1}
                y={padT + innerH - ch}
                width={barW}
                height={ch}
                rx={Math.min(4, barW / 2)}
                className="fill-peach opacity-90"
              />
              {i % labelEvery === 0 && (
                <text
                  x={cx}
                  y={H - 10}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-ink-muted"
                >
                  {d.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Bottles tab: pool sizes, sent-vs-claimed flow, anonymous letter count.
 * Metadata only — never letter bodies.
 * i18n keys under `admin.bottles.*` (added by reviewer).
 */
export function BottlesTab() {
  const { t } = useLocale();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [sentMap, setSentMap] = useState<Map<string, number>>(new Map());
  const [claimedMap, setClaimedMap] = useState<Map<string, number>>(new Map());
  const [anonTotal, setAnonTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = daysAgoISO(13);
        const to = todayISO();
        const [ov, sentS, claimedS, anonS] = await Promise.all([
          adminFetch<OverviewData>("/api/admin/overview"),
          adminFetch<SeriesData>(
            `/api/admin/series?metric=bottles_sent&from=${from}&to=${to}`
          ),
          adminFetch<SeriesData>(
            `/api/admin/series?metric=bottles_claimed&from=${from}&to=${to}`
          ),
          adminFetch<SeriesData>(
            `/api/admin/series?metric=anonymous_letters&from=${daysAgoISO(29)}&to=${to}`
          ),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setSentMap(new Map(sentS.points.map((p) => [p.date, p.value])));
        setClaimedMap(new Map(claimedS.points.map((p) => [p.date, p.value])));
        setAnonTotal(anonS.points.reduce((a, p) => a + p.value, 0));
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dates = useMemo(() => {
    const set = new Set<string>([...sentMap.keys(), ...claimedMap.keys()]);
    return [...set].sort();
  }, [sentMap, claimedMap]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }

  const pools = overview?.bottles.pools;

  return (
    <div className="space-y-6">
      {/* Pool sizes */}
      <div>
        <h3 className="text-base font-serif font-bold text-ink mb-3">
          {t("admin.bottles.poolTitle")}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={t("admin.bottles.poolAny")}
            value={pools?.any ?? 0}
            icon={<Package size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.bottles.poolMale")}
            value={pools?.male ?? 0}
            icon={<Package size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.bottles.poolFemale")}
            value={pools?.female ?? 0}
            icon={<Package size={18} strokeWidth={1.5} />}
          />
          <StatCard
            label={t("admin.bottles.poolOther")}
            value={pools?.other ?? 0}
            icon={<Package size={18} strokeWidth={1.5} />}
          />
        </div>
      </div>

      {/* Sent vs claimed flow */}
      <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-4">
        <h3 className="text-base font-serif font-bold text-ink">
          {t("admin.bottles.flowTitle")}
        </h3>
        <GroupedBarChart
          dates={dates}
          sent={sentMap}
          claimed={claimedMap}
          emptyLabel={t("admin.bottles.noData")}
          sentLabel={t("admin.bottles.flowSent")}
          claimedLabel={t("admin.bottles.flowClaimed")}
        />
      </div>

      {/* Anonymous letters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          label={t("admin.bottles.anonTitle")}
          value={anonTotal ?? "—"}
          sub={t("admin.bottles.anonSub")}
          icon={<MailQuestion size={18} strokeWidth={1.5} />}
        />
      </div>
    </div>
  );
}
