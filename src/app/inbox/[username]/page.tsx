"use client";

import React, { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { CountdownBanner } from "@/components/inbox/CountdownBanner";
import { InboxToolbar } from "@/components/inbox/InboxToolbar";
import { EnvelopeCard } from "@/components/envelope/EnvelopeCard";
import { EnvelopeOpenAnimation } from "@/components/envelope/EnvelopeOpenAnimation";
import { LetterReader } from "@/components/envelope/LetterReader";
import { LockedLetterGate } from "@/components/envelope/LockedLetterGate";
import { PostcardCanvas } from "@/components/postcard/PostcardCanvas";
import { useDownloadPostcard } from "@/components/postcard/useDownloadPostcard";
import { ReportDialog } from "@/components/system/ReportDialog";
import { Modal } from "@/components/ui/Modal";
import { MailboxKeyCard } from "@/components/inbox/MailboxKeyCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { LetterRecord, LetterSummary, OpenLetter } from "@/lib/types";
import { useAccessToken } from "@/hooks/useAccessToken";
import { useToast } from "@/hooks/useToast";
import { useLocale } from "@/hooks/useLocale";
import { ShieldAlert, Copy, Bell } from "lucide-react";
import { useLetterNotifications } from "@/hooks/useLetterNotifications";
import { useSession } from "@/context/SessionContext";

/**
 * Reads the cached bearer token: sessionStorage first (current location),
 * then the legacy localStorage copy. Mirrors useAccessToken's migration.
 */
function readCachedToken(usernameLower: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      sessionStorage.getItem(`chithi:token:${usernameLower}`) ??
      localStorage.getItem(`chithi:token:${usernameLower}`)
    );
  } catch {
    return null;
  }
}

export default function InboxPage(props: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(props.params);
  const username = resolvedParams.username;
  const usernameLower = username.toLowerCase();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, locale } = useLocale();
  const { showToast } = useToast();
  const { token, saveToken, isLoaded: isTokenLoaded } = useAccessToken(username);
  const { refreshSession } = useSession();

  const [createdPasscode, setCreatedPasscode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(`chithi:passcode:${usernameLower}`);
      if (stored) {
        setCreatedPasscode(stored);
        setIsKeyCardOpen(true);
      }
    }
  }, [usernameLower]);
  const { permission, isSupported, isGranted, requestPermission } = useLetterNotifications(username);

  const [mailboxMeta, setMailboxMeta] = useState<{
    expiresAt: number;
    acceptsBottles: boolean;
  } | null>(null);

  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [isFaded, setIsFaded] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Active filter: 'all' | 'unread'
  const filterParam = searchParams.get("filter");
  const [activeFilter, setActiveFilter] = useState<"all" | "unread">(
    filterParam === "unread" ? "unread" : "all"
  );

  useEffect(() => {
    if (filterParam === "unread" || filterParam === "all") {
      setActiveFilter(filterParam);
    }
  }, [filterParam]);

  // Active letter reader state
  const [activeLetter, setActiveLetter] = useState<OpenLetter | null>(null);
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [isAnimatingOpen, setIsAnimatingOpen] = useState(false);
  const [openingLetterId, setOpeningLetterId] = useState<string | null>(null);

  // Locked gate modal state
  const [lockedGateData, setLockedGateData] = useState<{
    letterId: string;
    lockKind: "capsule" | "riddle";
    unlockAt?: number;
    question?: string;
    attemptsLeft?: number;
  } | null>(null);

  // Key card modal state
  const [isKeyCardOpen, setIsKeyCardOpen] = useState(false);

  // Report dialog state
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);

  // Postcard export canvas ref
  const postcardCanvasRef = useRef<HTMLDivElement>(null);
  const { download: downloadPostcard } = useDownloadPostcard(postcardCanvasRef);
  const [postcardLetter, setPostcardLetter] = useState<LetterRecord | OpenLetter | null>(null);

  // 1. Load inbox data
  const loadInbox = useCallback(async () => {
    if (!isTokenLoaded) return;

    try {
      // 1. Prepare auth headers (check state, URL param, or localStorage)
      const keyParam = searchParams.get("key");
      const storedToken =
        token ||
        keyParam ||
        readCachedToken(usernameLower);

      const headers: Record<string, string> = {};
      if (storedToken) {
        headers["Authorization"] = `Bearer ${storedToken}`;
      }

      // 2. Fetch authenticated profile metadata (§API-05, §UI-02)
      const profileRes = await fetch(
        `/api/mailbox/profile?username=${encodeURIComponent(usernameLower)}`,
        { headers }
      );
      const profileJson = await profileRes.json();

      if (!profileJson.ok) {
        if (profileRes.status === 410) {
          setIsFaded(true);
          setIsLoading(false);
          return;
        }
        setIsUnauthorized(true);
        setIsLoading(false);
        return;
      }

      setMailboxMeta({
        expiresAt: profileJson.data.expiresAt,
        acceptsBottles: profileJson.data.acceptsBottles,
      });

      // 3. Fetch letters list with authentication

      const listRes = await fetch(
        `/api/letters/list?username=${encodeURIComponent(usernameLower)}`,
        { headers }
      );

      const listJson = await listRes.json();

      if (!listJson.ok) {
        if (listRes.status === 401 || listRes.status === 403) {
          setIsUnauthorized(true);
        }
        setIsLoading(false);
        return;
      }

      const letterList: LetterSummary[] = listJson.data?.letters || [];
      setLetters(letterList);
      setNextCursor(listJson.data?.nextCursor ?? null);
      setUnreadCount(letterList.filter((l) => !l.isOpened).length);
      setIsUnauthorized(false);
    } catch (err) {
      console.error("[loadInbox error]", err);
      setIsUnauthorized(true);
    } finally {
      setIsLoading(false);
    }
  }, [isTokenLoaded, usernameLower, token, searchParams]);

  // 2. URL key exchange and token stripping per SEC-01
  useEffect(() => {
    const keyParam = searchParams.get("key");
    if (keyParam) {
      saveToken(keyParam);
      if (typeof window !== "undefined") {
        localStorage.setItem("chithi:active", usernameLower);
      }
      fetch("/api/session/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, key: keyParam }),
      })
        .then((res) => res.json())
        .then(async (json) => {
          if (json.ok) {
            await refreshSession();
            loadInbox();
          }
        })
        .catch((err) => console.error("Session exchange error:", err));

      // Strip key from URL to prevent Referer leaks per SEC-01
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, username, usernameLower, saveToken, router, pathname, refreshSession, loadInbox]);

  const handleLoadMore = useCallback(async () => {
    if (nextCursor === null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const storedToken =
        token ||
        readCachedToken(usernameLower);
      const headers: Record<string, string> = {};
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
      const res = await fetch(
        `/api/letters/list?username=${encodeURIComponent(usernameLower)}&cursor=${nextCursor}`,
        { headers }
      );
      const json = await res.json();
      if (json.ok && json.data) {
        const more: LetterSummary[] = json.data.letters || json.data.items || [];
        setLetters((prev) => [...prev, ...more]);
        setNextCursor(json.data.nextCursor ?? null);
      }
    } catch (err) {
      console.error("[handleLoadMore error]", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, token, usernameLower]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // 3. Open letter flow (§11.4)
  const handleOpenLetter = async (letterId: string) => {
    setOpeningLetterId(letterId);

    try {
      const storedToken =
        token ||
        readCachedToken(usernameLower);

      const headers: Record<string, string> = {};
      if (storedToken) {
        headers["Authorization"] = `Bearer ${storedToken}`;
      }

      const res = await fetch(
        `/api/letters/${letterId}?username=${encodeURIComponent(usernameLower)}`,
        { headers }
      );

      const json = await res.json();

      if (res.status === 423 || (json.ok && json.data?.state === "locked")) {
        const summary = json.data?.summary ?? json.data?.lock;
        if (summary) {
          setLockedGateData({
            letterId,
            lockKind: summary.lockKind === "capsule" || summary.kind === "capsule" ? "capsule" : "riddle",
            unlockAt: summary.unlockAt,
            question: summary.question,
            attemptsLeft: summary.attemptsRemaining ?? 5,
          });
        }
      } else if (json.ok && json.data?.state === "open") {
        const fullLetter: OpenLetter = json.data.letter;

        // Start 3D envelope animation
        setIsAnimatingOpen(true);
        setActiveLetter(fullLetter);

        // Update local list unread status
        setLetters((prev) =>
          prev.map((l) => (l.id === letterId ? { ...l, isOpened: true } : l))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } else {
        if (res.status === 410) {
          showToast(t("errors.letterBurned"), "warn");
          setLetters((prev) => prev.filter((l) => l.id !== letterId));
        } else {
          showToast(t(json.error?.message || "errors.generic"), "error");
        }
      }
    } catch {
      showToast(t("errors.generic"), "error");
    } finally {
      setOpeningLetterId(null);
    }
  };

  const handleUnlockedRiddle = async (body: string) => {
    if (!lockedGateData) return;
    const letterId = lockedGateData.letterId;
    const foundSummary = letters.find((l) => l.id === letterId);
    if (foundSummary) {
      // The unlock API returns only `body`; fetch the opened letter so the
      // hints the envelope advertised are actually shown in the reader.
      let fullLetter: OpenLetter | null = null;
      try {
        const storedToken = token || readCachedToken(usernameLower);
        const headers: Record<string, string> = {};
        if (storedToken) {
          headers["Authorization"] = `Bearer ${storedToken}`;
        }
        const res = await fetch(
          `/api/letters/${letterId}?username=${encodeURIComponent(usernameLower)}`,
          { headers }
        );
        const json = await res.json();
        if (json.ok && json.data?.state === "open" && json.data?.letter) {
          fullLetter = json.data.letter as OpenLetter;
        }
      } catch {
        // Fall through to the body-only construction below.
      }

      setActiveLetter(
        fullLetter ?? {
          id: foundSummary.id,
          recipient: usernameLower,
          body,
          paper: foundSummary.paper,
          stamp: foundSummary.stamp,
          hints: [],
          source: foundSummary.source,
          createdAt: foundSummary.createdAt,
          lock: { kind: "none" },
          burnAfterReading: foundSummary.burnAfterReading,
          openedAt: Date.now(),
          burnAt: foundSummary.burnAt,
          reaction: foundSummary.reaction,
          published: foundSummary.published,
          senderName: foundSummary.senderName,
          version: 1,
        }
      );
      setLockedGateData(null);
      setIsReaderOpen(true);
      setLetters((prev) =>
        prev.map((l) => (l.id === foundSummary.id ? { ...l, isOpened: true } : l))
      );
      if (!foundSummary.isOpened) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    }
  };

  const handleDeleteLetter = async (letterId: string) => {
    const storedToken =
      token ||
      readCachedToken(usernameLower);
    const headers: Record<string, string> = {};
    if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;

    await fetch(`/api/letters/${letterId}?username=${encodeURIComponent(usernameLower)}`, {
      method: "DELETE",
      headers,
    });
    setLetters((prev) => prev.filter((l) => l.id !== letterId));
  };

  const handlePublishLetter = async (letterId: string) => {
    const storedToken =
      token ||
      readCachedToken(usernameLower);
    const headers: Record<string, string> = {};
    if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;

    const res = await fetch(`/api/letters/${letterId}/publish?username=${encodeURIComponent(usernameLower)}`, {
      method: "POST",
      headers,
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error?.message || "errors.generic");
    }
    setLetters((prev) =>
      prev.map((l) => (l.id === letterId ? { ...l, published: true } : l))
    );
  };

  const handleReactToLetter = async (
    letterId: string,
    reaction: "heart" | "heartCrack"
  ) => {
    const storedToken =
      token ||
      readCachedToken(usernameLower);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;

    await fetch(`/api/letters/${letterId}/react?username=${encodeURIComponent(usernameLower)}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reaction }),
    });

    setLetters((prev) =>
      prev.map((l) => (l.id === letterId ? { ...l, reaction } : l))
    );
    if (activeLetter && activeLetter.id === letterId) {
      setActiveLetter({ ...activeLetter, reaction });
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <Spinner size={32} />
          <p className="text-xs font-serif italic text-ink-muted">
            Opening your mailbox...
          </p>
        </div>
      </PageShell>
    );
  }

  // Faded state (§16)
  if (isFaded) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto py-12">
          <div className="border border-edge rounded-3xl bg-surface p-8 text-center space-y-5 shadow-xl transition-colors">
            <div className="w-12 h-1 bg-wax mx-auto rounded-full" />
            <h1 className="text-2xl font-serif font-bold text-ink">
              {t("inbox.fadedTitle")}
            </h1>
            <p className="text-sm text-ink-muted leading-relaxed">
              {t("inbox.fadedDesc")}
            </p>
            <div className="pt-2">
              <Link href="/">
                <button
                  type="button"
                  className="bg-peach hover:bg-peach-hover text-peach-text font-semibold border border-peach-hover shadow-sm px-6 py-2.5 rounded-full inline-flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
                >
                  {t("inbox.createOwn")}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // Unauthorized state (§16)
  if (isUnauthorized) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto py-16 text-center space-y-5 border border-edge rounded-3xl bg-surface p-8 shadow-xl transition-colors">
          <div className="w-12 h-12 rounded-2xl border border-warn-edge flex items-center justify-center text-wax bg-warn-surface mx-auto">
            <ShieldAlert size={24} strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-serif font-bold text-ink">
            {t("inbox.unauthorizedTitle")}
          </h1>
          <p className="text-sm text-ink-muted leading-relaxed">
            {t("inbox.unauthorizedDesc")}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/recover" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full rounded-full">
                {t("inbox.recoverAction")}
              </Button>
            </Link>
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full rounded-full border-edge">
                Home
              </Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const publicLink = typeof window !== "undefined"
    ? `${window.location.origin}/${username}`
    : `/${username}`;

  return (
    <PageShell>
      <div className="space-y-6 pb-36 sm:pb-44">
        {/* Sticky Countdown Banner (§11.5) */}
        {mailboxMeta && (
          <CountdownBanner
            expiresAt={mailboxMeta.expiresAt}
            onExpired={() => setIsFaded(true)}
          />
        )}

        {/* Incoming Letter Notification Opt-in Banner (§4.1) */}
        {isSupported && !isGranted && permission !== "denied" && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-peach/50 dark:bg-surface border border-gold/40 dark:border-edge shadow-sm">
            <div className="flex items-center gap-2.5 text-xs text-ink">
              <Bell size={16} className="text-wax shrink-0" />
              <span>
                {t("notifications.enableTitle")}
              </span>
            </div>
            <button
              type="button"
              onClick={requestPermission}
              className="px-3.5 py-1.5 rounded-full bg-peach hover:bg-peach-hover text-peach-text text-xs font-semibold border border-peach-hover shadow-sm transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              {t("notifications.enableAction")}
            </button>
          </div>
        )}

        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-edge pb-4">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-ink">
            <span className="text-wax">@{username}</span>
            {t("inbox.title")}
          </h1>
        </div>

        {/* Toolbar with Active Filter Tabs */}
        <InboxToolbar
          username={username}
          unreadCount={unreadCount}
          totalCount={letters.length}
          acceptsBottles={mailboxMeta?.acceptsBottles ?? true}
          onOpenKeys={() => setIsKeyCardOpen(true)}
          activeFilter={activeFilter}
          onFilterChange={(f) => {
            setActiveFilter(f);
            router.replace(`/inbox/${username}?filter=${f}`, { scroll: false });
          }}
        />

        {/* Envelope List or Empty State */}
        {letters.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title={t("inbox.empty.title")}
              description={t("inbox.empty.desc")}
              action={
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(publicLink);
                    showToast(t("keyCard.copied"), "success");
                  }}
                  className="bg-peach hover:bg-peach-hover text-peach-text font-semibold border border-peach-hover shadow-sm px-6 py-2.5 rounded-full inline-flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
                >
                  <Copy size={16} strokeWidth={1.5} />
                  <span>{t("inbox.empty.copyCta")}</span>
                </button>
              }
            />
          </div>
        ) : (
          (() => {
            const displayedLetters = letters.filter((l) => {
              if (activeFilter === "unread") return !l.isOpened;
              return true;
            });

            if (displayedLetters.length === 0) {
              return (
                <div className="py-12 text-center space-y-2">
                  <p className="text-sm font-serif italic text-ink-muted">
                    {activeFilter === "unread"
                      ? locale === "bn"
                        ? "কোনো অপঠিত চিঠি নেই।"
                        : "No unread letters at the moment."
                      : locale === "bn"
                      ? "কোনো চিঠি পাওয়া যায়নি।"
                      : "No letters found."}
                  </p>
                  {activeFilter === "unread" && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter("all")}
                      className="text-xs font-mono text-wax hover:underline cursor-pointer"
                    >
                      {locale === "bn" ? "সকল চিঠি দেখুন" : "View all letters"}
                    </button>
                  )}
                </div>
              );
            }

            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {displayedLetters.map((ltr) => (
                    <EnvelopeCard
                      key={ltr.id}
                      letter={ltr}
                      onClick={() => handleOpenLetter(ltr.id)}
                      isOpening={openingLetterId === ltr.id}
                    />
                  ))}
                </div>

                {nextCursor !== null && (
                  <div className="flex justify-center pt-6">
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="px-6 py-2.5 rounded-full text-xs font-mono font-medium border border-edge text-ink-muted bg-surface/40 hover:bg-edge/40 transition-colors disabled:opacity-50"
                    >
                      {isLoadingMore
                        ? locale === "bn"
                          ? "চিঠি লোড হচ্ছে..."
                          : "Loading more letters..."
                        : locale === "bn"
                        ? "আরও চিঠি দেখুন"
                        : "Load more letters"}
                    </button>
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>

      {/* 3D Envelope Opening Animation (§11.4) */}
      <EnvelopeOpenAnimation
        isOpening={isAnimatingOpen}
        onAnimationComplete={() => {
          setIsAnimatingOpen(false);
          setIsReaderOpen(true);
        }}
      />

      {/* Full Letter Reader Modal */}
      <LetterReader
        letter={activeLetter}
        isOpen={isReaderOpen}
        onClose={() => {
          setIsReaderOpen(false);
          setActiveLetter(null);
        }}
        username={username}
        onDelete={handleDeleteLetter}
        onPublish={handlePublishLetter}
        onReact={handleReactToLetter}
        onDownloadPostcard={(ltr) => {
          setPostcardLetter(ltr);
          // useDownloadPostcard waits for the canvas to render the new letter
          // before capturing, so no fixed timeout is needed here.
          downloadPostcard(ltr);
        }}
        onReport={(id) => setReportTargetId(id)}
      />

      {/* Locked Letter Gate Modal (Capsule or Riddle) */}
      <Modal
        isOpen={Boolean(lockedGateData)}
        onClose={() => setLockedGateData(null)}
      >
        {lockedGateData && (
          <LockedLetterGate
            letterId={lockedGateData.letterId}
            lockKind={lockedGateData.lockKind}
            unlockAt={lockedGateData.unlockAt}
            riddleQuestion={lockedGateData.question}
            attemptsRemaining={lockedGateData.attemptsLeft}
            username={username}
            onUnlocked={handleUnlockedRiddle}
          />
        )}
      </Modal>

      {/* Keys & Passcode Modal */}
      <Modal
        isOpen={isKeyCardOpen}
        onClose={() => {
          setIsKeyCardOpen(false);
          if (typeof window !== "undefined") {
            sessionStorage.removeItem(`chithi:passcode:${usernameLower}`);
          }
        }}
        maxWidth="max-w-xl"
      >
        <MailboxKeyCard
          username={username}
          recoveryPasscode={createdPasscode || undefined}
          isInitialCreation={Boolean(createdPasscode)}
          publicUrl={publicLink}
        />
      </Modal>

      {/* Report Modal */}
      <ReportDialog
        isOpen={Boolean(reportTargetId)}
        onClose={() => setReportTargetId(null)}
        targetType="letter"
        targetId={reportTargetId}
      />

      {/* Off-screen Postcard Canvas for 1080x1920 exports (§14) */}
      <PostcardCanvas letter={postcardLetter} canvasRef={postcardCanvasRef} />
    </PageShell>
  );
}
