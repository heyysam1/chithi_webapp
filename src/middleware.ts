import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { keys } from "@/lib/keys";

/**
 * Fire-and-forget aggregate visit counter (admin dashboard `visits` metric)
 * plus privacy-preserving unique-visitor sketch (`stats:uv:{day}`).
 * Edge-safe: the full metrics lib pulls Node-only modules via env.ts, which
 * the Edge runtime forbids — so this talks to Upstash REST directly.
 * Counts page navigations only (no /api, no static assets). Never throws,
 * never blocks the response.
 *
 * Unique visitors: the client IP is hashed with SHA-256 together with the
 * day and the server-side IP_SALT, and only the hash is PFADDed into a
 * HyperLogLog sketch. Raw IPs are never stored. The salt makes the hashes
 * non-reversible by anyone without the server secret (unsalted SHA-256 of
 * an IPv4 address is brute-forceable); rotating IP_SALT resets that day's
 * sketch, which is acceptable.
 */
async function hashVisitor(ip: string, day: string): Promise<string> {
  const salt = process.env.IP_SALT || "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${ip}|${day}|${salt}`)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Client IP for the UV sketch, mirroring the getClientIp() trust order in
 * src/lib/api.ts: x-real-ip first, then the LAST x-forwarded-for hop.
 * The leftmost XFF entry is client-spoofable (proxies append), so trusting
 * it would let anyone mint unlimited "unique visitors".
 */
function uvClientIp(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const lastHop = hops[hops.length - 1];
    if (lastHop) return lastHop;
  }
  return "";
}

async function trackVisit(request: NextRequest): Promise<void> {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const visitsKey = keys.metricDay("visits", day);
    const uvKey = keys.uniqueVisitorsDay(day);
    const ip = uvClientIp(request);

    const commands: unknown[][] = [
      ["INCR", visitsKey],
      ["EXPIRE", visitsKey, String(400 * 24 * 60 * 60)],
    ];
    if (ip) {
      try {
        const hash = await hashVisitor(ip, day);
        commands.push(
          ["PFADD", uvKey, hash],
          ["EXPIRE", uvKey, String(400 * 24 * 60 * 60)]
        );
      } catch {
        // Hashing failed — still count the page view below.
      }
    }
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    }).catch(() => {
      // Metrics must never break requests.
    });
  } catch {
    // Metrics must never break requests.
  }
}

// --- Maintenance mode -------------------------------------------------------
// Short-lived in-isolate cache so the flag check costs one Redis round-trip
// per ~15s per isolate instead of per request.
let maintenanceCache: { enabled: boolean; at: number } | null = null;
const MAINTENANCE_CACHE_TTL_MS = 15_000;

async function isMaintenanceEnabled(): Promise<boolean> {
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.at < MAINTENANCE_CACHE_TTL_MS) {
    return maintenanceCache.enabled;
  }
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return false;
    const res = await fetch(`${url}/get/${keys.adminMaintenance()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { result?: string | null };
    const enabled = data?.result === "1";
    maintenanceCache = { enabled, at: now };
    return enabled;
  } catch {
    // Fail open: a metrics-infra hiccup must never take the site down.
    return false;
  }
}

// Paths that look like pages but are static assets (usernames may contain
// dots, so a generic dot-filter would skip real mailbox pages).
const STATIC_PAGE_PATHS = new Set(["/sitemap.xml", "/robots.txt"]);

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // Maintenance mode: when the admin flag is set, everything except the
  // admin surface itself (/admin page + /api/admin/*) gets a 503 so the
  // owner can always reach the toggle to turn it back off.
  if (!pathname.startsWith("/admin")) {
    return isMaintenanceEnabled().then((enabled) => {
      if (enabled) {
        return new NextResponse(
          "Chithi is temporarily down for maintenance. Please try again shortly.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Retry-After": "60",
            },
          }
        );
      }
      return handleRequest(request, event);
    });
  }

  return handleRequest(request, event);
}

function handleRequest(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Ensure locale cookie exists if not present
  const localeCookie = request.cookies.get("chithi_locale");
  if (!localeCookie) {
    response.cookies.set({
      name: "chithi_locale",
      value: "en",
      path: "/",
      sameSite: "lax",
    });
  }

  // Set noindex, nofollow and Referrer-Policy on mailbox pages
  const isMailboxPage =
    pathname !== "/" &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/feed") &&
    !pathname.startsWith("/bottle") &&
    !pathname.startsWith("/about") &&
    !pathname.startsWith("/sitemap") &&
    !pathname.startsWith("/robots") &&
    !pathname.includes(".");

  if (isMailboxPage) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  // Aggregate visit counter: GET page navigations only.
  // Skips Next.js <Link> prefetch requests (they carry the
  // `next-router-prefetch: 1` header or `purpose: prefetch`) so hovering
  // links doesn't inflate the visits metric.
  if (
    request.method === "GET" &&
    !pathname.startsWith("/api") &&
    !STATIC_PAGE_PATHS.has(pathname) &&
    !pathname.startsWith("/.well-known") &&
    request.headers.get("next-router-prefetch") !== "1" &&
    request.headers.get("purpose") !== "prefetch"
  ) {
    // waitUntil keeps the metrics pipeline alive after the response is
    // sent; the Edge runtime would otherwise be free to cut the
    // fire-and-forget fetch short.
    event.waitUntil(trackVisit(request));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|textures|og).*)",
  ],
};
