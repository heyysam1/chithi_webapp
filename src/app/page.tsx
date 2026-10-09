"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { MailboxKeyCard } from "@/components/inbox/MailboxKeyCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/useToast";
import { useCountdown } from "@/hooks/useCountdown";
import { DurationKey, Gender } from "@/lib/types";
import { DURATIONS, USERNAME_REGEX } from "@/lib/constants";
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  Mail,
  Send,
  Scroll,
  Waves,
  KeyRound,
  Sparkles,
  Clock,
  User,
  Inbox,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "@/hooks/useSession";
import { suggestUsernameFromName } from "@/lib/ids";
import { PaperCutStamp, PostmarkSeal, AirmailTape, PaperScrap } from "@/components/ui/PaperCutSticker";

interface CreatedMailboxState {
  username: string;
  accessToken: string;
  recoveryPasscode: string;
  expiresAt: number;
  inboxUrl: string;
  publicUrl: string;
}

export default function HomePage() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { showToast } = useToast();

  const { activeSession, activeUsername, refresh: refreshSession, isLoading: isSessionLoading } = useSession();
  const activeUser = activeUsername;
  const isSessionLoaded = !isSessionLoading;
  const expiresAt = activeSession?.expiresAt || 0;
  const countdown = useCountdown(expiresAt);

  // Guest tabs: "create" or "send"
  const [activeTab, setActiveTab] = useState<"create" | "send">("create");

  // Create Mailbox State
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [isUsernameManuallyEdited, setIsUsernameManuallyEdited] = useState(false);
  const [durationKey, setDurationKey] = useState<DurationKey>("24h");
  const [gender, setGender] = useState<Gender>("unspecified");
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [takenMailboxName, setTakenMailboxName] = useState<string | null>(null);
  const [createdMailbox, setCreatedMailbox] = useState<CreatedMailboxState | null>(null);

  // Send / Find Mailbox State (shared by both Guest Tab 2 and Authenticated Hub)
  const [searchUsername, setSearchUsername] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "checking" | "found" | "not_found">("idle");

  // 3. Username availability check debounced 400ms with automatic collision resolution for suggestions
  // Sequence guard: stale responses from earlier keystrokes must not
  // overwrite the indicator for the current username.
  const availabilitySeqRef = useRef(0);

  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || trimmed.length < 3) {
      setAvailability("idle");
      return;
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      setAvailability("taken");
      return;
    }

    setAvailability("checking");
    const seq = ++availabilitySeqRef.current;
    const isStale = () => availabilitySeqRef.current !== seq;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mailbox/${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (isStale()) return;
        if (json.ok && json.data?.exists) {
          setAvailability("taken");
          // If collision occurs on an automatic suggestion, generate a suitable alternative
          if (!isUsernameManuallyEdited && name.trim()) {
            const alternative = `${trimmed.slice(0, 16)}-${Math.floor(10 + Math.random() * 90)}`;
            setUsername(alternative);
          }
        } else if (res.status === 404 || !json.ok) {
          setAvailability("available");
        } else {
          setAvailability("available");
        }
      } catch {
        if (isStale()) return;
        setAvailability("available");
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [username, isUsernameManuallyEdited, name]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    setFormError(null);
    if (!isUsernameManuallyEdited) {
      const suggested = suggestUsernameFromName(val);
      setUsername(suggested);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsUsernameManuallyEdited(true);
    setFormError(null);
    setUsername(e.target.value);
  };

  // 4. Recipient search debounced 400ms (same stale-response guard as above)
  const searchSeqRef = useRef(0);

  useEffect(() => {
    const trimmed = searchUsername.trim().toLowerCase();
    if (!trimmed || trimmed.length < 3) {
      setSearchStatus("idle");
      return;
    }

    setSearchStatus("checking");
    const seq = ++searchSeqRef.current;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mailbox/${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (searchSeqRef.current !== seq) return;
        if (json.ok && json.data?.exists) {
          setSearchStatus("found");
        } else {
          setSearchStatus("not_found");
        }
      } catch {
        if (searchSeqRef.current !== seq) return;
        setSearchStatus("not_found");
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchUsername]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setTakenMailboxName(null);

    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedName) {
      const msg = locale === "bn" ? "অনুগ্রহ করে আপনার নাম লিখুন" : "Please enter your name";
      setFormError(msg);
      showToast(msg, "warn");
      return;
    }

    if (!trimmedUsername) {
      const msg = locale === "bn" ? "অনুগ্রহ করে একটি ইউজারনেম দিন" : "Please choose a username";
      setFormError(msg);
      showToast(msg, "warn");
      return;
    }

    if (availability === "taken") {
      const takenMsg = t("home.usernameTaken");
      setFormError(takenMsg);
      setTakenMailboxName(trimmedUsername);
      showToast(takenMsg, "warn");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/mailbox/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          username: trimmedUsername,
          durationKey,
          gender,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        const created = json.data;
        setCreatedMailbox(created);
        if (typeof window !== "undefined") {
          localStorage.setItem(`chithi:token:${created.username.toLowerCase()}`, created.accessToken);
          localStorage.setItem("chithi:active", created.username.toLowerCase());
          sessionStorage.setItem(`chithi:passcode:${created.username.toLowerCase()}`, created.recoveryPasscode);
        }
        refreshSession().catch(() => {});
        router.push(`/inbox/${created.username}?key=${encodeURIComponent(created.accessToken)}`);
      } else {
        if (res.status === 409 || json.error?.code === "USERNAME_TAKEN") {
          setAvailability("taken");
          setTakenMailboxName(trimmedUsername);
          const errorText =
            locale === "bn"
              ? `"${trimmedUsername}" নামের ডাকবাক্সটি আগেই তৈরি করা হয়েছে।`
              : `Mailbox "${trimmedUsername}" already exists.`;
          setFormError(errorText);
          showToast(errorText, "warn");
        } else if (res.status === 429) {
          const rateMsg = t("errors.rateLimited");
          setFormError(rateMsg);
          showToast(rateMsg, "error");
        } else {
          const genericMsg = t(json.error?.message || "errors.generic");
          setFormError(genericMsg);
          showToast(genericMsg, "error");
        }
      }
    } catch {
      const genericMsg = t("errors.generic");
      setFormError(genericMsg);
      showToast(genericMsg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const durationOptions: DurationKey[] = ["12h", "24h", "3d", "7d"];

  // Whether user is authenticated and active
  const isAuthenticated = Boolean(
    isSessionLoaded &&
      activeUser &&
      (!expiresAt || !countdown.isExpired)
  );

  return (
    <PageShell>
      <div className="space-y-16 md:space-y-24 pb-36 sm:pb-44">
        {/* =========================================================================
            SCENARIO A — ACTIVE LOGGED-IN MAILBOX (Section 9)
            Strictly hide Create Mailbox form. Render Authenticated Mailbox Hub.
           ========================================================================= */}
        {isAuthenticated && activeUser && !createdMailbox ? (
          <section className="pt-4 md:pt-8 space-y-8">
            {/* 1. Welcoming Banner Card */}
            <div className="relative p-6 sm:p-10 rounded-3xl bg-surface border border-edge shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] overflow-hidden transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-success-surface text-success border border-success-edge">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span>{locale === "bn" ? "সক্রিয় ডাকবাক্স" : "Active Mailbox"}</span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl font-serif font-bold text-ink tracking-tight">
                    {locale === "bn"
                      ? `স্বাগতম, @${activeUser}`
                      : `Welcome back, @${activeUser}`}
                  </h1>
                  <p className="text-sm text-ink-muted leading-relaxed max-w-lg">
                    {locale === "bn"
                      ? "আপনার গোপন ডাকবাক্স সক্রিয় আছে এবং চিঠি গ্রহণ চলছে।"
                      : "Your secret mailbox is active and ready for letters."}
                  </p>
                </div>

                {/* Redesigned Countdown Box with Explicit Dimensions */}
                <div className="w-full sm:w-[300px] md:w-[320px] min-h-[100px] sm:min-h-[110px] flex flex-col items-center justify-center text-center p-4 sm:p-5 rounded-2xl bg-peach/40 border border-wax/30 dark:bg-black/40 dark:border-white/10 shadow-xl backdrop-blur-md self-center">
                  <div className="text-xs font-mono uppercase tracking-widest text-ink-muted dark:text-stone-400 flex items-center justify-center gap-1.5">
                    <Clock size={14} className="text-wax" />
                    <span>{locale === "bn" ? "সময় বাকি:" : "TIME LEFT:"}</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold font-mono tracking-wider text-wax-dim dark:text-amber-200/95 leading-none my-1.5">
                    {countdown.formatted || "..."}
                  </div>
                  <div className="text-xs text-ink-muted dark:text-stone-400 flex items-center justify-center gap-1 mt-0.5">
                    <Sparkles size={11} className="text-wax" />
                    <span>{locale === "bn" ? "ডাকবাক্স সচল" : "Mailbox Active"}</span>
                  </div>
                </div>
              </div>

              {/* Primary Quick-Action Bar */}
              <div className="pt-6 mt-6 border-t border-edge flex flex-wrap items-center gap-3">
                <Link href={`/inbox/${activeUser}`}>
                  <Button
                    variant="primary"
                    size="lg"
                    className="rounded-full gap-2 font-medium shadow-sm"
                  >
                    <Inbox size={18} strokeWidth={1.5} />
                    <span>{t("home.hub.openInbox")}</span>
                  </Button>
                </Link>

                <Link href="/profile">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="rounded-full bg-canvas hover:bg-surface text-ink border border-edge gap-2 font-medium"
                  >
                    <User size={16} strokeWidth={1.5} className="text-wax" />
                    <span>{t("home.hub.viewProfile")}</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* 2. Recipient Search Box ("কাউকে চিঠি পাঠান") */}
            <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-edge shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] space-y-5 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-warn-surface border border-warn-edge flex items-center justify-center text-wax">
                  <Send size={18} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-serif font-bold text-ink">
                    {locale === "bn" ? "কাউকে চিঠি পাঠান" : "Send a Letter to Someone"}
                  </h2>
                </div>
              </div>

              <div className="space-y-3 max-w-xl">
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-xs font-mono text-ink-muted select-none pointer-events-none">
                    chithi.site/
                  </span>
                  <Input
                    value={searchUsername}
                    onChange={(e) => setSearchUsername(e.target.value.replace(/\s+/g, ""))}
                    placeholder="username"
                    maxLength={20}
                    className="pl-28 rounded-full"
                  />
                  <div className="absolute right-4 text-ink-muted">
                    {searchStatus === "checking" && (
                      <span className="text-xs font-mono animate-pulse text-wax">...</span>
                    )}
                    {searchStatus === "found" && (
                      <CheckCircle size={16} className="text-success" />
                    )}
                    {searchStatus === "not_found" && (
                      <XCircle size={16} className="text-wax" />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-ink-muted px-2">
                  {searchStatus === "found" && (
                    <span className="text-success font-medium">
                      {locale === "bn"
                        ? "ডাকবাক্স সক্রিয় আছে এবং চিঠি নেওয়ার জন্য প্রস্তুত!"
                        : "Mailbox found and ready for letters!"}
                    </span>
                  )}
                  {searchStatus === "not_found" && (
                    <span className="text-wax font-medium">
                      {locale === "bn"
                        ? "এই নামে কোনো সক্রিয় ডাকবাক্স পাওয়া যায়নি।"
                        : "No active mailbox found with this name."}
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={searchStatus !== "found"}
                  onClick={() => router.push(`/${searchUsername.trim().toLowerCase()}`)}
                  className="rounded-full gap-2 text-sm"
                >
                  <span>
                    {locale === "bn"
                      ? `@${searchUsername || "..."}-কে চিঠি লিখুন`
                      : `Write Letter to @${searchUsername || "..."}`}
                  </span>
                  <ArrowRight size={16} strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          </section>
        ) : (
          /* =========================================================================
              SCENARIO B — GUEST / LOGGED OUT (Section 10)
              Show Hero Section + Dual-Tab Container (Create Mailbox vs Send Letter).
             ========================================================================= */
          <section className="pt-6 md:pt-12 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start relative">
            {/* Left: Modern, Charming Hero Section with Paper-cut / Scrapbook elements */}
            <div className="lg:col-span-6 space-y-6 relative">
              <div className="flex items-center gap-3">
                <AirmailTape label="PAR AVION" sublabel="বিমান ডাক · CHITHI" rotation={-3} />
                <Badge variant="buttercup" className="whitespace-nowrap text-[10px] sm:text-[11px]">
                  {t("home.badge")}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-ink tracking-tight">
                    Chithi
                  </h1>
                  <span className="text-2xl sm:text-3xl font-serif text-wax font-normal">
                    চিঠি
                  </span>
                  <PaperCutStamp
                    label="CHITHI"
                    sublabel="পোস্ট"
                    rotation={4}
                    className="hidden sm:inline-block ml-2"
                  />
                </div>
                <h2 className="text-xl sm:text-2xl font-serif italic text-ink-muted leading-snug">
                  {locale === "bn"
                    ? "মনের না বলা কথাগুলো নিঃশব্দে পৌঁছে যাক"
                    : "Letters written for the heart, kept safe in time."}
                </h2>
              </div>

              <p className="text-sm sm:text-base text-ink-muted leading-relaxed max-w-lg">
                {locale === "bn"
                  ? "অ্যাকাউন্ট ছাড়া সম্পূর্ণ বেনামে চিঠি পাওয়ার ব্যক্তিগত ঠিকানা। নির্ধারিত সময় শেষেই সব চিঠি চিরতরে মুছে যাবে।"
                  : t("home.heroDesc")}
              </p>

              {/* Scrapbook Paper Note */}
              <div className="pt-1">
                <PaperScrap
                  text={locale === "bn" ? "মনের কথা খামে ভরে পৌঁছে দিন..." : "Words that matter, sealed in an envelope..."}
                  rotation={1}
                />
              </div>
            </div>

            {/* Right: Dual-Tab Interactive Container (Create vs Send) */}
            <div className="lg:col-span-6">
              {createdMailbox ? (
                <MailboxKeyCard
                  username={createdMailbox.username}
                  recoveryPasscode={createdMailbox.recoveryPasscode}
                  inboxUrl={createdMailbox.inboxUrl}
                  publicUrl={createdMailbox.publicUrl}
                  isInitialCreation={true}
                  onEnterInbox={() => {
                    router.push(`/inbox/${createdMailbox.username}?key=${encodeURIComponent(createdMailbox.accessToken)}`);
                  }}
                />
              ) : (
                <div className="border border-edge rounded-3xl bg-surface p-6 sm:p-8 space-y-6 shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] relative overflow-visible transition-colors">
                  <div className="absolute -top-3 right-8 w-24 h-6 washi-tape-sage rounded-sm pointer-events-none" />
                  <PostmarkSeal
                    city="CHITHI · DAK GHAR"
                    date="SPECIAL AIR"
                    rotation={8}
                    className="absolute -top-6 -right-5 hidden md:inline-flex pointer-events-none z-20"
                  />

                  {/* Animated Dual-Tab Switcher Header */}
                  <div className="flex p-1 bg-canvas rounded-full border border-edge relative">
                    <button
                      type="button"
                      onClick={() => setActiveTab("create")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs sm:text-sm font-medium transition-colors relative z-10 ${
                        activeTab === "create" ? "text-ink" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <Mail size={16} strokeWidth={1.5} className={activeTab === "create" ? "text-wax" : ""} />
                      <span>{locale === "bn" ? "চিঠি পাওয়ার ঠিকানা" : "Create Mailbox"}</span>
                      {activeTab === "create" && (
                        <motion.div
                          layoutId="activeHeroTab"
                          className="absolute inset-0 rounded-full bg-surface border border-edge shadow-sm -z-10"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("send")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs sm:text-sm font-medium transition-colors relative z-10 ${
                        activeTab === "send" ? "text-ink" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <Send size={16} strokeWidth={1.5} className={activeTab === "send" ? "text-wax" : ""} />
                      <span>{locale === "bn" ? "কাউকে চিঠি পাঠান" : "Send a Letter"}</span>
                      {activeTab === "send" && (
                        <motion.div
                          layoutId="activeHeroTab"
                          className="absolute inset-0 rounded-full bg-surface border border-edge shadow-sm -z-10"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    {activeTab === "create" ? (
                      /* Tab 1: Create a Mailbox */
                      <motion.div
                        key="create-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-5"
                      >
                        <div>
                          <h2 className="text-xl font-serif font-bold text-ink">
                            {t("home.createHeading")}
                          </h2>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-5">
                          {/* Name Field (Required) with Live Username Auto-Suggestion */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                              {locale === "bn" ? "আপনার নাম" : "Your Name"}
                            </label>
                            <Input
                              value={name}
                              onChange={handleNameChange}
                              placeholder={locale === "bn" ? "যেমন: রহিম আহমেদ" : "e.g. Rahim Ahmed"}
                              maxLength={50}
                              required
                            />
                          </div>

                          {/* Username Field with Live Validation & Editable Suggestion */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                                {t("home.usernameLabel")}
                              </label>
                              {isUsernameManuallyEdited && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsUsernameManuallyEdited(false);
                                    if (name.trim()) {
                                      setUsername(suggestUsernameFromName(name));
                                    }
                                  }}
                                  className="text-[10px] font-mono text-wax hover:underline cursor-pointer"
                                >
                                  {locale === "bn" ? "পুনরায় সাজেস্ট করুন" : "Reset to suggestion"}
                                </button>
                              )}
                            </div>
                            <div className="relative">
                              <Input
                                value={username}
                                onChange={handleUsernameChange}
                                placeholder={t("home.usernamePlaceholder")}
                                maxLength={20}
                                required
                              />
                              <div className="absolute right-4 top-3 text-ink-muted">
                                {availability === "checking" && (
                                  <span className="text-xs font-mono animate-pulse text-wax">...</span>
                                )}
                                {availability === "available" && (
                                  <CheckCircle size={16} className="text-success" />
                                )}
                                {availability === "taken" && (
                                  <XCircle size={16} className="text-wax" />
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-ink-muted">
                              {availability === "available" && (
                                <span className="text-success font-medium">
                                  {t("home.usernameAvailable")}
                                </span>
                              )}
                              {availability === "taken" && (
                                <span className="text-wax font-medium">
                                  {t("home.usernameTaken")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Lifespan Segmented Options (12h, 24h, 3d, 7d) */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                                {t("home.durationLabel")}
                              </label>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              {durationOptions.map((key) => {
                                const isSelected = durationKey === key;
                                const durationSeconds = DURATIONS[key];
                                const hours = durationSeconds / 3600;
                                const label = hours >= 24 ? `${hours / 24}d` : `${hours}h`;

                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => setDurationKey(key)}
                                    className={`py-2 px-1 text-center font-mono text-xs rounded-xl border transition-all select-none cursor-pointer ${
                                      isSelected
                                        ? "bg-peach border-peach-hover text-peach-text ring-1 ring-peach-hover font-bold shadow-sm"
                                        : "bg-surface border-edge text-ink-muted hover:text-ink hover:border-peach-hover"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Optional Gender for Bottle routing */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                              {t("home.genderLabel")}
                            </label>
                            <Select
                              value={gender}
                              onChange={(e) => setGender(e.target.value as Gender)}
                            >
                              <option value="unspecified">{t("home.genderOptions.unspecified")}</option>
                              <option value="male">{t("home.genderOptions.male")}</option>
                              <option value="female">{t("home.genderOptions.female")}</option>
                              <option value="other">{t("home.genderOptions.other")}</option>
                            </Select>
                          </div>

                          {/* Inline Form Error & Recovery Notice */}
                          {formError && (
                            <div
                              role="alert"
                              className="p-3.5 rounded-2xl bg-warn-surface border border-warn-edge text-xs space-y-2"
                            >
                              <div className="flex items-start gap-2 text-ink">
                                <span className="w-2 h-2 rounded-full bg-wax mt-1 shrink-0" />
                                <span className="font-medium leading-relaxed">{formError}</span>
                              </div>
                              {takenMailboxName && (
                                <div className="pl-4 pt-1 border-t border-warn-edge/60 flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11px] text-ink-muted">
                                    {locale === "bn" ? "এটি কি আপনার ডাকবাক্স?" : "Is this your mailbox?"}
                                  </span>
                                  <Link
                                    href={`/recover?username=${encodeURIComponent(takenMailboxName)}`}
                                    className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-wax hover:underline"
                                  >
                                    <KeyRound size={12} />
                                    <span>{locale === "bn" ? "পাসকোড দিয়ে লগইন করুন →" : "Login with Passcode →"}</span>
                                  </Link>
                                </div>
                              )}
                            </div>
                          )}

                          <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            className="w-full mt-2 rounded-full cursor-pointer"
                            isLoading={isSubmitting}
                            disabled={availability === "taken"}
                          >
                            {t("home.submitCreate")}
                          </Button>
                        </form>

                        {/* Passcode Login Button */}
                        <div className="pt-3 border-t border-edge">
                          <Link
                            href="/recover"
                            className="flex w-full items-center justify-center gap-2 rounded-full border border-edge bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-canvas hover:border-wax transition-colors cursor-pointer"
                          >
                            <KeyRound size={16} strokeWidth={1.5} className="text-wax" />
                            <span>
                              {locale === "bn"
                                ? "আগের তৈরি করা ইনবক্স আছে? পাসকোড দিয়ে লগইন করুন]"
                                : "Already have a mailbox? Login with Passcode"}
                            </span>
                          </Link>
                        </div>
                      </motion.div>
                    ) : (
                      /* Tab 2: Send a Letter / Search Mailbox */
                      <motion.div
                        key="send-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-6"
                      >
                        <div>
                          <h2 className="text-xl font-serif font-bold text-ink">
                            {locale === "bn" ? "কাউকে চিঠি পাঠান" : "Send a Letter"}
                          </h2>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                              {locale === "bn" ? "প্রাপকের ডাকবাক্স" : "Recipient Username"}
                            </label>
                            <div className="relative flex items-center">
                              <span className="absolute left-4 text-xs font-mono text-ink-muted select-none pointer-events-none">
                                chithi.site/
                              </span>
                              <Input
                                value={searchUsername}
                                onChange={(e) => setSearchUsername(e.target.value.replace(/\s+/g, ""))}
                                placeholder="username"
                                maxLength={20}
                                className="pl-28 rounded-full"
                              />
                              <div className="absolute right-4 text-ink-muted">
                                {searchStatus === "checking" && (
                                  <span className="text-xs font-mono animate-pulse text-wax">...</span>
                                )}
                                {searchStatus === "found" && (
                                  <CheckCircle size={16} className="text-success" />
                                )}
                                {searchStatus === "not_found" && (
                                  <XCircle size={16} className="text-wax" />
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-ink-muted px-2">
                              {searchStatus === "found" && (
                                <span className="text-success font-medium">
                                  {locale === "bn"
                                    ? "ডাকবাক্স সক্রিয় আছে এবং চিঠি নেওয়ার জন্য প্রস্তুত!"
                                    : "Mailbox found and ready for letters!"}
                                </span>
                              )}
                              {searchStatus === "not_found" && (
                                <span className="text-wax font-medium">
                                  {locale === "bn"
                                    ? "এই নামে কোনো সক্রিয় ডাকবাক্স পাওয়া যায়নি।"
                                    : "No active mailbox found with this name."}
                                </span>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="primary"
                            size="lg"
                            disabled={searchStatus !== "found"}
                            onClick={() => router.push(`/${searchUsername.trim().toLowerCase()}`)}
                            className="w-full rounded-full gap-2 text-sm"
                          >
                            <span>
                              {locale === "bn"
                                ? `@${searchUsername || "..."}-কে চিঠি লিখুন`
                                : `Write Letter to @${searchUsername || "..."}`}
                            </span>
                            <ArrowRight size={16} strokeWidth={1.5} />
                          </Button>
                        </div>

                        {/* Alternate Exploration Tips */}
                        <div className="p-4 rounded-2xl bg-canvas border border-edge space-y-2 text-xs text-ink-muted">
                          <div className="flex items-center gap-1.5 text-wax font-medium">
                            <Sparkles size={14} strokeWidth={1.5} />
                            <span>{locale === "bn" ? "নির্দিষ্ট কোনো প্রাপক নেই?" : "No specific recipient?"}</span>
                          </div>
                          <Link href="/bottle" className="text-[11px] text-wax font-medium underline underline-offset-2 block pt-1">
                            {locale === "bn" ? "চিঠির বোতল ভাসান →" : "Drift a Bottle →"}
                          </Link>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Discovery Postcards Strip (Benami Kham & Drift Bottle) */}
        <section className="space-y-6 pt-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-ink">
              {locale === "bn" ? "চিঠির জগৎ ঘুরে দেখুন" : "Explore the Universe of Letters"}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Benami Kham Discovery Card */}
            <Link href="/feed" className="group block">
              <motion.div
                whileHover={{ y: -4, scale: 1.01 }}
                className="h-full p-6 sm:p-8 rounded-3xl border border-edge bg-surface hover:border-wax shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] transition-all relative overflow-hidden"
              >
                <div className="absolute -top-3 left-8 w-24 h-5 washi-tape-buttercup rounded-sm pointer-events-none" />

                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-warn-surface border border-warn-edge flex items-center justify-center text-wax group-hover:scale-110 transition-transform">
                    <Scroll size={24} strokeWidth={1.5} />
                  </div>
                  <span className="px-3 py-1 rounded-full text-[11px] font-mono tracking-wider bg-warn-surface text-warn-text border border-warn-edge flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-wax animate-pulse" />
                    {locale === "bn" ? "পাবলিক ওয়াল" : "Community Feed"}
                  </span>
                </div>

                <h3 className="text-xl font-serif font-bold text-ink group-hover:text-wax transition-colors mb-2">
                  {locale === "bn" ? "বেনামী খাম পড়ুন" : "Read Benami Kham"}
                </h3>

                <div className="flex items-center gap-2 text-xs font-serif text-wax group-hover:translate-x-1 transition-transform">
                  <span>{locale === "bn" ? "দেওয়ালে যান" : "Explore Public Wall"}</span>
                  <ArrowRight size={14} strokeWidth={1.5} />
                </div>
              </motion.div>
            </Link>

            {/* Bottle Drop Discovery Card */}
            <Link href="/bottle" className="group block">
              <motion.div
                whileHover={{ y: -4, scale: 1.01 }}
                className="h-full p-6 sm:p-8 rounded-3xl border border-edge bg-surface hover:border-skymist-text shadow-[0_12px_32px_-8px_rgba(78,59,44,0.06)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] transition-all relative overflow-hidden"
              >
                <div className="absolute -top-3 left-8 w-24 h-5 washi-tape-skymist rounded-sm pointer-events-none" />

                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-skymist border border-skymist-text/30 flex items-center justify-center text-skymist-text group-hover:scale-110 transition-transform">
                    <Waves size={24} strokeWidth={1.5} />
                  </div>
                  <span className="px-3 py-1 rounded-full text-[11px] font-mono tracking-wider bg-skymist text-skymist-text border border-skymist-text/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-skymist-text animate-pulse" />
                    {locale === "bn" ? "সাগরে ভাসান" : "Drift Bottle"}
                  </span>
                </div>

                <h3 className="text-xl font-serif font-bold text-ink group-hover:text-wax transition-colors mb-2">
                  {locale === "bn" ? "চিঠির বোতল ভাসান" : "Cast a Bottle into the Ocean"}
                </h3>

                <div className="flex items-center gap-2 text-xs font-serif text-skymist-text group-hover:translate-x-1 transition-transform">
                  <span>{locale === "bn" ? "সাগরে ভাসান" : "Send Bottle Letter"}</span>
                  <ArrowRight size={14} strokeWidth={1.5} />
                </div>
              </motion.div>
            </Link>
          </div>
        </section>

        {/* How it works in warm prose */}
        <section className="space-y-10 max-w-4xl mx-auto pt-6 border-t border-edge">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-serif font-bold text-ink">
              {t("home.howItWorksHeading")}
            </h3>
          </div>

          <div className="space-y-8 divide-y divide-edge">
            <div className="pt-6 space-y-2">
              <h4 className="text-base font-serif font-semibold text-wax">
                {t("home.step1Title")}
              </h4>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t("home.step1Desc")}
              </p>
            </div>

            <div className="pt-6 space-y-2">
              <h4 className="text-base font-serif font-semibold text-wax">
                {t("home.step2Title")}
              </h4>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t("home.step2Desc")}
              </p>
            </div>

            <div className="pt-6 space-y-2">
              <h4 className="text-base font-serif font-semibold text-wax">
                {t("home.step3Title")}
              </h4>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t("home.step3Desc")}
              </p>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
