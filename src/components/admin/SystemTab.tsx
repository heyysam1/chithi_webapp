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
  type BanInfo,
  type BanListData,
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
  const [banConfirm, setBanConfirm] = useState<{
    identifier: string;
    kind: "ip" | "user";
    ttlSeconds: number;
    reason?: string;
  } | null>(null);

  // Ban list
  const [bans, setBans] = useState<BanInfo[] | null>(null);
  const [bansError, setBansError] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState<string | null>(null);

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

  const loadBans = useCallback(async () => {
    try {
      const data = await adminFetch<BanListData>("/api/admin/ban");
      setBans(data.bans);
      setBansError(false);
    } catch {
      setBansError(true);
    }
  }, []);

  useEffect(() => {
    loadBans();
  }, [loadBans]);

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

  const handleBan = (e: React.FormEvent) => {
    e.preventDefault();
    const identifier = banIdentifier.trim();
    if (!identifier) return;
    // Confirmation first — a typo'd ban can lock someone out for 30 days.
    setBanConfirm({
      identifier,
      kind: banKind,
      ttlSeconds: parseInt(banTtl, 10),
      reason: banReason.trim() || undefined,
    });
  };

  const doBan = async () => {
    if (!banConfirm) return;
    setBanBusy(true);
    try {
      await adminFetch("/api/admin/ban", {
        method: "POST",
        body: JSON.stringify({
          identifier: banConfirm.identifier,
          kind: banConfirm.kind,
          ttlSeconds: banConfirm.ttlSeconds,
          reason: banConfirm.reason,
        }),
      });
      showToast(t("admin.system.banDone"), "success");
      setBanIdentifier("");
      setBanReason("");
      loadBans();
    } catch (err) {
      showToast(
        err instanceof AdminApiError
          ? err.message
          : t("admin.system.actionError"),
        "error"
      );
    } finally {
      setBanBusy(false);
      setBanConfirm(null);
    }
  };

  const handleRevokeBan = async (key: string) => {
    setRevokeBusy(key);
    try {
      await adminFetch("/api/admin/ban", {
        method: "DELETE",
        body: JSON.stringify({ key }),
      });
      showToast(t("admin.system.banRevoked"), "success");
      loadBans();
    } catch (err) {
      showToast(
        err instanceof AdminApiError
          ? err.message
          : t("admin.system.actionError"),
        "error"
      );
    } finally {
      setRevokeBusy(null);
    }
  };

  const formatTtl = (ttlSeconds: number | null): string => {
    if (ttlSeconds === null) return "—";
    const h = Math.floor(ttlSeconds / 3600);
    const m = Math.floor((ttlSeconds % 3600) / 60);
    if (h >= 24) {
      const d = Math.floor(h / 24);
      return `${d}d ${h % 24}h`;
    }
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
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

        {/* Active ban list with revoke */}
        <div className="space-y-2 pt-1">
          <h4 className="text-xs font-mono uppercase tracking-wider text-ink-muted">
            {t("admin.system.banListTitle")}
          </h4>
          {bansError ? (
            <p className="text-xs text-danger">
              {t("admin.system.banListError")}
            </p>
          ) : bans === null ? (
            <div className="h-10 rounded-2xl bg-canvas animate-pulse" />
          ) : bans.length === 0 ? (
            <p className="text-xs text-ink-muted">
              {t("admin.system.banListEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {bans.map((b) => (
                <li
                  key={b.key}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-canvas border border-edge"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-ink truncate">
                      {b.identifier}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      {b.kind === "ip"
                        ? t("admin.system.banKindIp")
                        : t("admin.system.banKindUser")}
                      {" · "}
                      {t("admin.system.banTtlLeft")}: {formatTtl(b.ttlSeconds)}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={revokeBusy === b.key}
                    onClick={() => handleRevokeBan(b.key)}
                    className="rounded-full shrink-0"
                  >
                    {t("admin.system.banRevoke")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

      {/* Ban confirm modal */}
      <Modal
        isOpen={banConfirm !== null}
        onClose={() => setBanConfirm(null)}
        title={t("admin.system.banConfirmTitle")}
        maxWidth="max-w-md"
      >
        <div className="space-y-5">
          <p className="text-sm text-ink-muted leading-relaxed">
            {t("admin.system.banConfirmDesc")}
          </p>
          {banConfirm && (
            <dl className="p-4 rounded-2xl bg-canvas border border-edge space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">
                  {t("admin.system.banIdentifier")}
                </dt>
                <dd className="font-mono text-ink break-all text-right">
                  {banConfirm.identifier}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">{t("admin.system.banKind")}</dt>
                <dd className="text-ink">
                  {banConfirm.kind === "ip"
                    ? t("admin.system.banKindIp")
                    : t("admin.system.banKindUser")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">{t("admin.system.banTtl")}</dt>
                <dd className="text-ink">
                  {formatTtl(banConfirm.ttlSeconds)}
                </dd>
              </div>
              {banConfirm.reason && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">
                    {t("admin.system.banReason")}
                  </dt>
                  <dd className="text-ink break-all text-right">
                    {banConfirm.reason}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setBanConfirm(null)}
              className="rounded-full"
            >
              {t("admin.system.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              isLoading={banBusy}
              onClick={doBan}
              className="rounded-full"
            >
              {t("admin.system.banSubmit")}
            </Button>
          </div>
        </div>
      </Modal>

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
