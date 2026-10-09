"use client";

import React, { useState } from "react";
import { Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useLocale } from "@/hooks/useLocale";

export interface LoginFormProps {
  /** Called with the admin username after a successful login. */
  onSuccess: (username: string) => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { t } = useLocale();
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), passcode }),
      });
      const json = await res.json();
      if (json.ok) {
        setPasscode("");
        onSuccess(json.data.username);
      } else {
        setError(json.error?.message || t("errors.generic"));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-canvas transition-colors">
      <div className="relative w-full max-w-sm p-7 sm:p-8 rounded-3xl bg-surface border border-edge shadow-xl overflow-hidden transition-colors">
        {/* Washi tape accent */}
        <div className="absolute -top-2 left-10 w-24 h-5 washi-tape-buttercup rounded-sm pointer-events-none" />

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-peach/50 border border-edge flex items-center justify-center text-wax shadow-sm">
            <Lock size={22} strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-muted block">
              {t("admin.login.kicker")}
            </span>
            <h1 className="text-lg font-serif font-bold text-ink">
              {t("admin.login.title")}
            </h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-username"
              className="block text-xs font-mono uppercase tracking-wider text-ink-muted"
            >
              {t("admin.login.usernameLabel")}
            </label>
            <Input
              id="admin-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder={t("admin.login.usernamePlaceholder")}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="admin-passcode"
              className="block text-xs font-mono uppercase tracking-wider text-ink-muted"
            >
              {t("admin.login.passcodeLabel")}
            </label>
            <Input
              id="admin-passcode"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={passcode}
              onChange={(e) =>
                setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              autoComplete="current-password"
              placeholder="••••••"
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-xs text-danger leading-relaxed"
            >
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            disabled={isLoading || username.trim().length === 0 || passcode.length !== 6}
            className="w-full rounded-full cursor-pointer"
          >
            {t("admin.login.submit")}
          </Button>
        </form>

        <p className="mt-5 text-center text-[11px] text-ink-muted leading-relaxed">
          {t("admin.login.hint")}
        </p>
      </div>
    </div>
  );
}
