"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { LocaleToggle } from "./LocaleToggle";
import { ThemeToggle } from "./ThemeToggle";
import { useLocale } from "@/hooks/useLocale";
import { useSession } from "@/hooks/useSession";
import { useCountdown } from "@/hooks/useCountdown";
import { Scroll, Waves, KeyRound, Clock } from "lucide-react";

export function Header() {
  const { t } = useLocale();
  const { activeSession, activeUsername } = useSession();

  const activeUser = activeUsername;
  const expiresAt = activeSession?.expiresAt || 0;
  const countdown = useCountdown(expiresAt);

  // Hover/tap micro-interactions are pure CSS (motion-safe only) so that
  // framer-motion does not ship in the global layout bundle.

  return (
    <header className="relative z-40 w-full bg-canvas/90 backdrop-blur-md border-b border-edge transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-1.5 xs:px-3 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-1 xs:gap-1.5 sm:gap-4">
        {/* Brand Logo & Wordmark Left */}
        <Link
          href="/"
          className="group inline-flex items-center gap-1 sm:gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-wax focus-visible:outline-offset-2 rounded-xl py-1 px-0.5 xs:px-1 shrink-0"
        >
          <div className="relative w-7 h-7 sm:w-9 sm:h-9 shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-2">
            <Image
              src="/logo.png"
              alt="Chithi Logo"
              width={36}
              height={36}
              className="w-full h-full object-contain drop-shadow-sm"
              priority
            />
          </div>
          <div className="inline-flex items-baseline gap-1 sm:gap-1.5">
            <span className="font-serif text-lg sm:text-3xl font-bold tracking-tight text-ink dark:text-ink-heading group-hover:text-wax transition-colors">
              Chithi
            </span>
            <span className="hidden xs:inline font-serif text-xs sm:text-base font-normal text-wax group-hover:text-wax-dim transition-colors">
              চিঠি
            </span>
          </div>
        </Link>

        {/* Center: Stylized Navigation Pill Buttons (Desktop) */}
        <div className="hidden md:flex items-center gap-3">
          {/* Benami Kham (Public Wall) Interactive Pill */}
          <Link href="/feed">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-edge bg-surface hover:bg-peach/30 dark:hover:bg-surface-raised text-ink text-xs font-medium shadow-sm transition-all motion-safe:hover:scale-[1.03] motion-safe:hover:-translate-y-[1px] motion-safe:active:scale-[0.97] cursor-pointer group">
              <Scroll size={15} strokeWidth={1.5} className="text-wax group-hover:rotate-6 transition-transform" aria-hidden="true" />
              <span>{t("nav.benamiKham")}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-wax/70 group-hover:bg-wax animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            </div>
          </Link>

          {/* Bottle Drop Interactive Pill */}
          <Link href="/bottle">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-edge bg-surface hover:bg-peach/30 dark:hover:bg-surface-raised text-ink text-xs font-medium shadow-sm transition-all motion-safe:hover:scale-[1.03] motion-safe:hover:-translate-y-[1px] motion-safe:active:scale-[0.97] cursor-pointer group">
              <Waves size={15} strokeWidth={1.5} className="text-skymist-text group-hover:text-wax transition-colors" aria-hidden="true" />
              <span>{t("nav.driftBottle")}</span>
            </div>
          </Link>
        </div>

        {/* Right: Active Session Navigation to /profile OR Login + Theme + Locale Toggle */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0 min-w-0">
          {activeUser ? (
            /* Active Mailbox Navigation Link to /profile */
            <Link
              href="/profile"
              aria-label={t("nav.profileAria", { username: activeUser })}
              className="min-w-0"
            >
              <div className="inline-flex items-center gap-1 sm:gap-2 px-1.5 xs:px-2 sm:px-4 py-1 sm:py-1.5 rounded-full bg-surface border border-edge text-xs font-medium text-ink shadow-sm hover:border-wax hover:shadow-md transition-all motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97] cursor-pointer min-w-0">
                <div className="w-5 h-5 rounded-full bg-wax text-[11px] font-serif font-bold text-white flex items-center justify-center shrink-0">
                  {activeUser.charAt(0).toUpperCase()}
                </div>
                <span className="font-mono text-ink dark:text-ink-heading font-semibold truncate max-w-[44px] xs:max-w-[70px] sm:max-w-[120px]">
                  @{activeUser}
                </span>
                {expiresAt > 0 && !countdown.isExpired && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-ink-muted border-l border-edge pl-2">
                    <Clock size={12} className="text-wax" aria-hidden="true" />
                    <span>{countdown.formatted}</span>
                  </span>
                )}
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" />
              </div>
            </Link>
          ) : (
            /* No Session: Prominent Passcode Login Button with responsive text */
            <Link href="/recover" className="min-w-0">
              <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-full border border-edge bg-surface hover:bg-peach/30 dark:hover:bg-surface-raised hover:border-wax text-xs font-medium text-ink-muted hover:text-ink dark:hover:text-ink-heading shadow-sm transition-all motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97] cursor-pointer min-w-0">
                <KeyRound size={13} strokeWidth={1.5} className="text-wax shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{t("nav.loginWithPasscode")}</span>
                <span className="sm:hidden truncate max-w-[70px]">{t("nav.loginShort")}</span>
              </div>
            </Link>
          )}

          <ThemeToggle />
          <LocaleToggle />
        </div>
      </div>
    </header>
  );
}
