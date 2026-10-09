"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { ProfileHeaderCard } from "@/components/profile/ProfileHeaderCard";
import { ProfileStatsGrid } from "@/components/profile/ProfileStatsGrid";
import { PasscodeInfoModal } from "@/components/profile/PasscodeInfoModal";
import { ExtendExpiryCard } from "@/components/profile/ExtendExpiryCard";
import { CopyField } from "@/components/ui/CopyField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useLocale } from "@/hooks/useLocale";
import { useAccessToken } from "@/hooks/useAccessToken";
import {
  Mail,
  KeyRound,
  LogOut,
  ArrowLeft,
  RefreshCw,
  Clock,
  Sparkles,
  Inbox,
  AlertCircle,
  Bell,
} from "lucide-react";
import { useLetterNotifications } from "@/hooks/useLetterNotifications";
import { useSession } from "@/hooks/useSession";

interface ProfileData {
  username: string;
  gender: string;
  expiresAt: number;
  createdAt: number;
  extensionsUsed: number;
  isPermanent?: boolean;
  unreadCount: number;
  totalEnvelopeCount: number;
  acceptsBottles: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { sessions, activeUsername, setActiveUsername, logout, isLoading: isSessionLoading } = useSession();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  // Modals state
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);

  const { token, clearToken } = useAccessToken(activeUsername || undefined);
  const { permission, isSupported, isGranted, requestPermission } =
    useLetterNotifications(profileData?.username || activeUsername);

  // Sync loading state when session is loading and no username
  useEffect(() => {
    if (!isSessionLoading && !activeUsername) {
      setLoading(false);
    }
  }, [isSessionLoading, activeUsername]);

  // 2. Fetch authoritative profile data from server
  const fetchProfile = useCallback(async () => {
    if (!activeUsername) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorStatus(null);

    try {
      const storedToken =
        token ||
        (typeof window !== "undefined"
          ? localStorage.getItem(`chithi:token:${activeUsername.toLowerCase()}`)
          : null);

      const headers: Record<string, string> = {};
      if (storedToken) {
        headers["Authorization"] = `Bearer ${storedToken}`;
      }

      const res = await fetch(
        `/api/mailbox/profile?username=${encodeURIComponent(
          activeUsername.toLowerCase()
        )}`,
        { headers }
      );

      if (res.status === 410) {
        // Mailbox clock expired
        setErrorStatus(410);
        setLoading(false);
        return;
      }

      if (res.status === 401 || res.status === 403) {
        // Invalid or unauthorized token
        clearToken();
        setErrorStatus(res.status);
        setLoading(false);
        return;
      }

      const json = await res.json();
      if (json.ok && json.data) {
        setProfileData(json.data);
      } else {
        setErrorStatus(res.status || 500);
      }
    } catch {
      setErrorStatus(500);
    } finally {
      setLoading(false);
    }
  }, [activeUsername, token, clearToken]);

  useEffect(() => {
    if (activeUsername) {
      fetchProfile();
    }
  }, [activeUsername, fetchProfile]);

  // Stat Card click routing: Directly routes to /inbox/${username}?filter=...
  const handleStatCardClick = (filter: "unread" | "all") => {
    if (profileData?.username) {
      router.push(`/inbox/${profileData.username}?filter=${filter}`);
    }
  };

  // Handle safe session disconnect per SEC-08
  const handleDisconnect = async () => {
    await logout();
    setProfileData(null);
    setIsDisconnectModalOpen(false);
    router.replace("/");
  };

  const publicUrl =
    typeof window !== "undefined" && profileData
      ? `${window.location.origin}/${profileData.username}`
      : profileData
      ? `${process.env.NEXT_PUBLIC_APP_URL || ""}/${profileData.username}`
      : "";

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto space-y-8 py-6 sm:py-10 pb-36 sm:pb-44">
        {/* Navigation Breadcrumb Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono text-ink-muted hover:text-ink transition-colors group cursor-pointer"
          >
            <ArrowLeft
              size={14}
              className="group-hover:-translate-x-1 transition-transform"
            />
            <span>{t("profile.backToHome")}</span>
          </Link>

          {profileData && (
            <button
              type="button"
              onClick={fetchProfile}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span>{locale === "bn" ? "রিফ্রেশ" : "Refresh"}</span>
            </button>
          )}
        </div>

        {/* STATE 1: Initial Loading Skeleton */}
        {loading && !profileData && (
          <div className="p-8 sm:p-12 rounded-3xl bg-surface border border-edge shadow-xl text-center space-y-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-peach/50 dark:bg-canvas flex items-center justify-center text-wax mx-auto animate-pulse">
              <Sparkles size={24} />
            </div>
            <div className="space-y-2">
              <div className="h-5 w-32 bg-edge rounded-full mx-auto animate-pulse" />
              <div className="h-3 w-48 bg-edge/60 rounded-full mx-auto animate-pulse" />
            </div>
          </div>
        )}

        {/* STATE 2: Unauthorized / No Active Session */}
        {!loading && !profileData && (errorStatus === 401 || errorStatus === 403 || !activeUsername) && (
          <div className="p-8 sm:p-12 rounded-3xl bg-surface border border-edge shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] text-center space-y-5 max-w-lg mx-auto relative overflow-hidden transition-colors">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-6 washi-tape-buttercup rounded-sm" />

            <div className="w-16 h-16 rounded-2xl bg-warn-surface border border-warn-edge flex items-center justify-center text-wax mx-auto shadow-sm">
              <Inbox size={28} strokeWidth={1.5} />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-serif font-bold text-ink">
                {t("profile.unauthorizedTitle")}
              </h2>
              <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-sm mx-auto">
                {t("profile.unauthorizedDesc")}
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/recover" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full rounded-full gap-2 font-semibold shadow-sm bg-peach hover:bg-peach-hover text-peach-text border border-peach-hover"
                >
                  <KeyRound size={16} />
                  <span>{t("profile.loginAction")}</span>
                </Button>
              </Link>
              <Link href="/" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="md"
                  className="w-full rounded-full border-edge hover:bg-canvas text-ink"
                >
                  {t("profile.homeAction")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* STATE 3: Expired Mailbox */}
        {!loading && errorStatus === 410 && (
          <div className="p-8 sm:p-12 rounded-3xl bg-surface border border-edge shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] text-center space-y-5 max-w-lg mx-auto relative overflow-hidden transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger mx-auto shadow-sm">
              <Clock size={28} strokeWidth={1.5} />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-serif font-bold text-ink">
                {t("profile.statusExpired")}
              </h2>
              <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-sm mx-auto">
                {t("profile.expiredMessage")}
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full rounded-full gap-2 font-semibold shadow-sm bg-peach hover:bg-peach-hover text-peach-text border border-peach-hover"
                >
                  <Sparkles size={16} />
                  <span>{t("profile.createAnother")}</span>
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* STATE 4: Network / API Error */}
        {!loading && errorStatus && errorStatus !== 410 && errorStatus !== 401 && errorStatus !== 403 && (
          <div className="p-8 rounded-3xl bg-surface border border-edge shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] text-center space-y-4 max-w-md mx-auto transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-wax mx-auto">
              <AlertCircle size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-serif font-bold text-ink">
                {t("errors.generic")}
              </h3>
              <p className="text-xs text-ink-muted">
                {t("errors.internal")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchProfile}
              className="rounded-full gap-1.5 mx-auto border-edge text-ink"
            >
              <RefreshCw size={14} />
              <span>{t("profile.retry")}</span>
            </Button>
          </div>
        )}

        {/* STATE 5: Active Authenticated Profile */}
        {!loading && profileData && !errorStatus && (
          <div className="space-y-6">
            {/* Multiple Sessions Mailbox Switcher per UI-01 */}
            {sessions.length > 1 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-edge shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
                <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
                  <RefreshCw size={14} className="text-wax" />
                  <span>{locale === "bn" ? "মেইলবক্স পরিবর্তন করুন:" : "Switch Mailbox:"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sessions.map((s) => {
                    const isActive = s.username.toLowerCase() === activeUsername?.toLowerCase();
                    return (
                      <button
                        key={s.username}
                        type="button"
                        onClick={() => setActiveUsername(s.username)}
                        className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer ${
                          isActive
                            ? "bg-wax text-white shadow-sm font-semibold"
                            : "bg-edge/40 text-ink-muted hover:bg-edge"
                        }`}
                      >
                        @{s.username}
                        {s.unreadCount > 0 && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-wax text-white">
                            {s.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Incoming Letter Notification Opt-in Banner */}
            {isSupported && !isGranted && permission !== "denied" && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-peach/50 dark:bg-surface border border-gold/40 dark:border-edge shadow-sm">
                <div className="flex items-center gap-2.5 text-xs text-ink">
                  <Bell size={16} className="text-wax shrink-0" />
                  <span>
                    {locale === "bn"
                      ? "নতুন চিঠির নোটিফিকেশন চালু করুন"
                      : "Enable browser alerts for new incoming letters"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={requestPermission}
                  className="px-3.5 py-1.5 rounded-full bg-peach hover:bg-peach-hover text-peach-text text-xs font-semibold border border-peach-hover shadow-sm transition-transform active:scale-95 cursor-pointer shrink-0"
                >
                  {locale === "bn" ? "অনুমতি দিন" : "Enable Alerts"}
                </button>
              </div>
            )}

            {/* 1. Header Card (Monogram, Username, Gender, Compact Live Countdown) */}
            <ProfileHeaderCard
              username={profileData.username}
              gender={profileData.gender}
              expiresAt={profileData.expiresAt}
            />

            {/* 2. Interactive Authoritative Mailbox Statistics Row (Direct Route to Inbox) */}
            <ProfileStatsGrid
              username={profileData.username}
              unreadCount={profileData.unreadCount}
              totalEnvelopeCount={profileData.totalEnvelopeCount}
              acceptsBottles={profileData.acceptsBottles}
              onFilterChange={handleStatCardClick}
            />

            {/* 3. Prominent Hero CTA: Standalone "Open Secret Inbox" Banner (Directly between Stat Cards and Public Link) */}
            <div className="w-full my-4">
              <Link href={`/inbox/${profileData.username}`} className="block w-full">
                <button
                  type="button"
                  className="w-full py-4 px-6 rounded-2xl bg-peach hover:bg-peach-hover text-peach-text font-semibold text-base shadow-lg transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] cursor-pointer border border-peach-hover"
                >
                  <Mail className="w-5 h-5 text-peach-text" />
                  <span>{locale === "bn" ? "গোপন ইনবক্স খুলুন" : "Open Secret Inbox"}</span>
                </button>
              </Link>
            </div>

            {/* 4. Public Mailbox URL Card (One-Tap Copy) */}
            <div className="relative p-6 sm:p-7 rounded-3xl bg-surface border border-edge shadow-xl space-y-3 overflow-hidden transition-colors">
              <div className="absolute -top-2 left-10 w-24 h-5 washi-tape-buttercup rounded-sm pointer-events-none" />

              <div className="space-y-1">
                <h3 className="text-base font-serif font-bold text-ink">
                  {t("profile.publicUrl.title")}
                </h3>
              </div>

              <CopyField value={publicUrl} />
            </div>

            {/* 4b. Mailbox Expiry Extension (hides itself when ineligible) */}
            <ExtendExpiryCard
              username={profileData.username}
              expiresAt={profileData.expiresAt}
              createdAt={profileData.createdAt}
              extensionsUsed={profileData.extensionsUsed}
              isPermanent={profileData.isPermanent === true}
              token={token}
              onExtended={(nextExpiresAt, nextExtensionsUsed) =>
                setProfileData((prev) =>
                  prev
                    ? {
                        ...prev,
                        expiresAt: nextExpiresAt,
                        extensionsUsed: nextExtensionsUsed,
                      }
                    : prev
                )
              }
            />

            {/* 5. Bottom Action Controls Section (Passcode Info & Disconnect Mailbox) */}
            <div className="p-6 sm:p-7 rounded-3xl bg-surface border border-edge shadow-xl space-y-4 transition-colors">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Secondary Action 1: 6-Digit Passcode Info Modal */}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setIsPasscodeModalOpen(true)}
                  className="w-full rounded-full border-edge hover:bg-canvas text-ink gap-2 text-xs sm:text-sm font-medium cursor-pointer"
                >
                  <KeyRound size={16} className="text-wax" />
                  <span>{t("profile.actions.passcodeInfo")}</span>
                </Button>

                {/* Secondary Action 2: Disconnect / Switch Mailbox */}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => setIsDisconnectModalOpen(true)}
                  className="w-full rounded-full bg-canvas hover:bg-edge text-wax border border-edge gap-2 text-xs sm:text-sm font-medium cursor-pointer"
                >
                  <LogOut size={16} strokeWidth={1.5} />
                  <span>{t("profile.actions.disconnect")}</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Passcode Security Information Modal */}
      <PasscodeInfoModal
        isOpen={isPasscodeModalOpen}
        onClose={() => setIsPasscodeModalOpen(false)}
      />

      {/* Disconnect Confirmation Modal */}
      <Modal
        isOpen={isDisconnectModalOpen}
        onClose={() => setIsDisconnectModalOpen(false)}
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-left p-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-wax shadow-sm">
              <LogOut size={20} />
            </div>
            <div>
              <h3 className="text-lg font-serif font-bold text-ink">
                {t("profile.actions.disconnectConfirm")}
              </h3>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            {t("profile.actions.disconnectDesc")}
          </p>

          <div className="pt-2 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsDisconnectModalOpen(false)}
              className="rounded-full border-edge text-ink-muted cursor-pointer"
            >
              {t("profile.actions.cancelBtn")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleDisconnect}
              className="rounded-full bg-wax hover:bg-wax-pressed text-white cursor-pointer"
            >
              {t("profile.actions.confirmBtn")}
            </Button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
