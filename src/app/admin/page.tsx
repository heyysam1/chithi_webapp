"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminShell, type AdminTab } from "@/components/admin/AdminShell";
import { LoginForm } from "@/components/admin/LoginForm";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { MailboxesTab } from "@/components/admin/MailboxesTab";
import { BottlesTab } from "@/components/admin/BottlesTab";
import { FeaturesTab } from "@/components/admin/FeaturesTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { SystemTab } from "@/components/admin/SystemTab";
import { useLocale } from "@/hooks/useLocale";

type AuthState = "checking" | "authed" | "guest";

function LoadingScreen() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas transition-colors">
      <div
        className="w-10 h-10 rounded-full border-2 border-edge border-t-wax animate-spin"
        role="status"
        aria-label={t("admin.page.title")}
      />
    </div>
  );
}

/**
 * /admin — unlisted admin page (no nav links point here).
 * Shows the login form until POST /api/admin/login succeeds; the session
 * cookie then keeps the admin authenticated (tab close = logout).
 */
export default function AdminPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [adminUser, setAdminUser] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/me");
      const json = await res.json();
      if (json.ok) {
        setAdminUser(json.data.username);
        setAuthState("authed");
      } else {
        setAuthState("guest");
      }
    } catch {
      setAuthState("guest");
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleLoginSuccess = useCallback((username: string) => {
    setAdminUser(username);
    setAuthState("authed");
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Even if the request fails, drop the local state.
    }
    setAdminUser(null);
    setAuthState("guest");
  }, []);

  if (authState === "checking") {
    return <LoadingScreen />;
  }

  if (authState === "guest" || !adminUser) {
    return <LoginForm onSuccess={handleLoginSuccess} />;
  }

  const tabs: AdminTab[] = [
    { id: "overview", content: <OverviewTab /> },
    { id: "mailboxes", content: <MailboxesTab /> },
    { id: "bottles", content: <BottlesTab /> },
    { id: "features", content: <FeaturesTab /> },
    { id: "reports", content: <ReportsTab /> },
    { id: "users", content: <UsersTab /> },
    { id: "system", content: <SystemTab /> },
  ];

  return <AdminShell username={adminUser} onLogout={handleLogout} tabs={tabs} />;
}
