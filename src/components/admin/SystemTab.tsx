"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Settings,
  Power,
  ShieldAlert,
  Trash2,
  Download,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";
import {
  adminFetch,
  AdminApiError,
  daysAgoISO,
  todayISO,
  type MaintenanceData,
  type OverviewData,
  type SeriesData,
} from "@/lib/adminApi";

const CSV_DAYS = 30;

const TTL_OPTIONS = [
  { value: "3600", labelKey: "admin.system.ttl1h" },
  { value: "86400", labelKey: "admin.system.ttl24h" },
  { value: "604800", labelKey: "admin.system.ttl7d" },
  { value: "2592000", labelKey: "admin.system.ttl30d" },
] as const;

/**
 * SystemTab — maintenance mode, ban manager, report-volume monitor,
 * danger zone (delete letter by ID), and stats CSV export.
 * Every destructive action requires confirmation.
 */
export function SystemTab() {
  const { t } = useLocale();
  const { showToast } = useToast();

  // Maintenance
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const [maintConfirm, setMaintConfirm] = useState<boolean | null>(null);
  const [maintBusy, setMaintBusy] = useState(false);

  // Ban form
  const [banIdentifier, setBanIdentifier] = useState("");
  const [banKind, setBanKind] = useState<"ip" | "user">("ip");
  const [banTtl, setBanTtl] = useState<string>(TTL_OPTIONS[1].value);
  const [banReason, setBanReason] = useState("");
  const [banBusy, setBanBusy] = useState(false);

  // Report volume (honest label: reports, not "attacks")
  const [reportVolume, setReportVolume] = useState<number | null>(null);

  // Danger zone: delete letter by ID
  const [letterId, setLetterId] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // CSV export
  const [csvBusy, setCsvBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [m, ov] = await Promise.all([
        adminFetch<MaintenanceData>("/api/admin/maintenance"),
        adminFetch<OverviewData>("/api/admin/overview"),
      ]);
      setMaintenance(m.enabled);
      setReportVolume(ov.reports.pending);
    } catch {
      // Status stays unknown; actions still attempt and surface errors.
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleMaintenanceToggle = async () => {
    if (maintConfirm === null) return;
    setMaintBusy(true);
    try {
      const res = await adminFetch<MaintenanceData>("/api/admin/maintenance", {
        method: "POST",
        body: JSON.stringify({ enabled: maintConfirm }),
      });
      setMaintenance(res.enabled);
      showToast(t("admin.system.maintenanceDone"), "success");
    } catch (e) {
      showToast(
        e instanceof AdminApiError ? e.message : t("admin.system.actionError"),
        "error"
      );
    } finally {
      setMaintBusy(false);
      setMaintConfirm(null);
    }
  };

  const handleBan = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifier = banIdentifier.trim();
    if (!identifier) return;
    setBanBusy(true);
    try {
      await adminFetch("/api/admin/ban", {
        method: "POST",
        body: JSON.stringify({
          identifier,
          kind: banKind,
          ttlSeconds: parseInt(banTtl, 10),
          reason: banReason.trim() || undefined,
        }),
      });
      showToast(t("admin.system.banDone"), "success");
      setBanIdentifier("");
      setBanReason("");
    } catch (err) {
      showToast(
        err instanceof AdminApiError
          ? err.message
          : t("admin.system.actionError"),
        "error"
      );
    } finally {
      setBanBusy(false);
    }
  };

  const handleDeleteLetter = async () => {
    const id = letterId.trim();
    if (!id) return;
    setDeleteBusy(true);
    try {
      await adminFetch("/api/admin/letters/delete", {
        method: "POST",
        body: JSON.stringify({ letterId: id }),
      });
      showToast(t("admin.system.deleteDone"), "success");
      setLetterId("");
    } catch (e) {
      showToast(
        e instanceof AdminApiError ? e.message : t("admin.system.actionError"),
        "error"
      );
    } finally {
      setDeleteBusy(false);
      setDeleteConfirm(false);
    }
  };

  const handleCsvExport = async () => {
    setCsvBusy(true);
    try {
      const series = await adminFetch<SeriesData>(
        `/api/admin/series?metric=letters_sent&from=${daysAgoISO(CSV_DAYS)}&to=${todayISO()}`
      );
      const rows = ["date,letters_sent"];
      for (const p of series.points) {
        rows.push(`${p.date},${p.value}`);
      }
      const blob = new Blob([rows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chithi-letters-${daysAgoISO(CSV_DAYS)}-${todayISO()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(t("admin.system.csvDone"), "success");
    } catch (e) {
      showToast(
        e instanceof AdminApiError ? e.message : t("admin.system.actionError"),
        "error"
      );
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-serif font-bold text-ink flex items-center gap-2">
        <Settings size={18} className="text-wax" strokeWidth={1.5} />
        {t("admin.system.title")}
      </h2>

      {/* Maintenance mode */}
      <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-3">
        <h3 className="text-sm font-serif font-bold text-ink flex items-center gap-2">
          <Power size={15} className="text-wax" strokeWidth={1.5} />
          {t("admin.system.maintenanceTitle")}
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              maintenance
                ? "bg-danger/10 border-danger text-danger"
                : "bg-canvas border-edge text-ink-muted"
            }`}
          >
            {maintenance === null
              ? t("admin.system.unknown")
              : maintenance
                ? t("admin.system.maintenanceOn")
                : t("admin.system.maintenanceOff")}
          </span>
          <Button
            type="button"
            variant={maintenance ? "primary" : "outline"}
            size="sm"
            onClick={() => setMaintConfirm(!(maintenance === true))}
            className="rounded-full"
          >
            {maintenance
              ? t("admin.system.disableMaintenance")
              : t("admin.system.enableMaintenance")}
          </Button>
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">
          {t("admin.system.maintenanceHint")}
        </p>
      </div>

      {/* Ban manager */}
      <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-4">
        <h3 className="text-sm font-serif font-bold text-ink flex items-center gap-2">
          <ShieldAlert size={15} className="text-wax" strokeWidth={1.5} />
          {t("admin.system.banTitle")}
        </h3>
        <form onSubmit={handleBan} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
                {t("admin.system.banIdentifier")}
              </span>
              <input
                type="text"
                value={banIdentifier}
                onChange={(e) => setBanIdentifier(e.target.value)}
                placeholder={t("admin.system.banIdentifierPh")}
                className="w-full px-4 py-2.5 rounded-2xl bg-canvas border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-wax"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
                {t("admin.system.banReason")}
              </span>
              <input
                type="text"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder={t("admin.system.banReasonPh")}
                className="w-full px-4 py-2.5 rounded-2xl bg-canvas border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-wax"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
                {t("admin.system.banKind")}
              </span>
              <select
                value={banKind}
                onChange={(e) =>
                  setBanKind(e.target.value as "ip" | "user")
                }
                className="w-full px-4 py-2.5 rounded-2xl bg-canvas border border-edge text-sm text-ink focus:outline-none focus:border-wax"
              >
                <option value="ip">{t("admin.system.banKindIp")}</option>
                <option value="user">{t("admin.system.banKindUser")}</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
                {t("admin.system.banTtl")}
              </span>
              <select
                value={banTtl}
                onChange={(e) => setBanTtl(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-canvas border border-edge text-sm text-ink focus:outline-none focus:border-wax"
              >
                {TTL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            isLoading={banBusy}
            disabled={!banIdentifier.trim()}
            className="rounded-full"
          >
            {t("admin.system.banSubmit")}
          </Button>
        </form>
        <p className="text-[11px] text-ink-muted leading-relaxed">
          {t("admin.system.banNote")}
        </p>
      </div>

      {/* Report volume (honest label — not "attacks") */}
      <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-3">
        <h3 className="text-sm font-serif font-bold text-ink flex items-center gap-2">
          <FileWarning size={15} className="text-wax" strokeWidth={1.5} />
          {t("admin.system.monitorTitle")}
        </h3>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-serif font-bold text-ink">
            {reportVolume === null ? "—" : reportVolume.toLocaleString()}
          </div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
            {t("admin.system.monitorLabel")}
          </div>
        </div>
        <p className="text-[11px] text-ink-muted leading-relaxed">
          {t("admin.system.monitorNote")}
        </p>
      </div>

      {/* Stats CSV export */}
      <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-edge shadow-sm space-y-3">
        <h3 className="text-sm font-serif font-bold text-ink flex items-center gap-2">
          <Download size={15} className="text-wax" strokeWidth={1.5} />
          {t("admin.system.csvTitle")}
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed">
          {t("admin.system.csvDesc")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          isLoading={csvBusy}
          onClick={handleCsvExport}
          className="rounded-full gap-2"
        >
          <Download size={14} strokeWidth={1.5} />
          {t("admin.system.csvSubmit")}
        </Button>
      </div>

      {/* Danger zone: delete letter by ID */}
      <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-danger/40 shadow-sm space-y-4">
        <h3 className="text-sm font-serif font-bold text-danger flex items-center gap-2">
          <Trash2 size={15} strokeWidth={1.5} />
          {t("admin.system.dangerTitle")}
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={letterId}
            onChange={(e) => setLetterId(e.target.value)}
            placeholder={t("admin.system.dangerPh")}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-canvas border border-edge text-sm font-mono text-ink placeholder:text-ink-muted focus:outline-none focus:border-danger"
          />
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!letterId.trim()}
            onClick={() => setDeleteConfirm(true)}
            className="rounded-full"
          >
            {t("admin.system.dangerSubmit")}
          </Button>
        </div>
        <p className="text-[11px] text-ink-muted leading-relaxed">
          {t("admin.system.dangerHint")}
        </p>
      </div>

      {/* Maintenance confirm modal */}
      <Modal
        isOpen={maintConfirm !== null}
        onClose={() => setMaintConfirm(null)}
        title={t("admin.system.maintenanceConfirmTitle")}
        maxWidth="max-w-md"
      >
        <div className="space-y-5">
          <p className="text-sm text-ink-muted leading-relaxed">
            {maintConfirm
              ? t("admin.system.maintenanceConfirmOn")
              : t("admin.system.maintenanceConfirmOff")}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setMaintConfirm(null)}
              className="rounded-full"
            >
              {t("admin.system.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={maintBusy}
              onClick={handleMaintenanceToggle}
              className="rounded-full"
            >
              {t("admin.system.confirmYes")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete letter confirm modal */}
      <Modal
        isOpen={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title={t("admin.system.dangerConfirmTitle")}
        maxWidth="max-w-md"
      >
        <div className="space-y-5">
          <p className="text-sm text-ink-muted leading-relaxed">
            {t("admin.system.dangerConfirmDesc")}
          </p>
          {letterId.trim() && (
            <p className="font-mono text-xs text-ink-muted break-all p-3 rounded-2xl bg-canvas border border-edge">
              {letterId.trim()}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setDeleteConfirm(false)}
              className="rounded-full"
            >
              {t("admin.system.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              isLoading={deleteBusy}
              onClick={handleDeleteLetter}
              className="rounded-full"
            >
              {t("admin.system.confirmDelete")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
