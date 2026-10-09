"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Manages client UI access token state for mailbox owners.
 * Note: Authentic session security relies on server-issued HttpOnly cookies.
 * Client storage is maintained solely for optimistic UI rendering and active key links.
 *
 * The token is kept in sessionStorage (tab-scoped, never written to disk)
 * instead of localStorage. A one-time migration moves any token previously
 * stored in localStorage over, so older sessions keep working.
 */
function readStoredToken(usernameLower: string): string | null {
  try {
    const fromSession = sessionStorage.getItem(`chithi:token:${usernameLower}`);
    if (fromSession) return fromSession;
    // One-time migration from the legacy localStorage location.
    const legacy = localStorage.getItem(`chithi:token:${usernameLower}`);
    if (legacy) {
      sessionStorage.setItem(`chithi:token:${usernameLower}`, legacy);
      localStorage.removeItem(`chithi:token:${usernameLower}`);
      return legacy;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}
export function useAccessToken(username?: string) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const usernameLower = username?.toLowerCase();

  useEffect(() => {
    if (!usernameLower) {
      setIsLoaded(true);
      return;
    }

    try {
      const stored = readStoredToken(usernameLower);
      if (stored) {
        setTokenState(stored);
      }
    } catch {
      // Ignore localStorage read errors
    } finally {
      setIsLoaded(true);
    }
  }, [usernameLower]);

  const saveToken = useCallback(
    (newToken: string) => {
      if (!usernameLower) return;
      setTokenState(newToken);
      try {
        sessionStorage.setItem(`chithi:token:${usernameLower}`, newToken);
      } catch {
        // Ignore storage errors
      }
    },
    [usernameLower]
  );

  const clearToken = useCallback(() => {
    if (!usernameLower) return;
    setTokenState(null);
    try {
      sessionStorage.removeItem(`chithi:token:${usernameLower}`);
      // Also clear any legacy localStorage copy from before the migration.
      localStorage.removeItem(`chithi:token:${usernameLower}`);
    } catch {
      // Ignore storage errors
    }
  }, [usernameLower]);

  return {
    token,
    saveToken,
    clearToken,
    isLoaded,
  };
}
