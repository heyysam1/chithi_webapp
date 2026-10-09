import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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
 * day (salt) and only the hash is PFADDed into a HyperLogLog sketch.
 * The hash is one-way — no IP is ever stored and none can be recovered.
 */
async function hashVisitor(ip: string, day: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${ip}|${day}`)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function countVisit(request: NextRequest): void {
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
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded?.split(",")[0]?.trim() || realIp?.trim() || "";

    void (async () => {
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
    })();
  } catch {
    // Metrics must never break requests.
  }
}

// Paths that look like pages but are static assets (usernames may contain
// dots, so a generic dot-filter would skip real mailbox pages).
const STATIC_PAGE_PATHS = new Set(["/sitemap.xml", "/robots.txt"]);

export function middleware(request: NextRequest) {
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
  if (
    request.method === "GET" &&
    !pathname.startsWith("/api") &&
    !STATIC_PAGE_PATHS.has(pathname) &&
    !pathname.startsWith("/.well-known")
  ) {
    countVisit(request);
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
