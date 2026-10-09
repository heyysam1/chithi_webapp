"use client";

import React, { useState } from "react";
import {
  Flag,
  LayoutDashboard,
  LogOut,
  Mail,
  Package,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
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

const TAB_ICONS: Record<AdminTabId, React.ReactNode> = {
  overview: <LayoutDashboard size={17} strokeWidth={1.5} />,
  mailboxes: <Mail size={17} strokeWidth={1.5} />,
  bottles: <Package size={17} strokeWidth={1.5} />,
  features: <Sparkles size={17} strokeWidth={1.5} />,
  reports: <Flag size={17} strokeWidth={1.5} />,
  users: <Users size={17} strokeWidth={1.5} />,
  system: <Settings size={17} strokeWidth={1.5} />,
};

export function AdminShell({ username, onLogout, tabs }: AdminShellProps) {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState<AdminTabId>("overview");

  const byId = new Map<AdminTabId, React.ReactNode>(
    tabs.map((tab) => [tab.id, tab.content])
  );
  const activeContent = byId.get(activeTab);
  const visibleTabs = ADMIN_TAB_ORDER.filter((id) => byId.has(id));

  const navItemClass = (isActive: boolean) =>
    `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm border transition-colors cursor-pointer ${
      isActive
        ? "bg-peach/50 border-peach-hover/40 text-ink font-semibold"
        : "border-transparent text-ink-muted hover:text-ink hover:bg-canvas"
    }`;

  return (
    <div className="min-h-screen bg-canvas transition-colors md:flex">
      {/* Desktop left sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-edge bg-surface px-4 py-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-2xl bg-peach/50 border border-edge flex items-center justify-center text-wax shadow-sm shrink-0">
            <ShieldCheck size={18} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="font-serif font-bold text-ink leading-tight truncate">
              {t("admin.shell.title")}
            </p>
            <p className="text-[11px] font-mono text-ink-muted truncate">
              @{username}
            </p>
          </div>
        </div>

        <nav aria-label={t("admin.shell.navLabel")} className="mt-8 space-y-1 flex-1">
          {visibleTabs.map((id) => {
            const isActive = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? "page" : undefined}
                className={navItemClass(isActive)}
              >
                <span className={isActive ? "text-wax" : "text-ink-muted"}>
                  {TAB_ICONS[id]}
                </span>
                <span>{t(`admin.nav.${id}`)}</span>
              </button>
            );
          })}
        </nav>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="justify-start gap-3 px-3.5 cursor-pointer"
        >
          <LogOut size={17} strokeWidth={1.5} />
          <span>{t("admin.shell.logout")}</span>
        </Button>
      </aside>

      {/* Mobile compact top bar */}
      <div className="md:hidden sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-edge">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-peach/50 border border-edge flex items-center justify-center text-wax shrink-0">
            <ShieldCheck size={16} strokeWidth={1.5} />
          </div>
          <p className="font-serif font-bold text-ink truncate flex-1">
            {t("admin.shell.title")}
          </p>
          <button
            type="button"
            onClick={onLogout}
            aria-label={t("admin.shell.logout")}
            className="w-9 h-9 rounded-xl border border-edge text-ink-muted hover:text-ink flex items-center justify-center cursor-pointer"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </div>
        <nav
          aria-label={t("admin.shell.navLabel")}
          className="flex gap-1.5 overflow-x-auto px-4 pb-3"
        >
          {visibleTabs.map((id) => {
            const isActive = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? "page" : undefined}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                  isActive
                    ? "bg-peach/60 border-peach-hover/40 text-ink font-semibold"
                    : "bg-surface border-edge text-ink-muted"
                }`}
              >
                {TAB_ICONS[id]}
                <span>{t(`admin.nav.${id}`)}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <main key={activeTab} className="animate-fadeIn">
            {activeContent}
          </main>
        </div>
      </div>
    </div>
  );
}
