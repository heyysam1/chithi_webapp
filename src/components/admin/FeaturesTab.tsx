"use client";

import React, { useEffect, useState } from "react";
import {
  CalendarClock,
  Lock,
  Puzzle,
  Flame,
  Hourglass,
  Download,
  Heart,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { adminFetch } from "@/lib/adminApi";

export type FeaturesTabProps = Record<string, never>;

interface SeriesPoint {
  date: string;
  value: number;
}

type Period = "7d" | "30d" | "custom";

interface FeatureDef {
  metric: string;
  labelKey: string;
  Icon: LucideIcon;
}

const FEATURES: FeatureDef[] = [
  { metric: "feat_scheduled", labelKey: "admin.features.scheduled", Icon: CalendarClock },
  { metric: "feat_capsule", labelKey: "admin.features.capsule", Icon: Lock },
  { metric: "feat_riddle", labelKey: "admin.features.riddle", Icon: Puzzle },
  { metric: "feat_burn", labelKey: "admin.features.burn", Icon: Flame },
  { metric: "feat_extend", labelKey: "admin.features.extend", Icon: Hourglass },
  { metric: "feat_export", labelKey: "admin.features.export", Icon: Download },
  { metric: "feat_reaction", labelKey: "admin.features.reaction", Icon: Heart },
];


function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function rangeFor(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  const to = isoDate(today);
  if (period === "7d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: isoDate(from), to };
  }
  if (period === "30d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: isoDate(from), to };
  }
  return { from: customFrom, to: customTo };
}

/** Self-contained mini bar chart (no external deps, theme-aware). */
function MiniBars({ points }: { points: SeriesPoint[] }) {
  const { t } = useLocale();
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((s, p) => s + (p.value || 0), 0);
  if (points.length === 0 || total === 0) {
    return <div className="h-16 flex items-center justify-center text-xs text-ink-muted">—</div>;
  }
  return (
    <div className="flex items-end gap-1 h-16" role="img" aria-label={t("admin.features.filter")}>
      {points.map((p) => (
        <div
          key={p.date}
          title={`${p.date}: ${p.value}`}
          className="flex-1 min-w-[4px] rounded-sm bg-peach/70 hover:bg-peach border border-peach-hover/40 transition-colors"
          style={{ height: `${Math.max(6, (p.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function FeaturesTab() {
  const { t } = useLocale();

  const [period, setPeriod] = useState<Period>("7d");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [customTo, setCustomTo] = useState(() => isoDate(new Date()));

  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = rangeFor(period, customFrom, customTo);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFailed({});
    Promise.all(
      FEATURES.map((f) =>
        adminFetch<{ points: SeriesPoint[] }>(
          `/api/admin/series?metric=${encodeURIComponent(f.metric)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        )
          .then((d: { points: SeriesPoint[] }) => ({
            metric: f.metric,
            points: Array.isArray(d.points) ? d.points : [],
            ok: true,
          }))
          .catch(() => ({ metric: f.metric, points: [], ok: false }))
      )
    )
      .then((results) => {
        if (!cancelled) {
          const next: Record<string, SeriesPoint[]> = {};
          const failedMap: Record<string, boolean> = {};
          for (const r of results) {
            next[r.metric] = r.points;
            if (!r.ok) failedMap[r.metric] = true;
          }
          setSeries(next);
          setFailed(failedMap);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || t("admin.features.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const periodBtn = (p: Period, label: string) => (
    <button
      key={p}
      type="button"
      onClick={() => setPeriod(p)}
      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
        period === p
          ? "bg-peach border-peach-hover text-peach-text font-semibold shadow-sm"
          : "bg-surface border-edge text-ink-muted hover:text-ink hover:border-peach-hover"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {periodBtn("7d", t("admin.features.p7d"))}
        {periodBtn("30d", t("admin.features.p30d"))}
        {periodBtn("custom", t("admin.features.pCustom"))}
        {period === "custom" && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-surface border border-edge text-ink text-xs focus:outline-none focus:border-wax"
            />
            <span className="text-ink-muted text-xs">→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-surface border border-edge text-ink text-xs focus:outline-none focus:border-wax"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(({ metric, labelKey, Icon }) => {
          const points = series[metric] ?? [];
          const total = points.reduce((s, p) => s + (p.value || 0), 0);
          return (
            <div
              key={metric}
              className="p-4 sm:p-5 rounded-3xl bg-surface border border-edge shadow-sm space-y-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-peach/50 border border-edge flex items-center justify-center text-wax shrink-0">
                    <Icon size={17} strokeWidth={1.5} />
                  </div>
                  <span className="text-sm font-medium text-ink">{t(labelKey)}</span>
                </div>
                <span className="font-mono text-xl font-bold text-ink">{total}</span>
              </div>
              {loading && points.length === 0 && !failed[metric] ? (
                <div className="h-16 flex items-center justify-center text-ink-muted">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : failed[metric] ? (
                <div className="h-16 flex items-center justify-center text-xs text-danger px-2 text-center">
                  {t("admin.features.loadError")}
                </div>
              ) : (
                <MiniBars points={points} />
              )}
              <div className="text-[11px] text-ink-muted font-mono">
                {from} → {to}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
