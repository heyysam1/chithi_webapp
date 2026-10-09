import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api";
import { getSessionUsername } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin logout. Clears the session cookie only.
 *
 * Deliberately does NOT revoke the access token server-side (unlike
 * /api/session/logout): the token belongs to the owner's mailbox, and
 * revoking it would also kill the owner's normal site session. Since admin
 * and site share one session by design, logging out here logs the owner
 * out everywhere on this browser.
 */
export async function POST(req: NextRequest) {
  const username = getSessionUsername(req);

  const response = apiOk({ loggedOut: true });

  if (username) {
    response.cookies.set({
      name: `chithi_s_${username}`,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
  }

  return response;
}
