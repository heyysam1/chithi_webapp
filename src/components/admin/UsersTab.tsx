"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Users, UserCheck, UserX, Crown } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { StatCard } from "./StatCard";
import { BarChart } from "./BarChart";
import {
  adminFetch,
  AdminApiError,
  daysAgoISO,
  todayISO,
  type OverviewData,
  type SeriesData,
  type MailboxListData,
} from "@/lib/adminApi";

const TOP_LIMIT = 10;
const GROWTH_DAYS = 30;

/**
 * UsersTab — user statistics: lifetime/active/expired counts,
 * mailbox growth chart, and top mailboxes by letters received
 * (counts only — no letter bodies).
 */
export function UsersTab() {
  const { t } = useLocale();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [growth, setGrowth] = useState<SeriesData | null>(null);
  const [top, setTop] = useState<
    { username: string; letterCount: number; isPermanent: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, series, list] = await Promise.all([
        adminFetch<OverviewData>("/api/admin/overview"),
        adminFetch<SeriesData>(
          `/api/admin/series?metric=mailboxes_created&from=${daysAgoISO(GROWTH_DAYS)}&to=${todayISO()}`
        ),
        adminFetch<MailboxListData>(`/api/admin/mailboxes?q=&limit=100`),
      ]);
      setOverview(ov);
      setGrowth(series);
      const ranked = [...list.items]
        .sort((a, b) => b.letterCount - a.letterCount)
        .slice(0, TOP_LIMIT)
        .map((m) => ({
          username: m.username,
          letterCount: m.letterCount,
          isPermanent: m.isPermanent,
        }));
      setTop(ranked);
    } catch (e) {
      setError(
        e instanceof AdminApiError ? e.message : t("admin.users.loadError")
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const statCards = useMemo(
    () =>
      overview
        ? [
            {
              label: t("admin.users.lifetime"),
              value: overview.mailboxes.total,
              icon: <Users size={18} strokeWidth={1.5} />,
            },
            {
              label: t("admin.users.activeNow"),
              value: overview.mailboxes.active,
              icon: <UserCheck size={18} strokeWidth={1.5} />,
              accent: true,
            },
            {
              label: t("admin.users.expired"),
              value: overview.mailboxes.expired,
              icon: <UserX size={18} strokeWidth={1.5} />,
            },
          ]
        : [],
    [overview, t]
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-serif font-bold text-ink flex items-center gap-2">
        <Users size={18} className="text-wax" strokeWidth={1.5} />
        {t("admin.users.title")}
      </h2>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-10">
          {t("admin.users.loading")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {statCards.map((c) => (
              <StatCard
                key={c.label}
                label={c.label}
                value={c.value}
                icon={c.icon}
                accent={c.accent}
              />
            ))}
          </div>

          <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm">
            <h3 className="text-sm font-serif font-bold text-ink mb-4">
              {t("admin.users.growthTitle")}
            </h3>
            {growth ? (
              <BarChart
                points={growth.points}
                emptyLabel={t("admin.users.noData")}
              />
            ) : (
              <p className="text-sm text-ink-muted text-center py-10">
                {t("admin.users.noData")}
              </p>
            )}
          </div>

          <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm">
            <h3 className="text-sm font-serif font-bold text-ink mb-4">
              {t("admin.users.topTitle")}
            </h3>
            {top.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-8">
                {t("admin.users.noData")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-ink-muted border-b border-edge">
                      <th className="py-2 pr-4 font-medium">#</th>
                      <th className="py-2 pr-4 font-medium">
                        {t("admin.users.colMailbox")}
                      </th>
                      <th className="py-2 font-medium text-right">
                        {t("admin.users.colLetters")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((m, i) => (
                      <tr
                        key={m.username}
                        className="border-b border-edge/60 last:border-0"
                      >
                        <td className="py-2.5 pr-4 text-ink-muted font-mono text-xs">
                          {i + 1}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="font-mono text-ink">
                            @{m.username}
                          </span>
                          {m.isPermanent && (
                            <Crown
                              size={13}
                              className="inline ml-1.5 text-wax -mt-0.5"
                              strokeWidth={1.5}
                            />
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono text-ink">
                          {m.letterCount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
