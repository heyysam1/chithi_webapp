import { NextRequest } from "next/server";
import { apiOk, apiErr } from "@/lib/api";
import { requireMailboxOwner } from "@/lib/auth";
import { revokeMailboxAccess } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const prefix = "chithi_s_";
    const cookiesToClear: string[] = [];
    const usernamesToRevoke = new Set<string>();

    let targetUsername: string | null = null;
    try {
      const body = await req.json();
      if (body?.username) {
        targetUsername = String(body.username).trim().toLowerCase();
      }
    } catch {
      // Empty body is valid (clear all sessions)
    }

    if (targetUsername) {
      cookiesToClear.push(`chithi_s_${targetUsername}`);
      usernamesToRevoke.add(targetUsername);
    } else {
      // Parse all chithi_s_* cookie names from incoming request
      for (const c of cookieHeader.split(";")) {
        const trimmed = c.trim();
        if (trimmed.startsWith(prefix)) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > prefix.length) {
            const cookieName = trimmed.slice(0, eqIdx).trim();
            if (cookieName && !cookiesToClear.includes(cookieName)) {
              cookiesToClear.push(cookieName);
              usernamesToRevoke.add(cookieName.slice(prefix.length).toLowerCase());
            }
          }
        }
      }
    }

    // Server-side invalidation: rotate the mailbox's access token hash so every
    // bearer token / session cookie previously issued for it stops working —
    // even tokens copied out of the ?key= URL, browser history, or logs.
    // Only revoke when the caller proves ownership of the mailbox (via cookie
    // or Bearer token); otherwise fall through to local cookie cleanup only.
    for (const usernameLower of usernamesToRevoke) {
      try {
        await requireMailboxOwner(req, usernameLower);
        await revokeMailboxAccess(usernameLower);
      } catch {
        // No valid session for this mailbox: nothing server-side to revoke.
        // Local cookie cleanup below still runs.
      }
    }

    const response = apiOk({ loggedOut: true });

    // Clear each session cookie on the response
    for (const name of cookiesToClear) {
      response.cookies.set({
        name,
        value: "",
        path: "/",
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }

    return response;
  } catch (error) {
    console.error("[POST /api/session/logout error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
