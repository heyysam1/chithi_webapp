"use client";

import React, { useEffect, useState } from "react";
import {
  Search,
  ShieldCheck,
  Hourglass,
  TimerOff,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";
import { adminFetch } from "@/lib/adminApi";

export type MailboxesTabProps = Record<string, never>;

interface MailboxRow {
  username: string;
  createdAt: number;
  expiresAt: number;
  letterCount: number;
  extensionsUsed: number;
  isPermanent: boolean;
}

interface RecentLetterMeta {
  id: string;
  createdAt: number;
  source?: string;
  lockKind?: string;
  isOpened?: boolean;
}

interface MailboxDetail extends MailboxRow {
  recentLetters?: RecentLetterMeta[];
}


function formatDateTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale === "bn" ? "bn-BD" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const EXTEND_DURATIONS = ["24h", "3d", "5d", "7d"] as const;

export function MailboxesTab() {
  const { t, locale } = useLocale();
  const { showToast } = useToast();

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MailboxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailboxDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionView, setActionView] = useState<
    "none" | "extend" | "expire" | "delete"
  >("none");
  const [durationKey, setDurationKey] =
    useState<(typeof EXTEND_DURATIONS)[number]>("24h");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [acting, setActing] = useState(false);

  // Debounced search (~400ms).
  useEffect(() => {
    setLoading(true);
    setError(null);
    const h = setTimeout(() => {
      adminFetch<{ items: MailboxRow[] }>(
        `/api/admin/mailboxes?q=${encodeURIComponent(query)}&limit=20`
      )
        .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
        .catch((e: Error) =>
          setError(e.message || t("admin.mailboxes.loadError"))
        )
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const refreshList = () => {
    adminFetch<{ items: MailboxRow[] }>(
      `/api/admin/mailboxes?q=${encodeURIComponent(query)}&limit=20`
    )
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => {});
  };

  const openDetail = (username: string) => {
    setSelected(username);
    setDetail(null);
    setActionView("none");
    setDeleteConfirm("");
    setDetailLoading(true);
    adminFetch<MailboxDetail>(
      `/api/admin/mailbox/${encodeURIComponent(username.toLowerCase())}`
    )
      .then((d) => setDetail(d))
      .catch((e: Error) => {
        showToast(
          e.message || t("admin.mailboxes.detailError"),
          "error"
        );
        setSelected(null);
      })
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
    setActionView("none");
    setDeleteConfirm("");
  };

  const runAction = (
    action: "extend" | "expire" | "delete",
    body: Record<string, unknown>
  ) => {
    if (!selected) return;
    setActing(true);
    adminFetch(
      `/api/admin/mailbox/${encodeURIComponent(selected.toLowerCase())}/action`,
      { method: "POST", body: JSON.stringify({ action, ...body }) }
    )
      .then(() => {
        const msgs: Record<"extend" | "expire" | "delete", string> = {
          extend: t("admin.mailboxes.extendSuccess"),
          expire: t("admin.mailboxes.expireSuccess"),
          delete: t("admin.mailboxes.deleteSuccess"),
        };
        showToast(msgs[action], "success");
        setActionView("none");
        setDeleteConfirm("");
        openDetail(selected);
        refreshList();
      })
      .catch((e: Error) =>
        showToast(
          e.message || t("admin.mailboxes.actionError"),
          "error"
        )
      )
      .finally(() => setActing(false));
  };

  const isExpired = (m: MailboxRow) => m.expiresAt < Date.now();
  const deleteArmed =
    !!detail && deleteConfirm.trim().toLowerCase() === detail.username.toLowerCase();

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.mailboxes.searchPlaceholder")}
          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-surface border border-edge text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:border-wax transition-colors"
        />
      </div>

      {/* Results table */}
      <div className="rounded-2xl border border-edge bg-surface overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-ink-muted">
            <Loader2 size={16} className="animate-spin" />
            <span>{t("admin.mailboxes.loading")}</span>
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-danger">{error}</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted text-center">
            {t("admin.mailboxes.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-ink-muted border-b border-edge">
                  <th className="px-4 py-3">{t("admin.mailboxes.colUser")}</th>
                  <th className="px-4 py-3">{t("admin.mailboxes.colStatus")}</th>
                  <th className="px-4 py-3">{t("admin.mailboxes.colCreated")}</th>
                  <th className="px-4 py-3">{t("admin.mailboxes.colExpires")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.mailboxes.colLetters")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.mailboxes.colExt")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const expired = isExpired(m);
                  return (
                    <tr
                      key={m.username}
                      onClick={() => openDetail(m.username)}
                      className="border-b border-edge/60 last:border-0 cursor-pointer hover:bg-peach/20 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-ink">@{m.username}</span>
                        {m.isPermanent && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-wax/15 text-wax border border-wax/30">
                            <ShieldCheck size={11} />
                            {t("admin.mailboxes.permanent")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                            expired
                              ? "bg-danger/10 text-danger border-danger/30"
                              : "bg-success-surface text-success border-success/30"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              expired ? "bg-danger" : "bg-success"
                            }`}
                          />
                          {expired
                            ? t("admin.mailboxes.expired")
                            : t("admin.mailboxes.active")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-muted text-xs">
                        {formatDateTime(m.createdAt, locale)}
                      </td>
                      <td className="px-4 py-3 text-ink-muted text-xs">
                        {formatDateTime(m.expiresAt, locale)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {m.letterCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">
                        {m.extensionsUsed}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        isOpen={selected !== null}
        onClose={closeDetail}
        title={selected ? `@${selected}` : undefined}
        maxWidth="max-w-lg"
      >
        {detailLoading || !detail ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
            <Loader2 size={16} className="animate-spin" />
            <span>{t("admin.mailboxes.loading")}</span>
          </div>
        ) : actionView === "none" ? (
          <div className="space-y-5">
            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-canvas dark:bg-black/20 border border-edge">
                <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                  {t("admin.mailboxes.colCreated")}
                </div>
                <div className="text-ink mt-1">{formatDateTime(detail.createdAt, locale)}</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas dark:bg-black/20 border border-edge">
                <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                  {t("admin.mailboxes.colExpires")}
                </div>
                <div className="text-ink mt-1">{formatDateTime(detail.expiresAt, locale)}</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas dark:bg-black/20 border border-edge">
                <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                  {t("admin.mailboxes.colLetters")}
                </div>
                <div className="text-ink mt-1 font-mono">{detail.letterCount}</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas dark:bg-black/20 border border-edge">
                <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                  {t("admin.mailboxes.detailExt")}
                </div>
                <div className="text-ink mt-1 font-mono">{detail.extensionsUsed}</div>
              </div>
            </div>

            {/* Recent letter metadata (never bodies) */}
            {detail.recentLetters && detail.recentLetters.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                  {t("admin.mailboxes.recentLetters")}
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {detail.recentLetters.map((ltr) => (
                    <div
                      key={ltr.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-canvas dark:bg-black/20 border border-edge/60 text-xs"
                    >
                      <span className="font-mono text-ink-muted truncate">{ltr.id}</span>
                      <span className="text-ink-muted shrink-0 ml-2">
                        {new Date(ltr.createdAt).toLocaleDateString(
                          locale === "bn" ? "bn-BD" : "en-US"
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                {t("admin.mailboxes.actions")}
              </div>
              <div className="flex flex-wrap gap-2">
                {!detail.isPermanent && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActionView("extend")}
                      className="gap-1.5"
                    >
                      <Hourglass size={14} />
                      {t("admin.mailboxes.extend")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActionView("expire")}
                      className="gap-1.5"
                    >
                      <TimerOff size={14} />
                      {t("admin.mailboxes.forceExpire")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => setActionView("delete")}
                      className="gap-1.5"
                    >
                      <Trash2 size={14} />
                      {t("admin.mailboxes.delete")}
                    </Button>
                  </>
                )}
                {detail.isPermanent && (
                  <p className="text-xs text-ink-muted flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-wax" />
                    {t("admin.mailboxes.ownerLocked")}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : actionView === "extend" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted leading-relaxed">
              {t("admin.mailboxes.extendDesc")}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {EXTEND_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationKey(d)}
                  className={`py-2 px-1 text-center font-mono text-xs rounded-xl border transition-all cursor-pointer ${
                    durationKey === d
                      ? "bg-peach border-peach-hover text-peach-text font-bold shadow-sm"
                      : "bg-surface border-edge text-ink-muted hover:text-ink hover:border-peach-hover"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActionView("none")}
              >
                {t("admin.common.cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={acting}
                onClick={() => runAction("extend", { durationKey })}
              >
                {t("admin.mailboxes.confirmExtend")}
              </Button>
            </div>
          </div>
        ) : actionView === "expire" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink leading-relaxed">
              {t("admin.mailboxes.expireWarn")}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActionView("none")}
              >
                {t("admin.common.cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                isLoading={acting}
                onClick={() => runAction("expire", {})}
              >
                {t("admin.mailboxes.confirmExpire")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink leading-relaxed">
              {t("admin.mailboxes.deleteWarn")}
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={detail.username}
              className="w-full px-4 py-2.5 rounded-xl bg-surface border border-edge text-ink font-mono text-sm placeholder:text-ink-muted focus:outline-none focus:border-danger transition-colors"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActionView("none")}
              >
                {t("admin.common.cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={!deleteArmed}
                isLoading={acting}
                onClick={() => runAction("delete", {})}
              >
                {t("admin.mailboxes.confirmDelete")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
