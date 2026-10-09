"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Flag, Check, Trash2, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";
import {
  adminFetch,
  AdminApiError,
  type ReportsData,
  type ReportItem,
} from "@/lib/adminApi";

type PendingAction = {
  item: ReportItem;
  action: "dismiss" | "delete_target";
};

/**
 * ReportsTab — abuse report moderation inbox.
 * Metadata only: target IDs are shown, letter/feed bodies are never loaded.
 * Destructive actions (delete reported content) require confirmation.
 */
export function ReportsTab() {
  const { t } = useLocale();
  const { showToast } = useToast();

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<ReportsData>("/api/admin/reports");
      setReports(data.items);
    } catch (e) {
      setError(
        e instanceof AdminApiError
          ? e.message
          : t("admin.reports.loadError")
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await adminFetch("/api/admin/reports/action", {
        method: "POST",
        body: JSON.stringify({
          key: confirm.item.key,
          action: confirm.action,
        }),
      });
      showToast(t("admin.reports.actionDone"), "success");
      setConfirm(null);
      load();
    } catch (e) {
      showToast(
        e instanceof AdminApiError
          ? e.message
          : t("admin.reports.actionError"),
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-serif font-bold text-ink flex items-center gap-2">
          <Flag size={18} className="text-wax" strokeWidth={1.5} />
          {t("admin.reports.title")}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw
            size={14}
            className={loading ? "animate-spin" : ""}
            strokeWidth={1.5}
          />
          {t("admin.reports.refresh")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted text-center py-10">
          {t("admin.reports.loading")}
        </p>
      ) : reports.length === 0 ? (
        <div className="p-10 rounded-3xl bg-surface border border-edge text-center">
          <Inbox size={28} className="mx-auto text-ink-muted" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-ink-muted">
            {t("admin.reports.empty")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((item) => (
            <li
              key={item.key}
              className="p-4 sm:p-5 rounded-3xl bg-surface border border-edge shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                    item.targetType === "letter"
                      ? "bg-peach/40 border-peach-hover text-peach-text"
                      : "bg-canvas border-edge text-ink-muted"
                  }`}
                >
                  {item.targetType}
                </span>
                <span className="font-mono text-xs text-ink-muted break-all">
                  {item.targetId}
                </span>
                <span className="ml-auto text-xs text-ink-muted">
                  {t("admin.reports.reportCount")}:{" "}
                  <span className="font-bold text-ink">{item.count}</span>
                </span>
              </div>
              <div className="text-[11px] text-ink-muted">
                {t("admin.reports.distinct")}:{" "}
                <span className="font-bold text-ink">{item.distinct}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfirm({ item, action: "dismiss" })
                  }
                  className="gap-2"
                >
                  <Check size={14} strokeWidth={1.5} />
                  {t("admin.reports.dismiss")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    setConfirm({ item, action: "delete_target" })
                  }
                  className="gap-2"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                  {t("admin.reports.deleteContent")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm?.action === "delete_target"
            ? t("admin.reports.confirmDeleteTitle")
            : t("admin.reports.confirmDismissTitle")
        }
        maxWidth="max-w-md"
      >
        <div className="space-y-5">
          <p className="text-sm text-ink-muted leading-relaxed">
            {confirm?.action === "delete_target"
              ? t("admin.reports.confirmDeleteDesc")
              : t("admin.reports.confirmDismissDesc")}
          </p>
          {confirm && (
            <p className="font-mono text-xs text-ink-muted break-all p-3 rounded-2xl bg-canvas border border-edge">
              {confirm.item.targetType}:{confirm.item.targetId}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setConfirm(null)}
              className="rounded-full"
            >
              {t("admin.reports.cancel")}
            </Button>
            <Button
              type="button"
              variant={confirm?.action === "delete_target" ? "danger" : "primary"}
              size="md"
              isLoading={busy}
              onClick={handleAction}
              className="rounded-full"
            >
              {t("admin.reports.confirmYes")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
