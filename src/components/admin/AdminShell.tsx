"use client";

import React, { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/hooks/useLocale";

/**
 * Admin dashboard tab identifiers, in display (hierarchy) order:
 * Overview → Mailboxes → Letters & Bottles → Features → Reports → Users → System.
 */
export type AdminTabId =
  | "overview"
  | "mailboxes"
  | "bottles"
  | "features"
  | "reports"
  | "users"
  | "system";

export const ADMIN_TAB_ORDER: AdminTabId[] = [
  "overview",
  "mailboxes",
  "bottles",
  "features",
  "reports",
  "users",
  "system",
];

/**
 * One dashboard tab. Sibling agents provide the real `content` per tab
 * (OverviewTab, MailboxesTab, BottlesTab, FeaturesTab, ReportsTab,
 * UsersTab, SystemTab). AdminShell only owns the tab state and chrome.
 */
export interface AdminTab {
  id: AdminTabId;
  content: React.ReactNode;
}

export interface AdminShellProps {
  /** Admin username from the login response. */
  username: string;
  /** Called when the logout button is pressed. */
  onLogout: () => void;
  /** Tab definitions in any order; AdminShell renders them in ADMIN_TAB_ORDER. */
  tabs: AdminTab[];
}

export function AdminShell({ username, onLogout, tabs }: AdminShellProps) {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState<AdminTabId>("overview");

  const byId = new Map<AdminTabId, React.ReactNode>(
    tabs.map((tab) => [tab.id, tab.content])
  );
  const activeContent = byId.get(activeTab);

  return (
    <div className="min-h-screen bg-canvas transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <div className="relative p-5 sm:p-6 rounded-3xl bg-surface border border-edge shadow-xl overflow-hidden transition-colors">
          <div className="absolute -top-2 left-10 w-24 h-5 washi-tape-sage rounded-sm pointer-events-none" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-peach/50 border border-edge flex items-center justify-center text-wax shadow-sm shrink-0">
                <ShieldCheck size={20} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-serif font-bold text-ink truncate">
                  {t("admin.shell.title")}
                </h1>
                <span className="inline-block mt-0.5 text-[11px] font-mono uppercase tracking-wider text-ink-muted bg-canvas border border-edge rounded-full px-2.5 py-0.5">
                  @{username}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="gap-2 shrink-0 cursor-pointer"
            >
              <LogOut size={15} strokeWidth={1.5} />
              <span className="hidden sm:inline">{t("admin.shell.logout")}</span>
            </Button>
          </div>
        </div>

        {/* Tab nav */}
        <nav
          aria-label={t("admin.shell.navLabel")}
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        >
          {ADMIN_TAB_ORDER.filter((id) => byId.has(id)).map((id) => {
            const isActive = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? "page" : undefined}
                className={`shrink-0 px-4 py-2 rounded-full text-xs sm:text-sm font-medium border transition-all cursor-pointer ${
                  isActive
                    ? "bg-peach border-peach-hover text-peach-text shadow-sm font-semibold"
                    : "bg-surface border-edge text-ink-muted hover:text-ink hover:border-wax"
                }`}
              >
                {t(`admin.nav.${id}`)}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <main key={activeTab} className="animate-fadeIn">
          {activeContent}
        </main>
      </div>
    </div>
  );
}
