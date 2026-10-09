"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { useLocale } from "@/hooks/useLocale";
import { useAccessToken } from "@/hooks/useAccessToken";
import { useSession } from "@/hooks/useSession";
import { KeyRound, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { savePasscode } from "@/lib/passcodeStorage";

function RecoverForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { refresh } = useSession();

  const queryUsername = searchParams?.get("username") || "";

  const [name, setName] = useState("");
  const [username, setUsername] = useState(queryUsername);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  // After a successful recovery the server rotates the passcode (the old one
  // no longer works), so the new one must be shown before leaving this page.
  const [recovered, setRecovered] = useState<{ username: string; recoveryPasscode: string } | null>(null);

  useEffect(() => {
    if (queryUsername && !username) {
      setUsername(queryUsername);
    }
  }, [queryUsername, username]);

  const { saveToken } = useAccessToken(username);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleDigitChange = (index: number, val: string) => {
    // Only allow single numeric digit
    const cleaned = val.replace(/\D/g, "");
    if (!cleaned) {
      const updated = [...digits];
      updated[index] = "";
      setDigits(updated);
      return;
    }

    const updated = [...digits];
    updated[index] = cleaned.slice(-1);
    setDigits(updated);

    // Auto-advance to next digit
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < pastedData.length; i++) {
      newDigits[i] = pastedData[i] || "";
    }
    setDigits(newDigits);

    const nextIndex = Math.min(5, pastedData.length);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const passcode = digits.join("");

    if (!name.trim() || !username.trim() || passcode.length !== 6) {
      setErrorMsg(t("errors.validation.failed"));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setRetryAfter(null);

    try {
      const res = await fetch("/api/mailbox/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          passcode,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        saveToken(json.data.accessToken);
        await refresh();
        // Do NOT redirect yet: the server rotated the passcode, and the new
        // one is shown only once. Let the user save it first.
        if (typeof window !== "undefined" && json.data.recoveryPasscode) {
          savePasscode(String(json.data.username), json.data.recoveryPasscode);
        }
        setRecovered({
          username: json.data.username,
          recoveryPasscode: json.data.recoveryPasscode,
        });
      } else {
        if (res.status === 429) {
          const retryHeader = res.headers.get("Retry-After");
          const waitSec = retryHeader ? parseInt(retryHeader, 10) : 60;
          setRetryAfter(waitSec);
          setErrorMsg(t("errors.rateLimited"));
        } else {
          setErrorMsg(t("errors.recoveryFailed"));
        }
      }
    } catch {
      setErrorMsg(t("errors.generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell>
      <div className="max-w-md mx-auto py-12 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl border border-warn-edge flex items-center justify-center text-wax bg-warn-surface mx-auto mb-3 shadow-sm">
            <KeyRound size={22} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-ink">
            {t("recover.title")}
          </h1>
          <p className="text-xs text-ink-muted leading-relaxed">
            {t("recover.subtitle")}
          </p>
        </div>

        <div className="border border-edge rounded-2xl sm:rounded-3xl bg-surface p-4 sm:p-8 shadow-xl relative">

          {recovered ? (
            <div className="space-y-5 text-center">
              <div className="w-12 h-12 rounded-2xl border border-success-edge flex items-center justify-center text-success bg-success-surface mx-auto shadow-sm">
                <KeyRound size={22} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h2 className="text-xl font-serif font-bold text-ink">
                {t("recover.successTitle")}
              </h2>
              <div className="text-left">
                <CopyField
                  value={recovered.recoveryPasscode}
                  label={t("recover.newPasscodeTitle")}
                  helperText={t("recover.newPasscodeDesc")}
                  isSensitive
                />
              </div>
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full rounded-full"
                onClick={() => router.push(`/inbox/${recovered.username}`)}
              >
                {t("recover.goToInbox")}
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="recover-name" className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                {t("recover.nameLabel")}
              </label>
              <Input
                id="recover-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahim Ahmed"
                maxLength={50}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="recover-username" className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                {t("recover.usernameLabel")}
              </label>
              <Input
                id="recover-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. rahim-ahmed"
                required
              />
            </div>

            {/* Segmented 6-digit input */}
            <div className="space-y-2" role="group" aria-labelledby="passcode-label">
              <span id="passcode-label" className="block text-xs font-mono uppercase tracking-wider text-ink-muted">
                {t("recover.passcodeLabel")}
              </span>
              <div className="flex items-center justify-between gap-1.5 sm:gap-2.5">
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`passcode-digit-${idx + 1}`}
                    aria-label={`Digit ${idx + 1}`}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    className="flex-1 min-w-0 max-w-[48px] h-12 sm:h-14 text-center font-mono text-lg sm:text-xl font-bold bg-surface text-ink border border-edge rounded-xl sm:rounded-2xl focus:outline-none focus:border-wax focus:ring-1 focus:ring-wax transition-all"
                  />
                ))}
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-center gap-2 text-xs text-danger bg-danger/10 p-3 rounded-2xl border border-danger/20"
              >
                <AlertTriangle size={16} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                <span>
                  {errorMsg}
                  {retryAfter ? ` (retry ${formatDistanceToNow(new Date(Date.now() + retryAfter * 1000), { addSuffix: true })})` : null}
                </span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full rounded-full bg-peach hover:bg-peach-hover text-peach-text font-semibold border border-peach-hover shadow-sm"
              isLoading={isSubmitting}
            >
              {t("recover.submit")}
            </Button>
          </form>
          )}
        </div>
      </div>
    </PageShell>
  );
}

export default function RecoverPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="max-w-md mx-auto py-12 space-y-6 animate-pulse text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-edge mx-auto mb-3" />
            <div className="h-6 w-48 bg-surface rounded-full mx-auto" />
            <div className="h-4 w-64 bg-surface rounded-full mx-auto" />
          </div>
        </PageShell>
      }
    >
      <RecoverForm />
    </Suspense>
  );
}
