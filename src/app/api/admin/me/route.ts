import { NextRequest } from "next/server";
import { apiOk, apiErr } from "@/lib/api";
import { AdminAuthError, requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin session check. The /admin page calls this on load to decide
 * whether to show the login form or the dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    const mailbox = await requireAdmin(req);
    return apiOk({ username: mailbox.username, isPermanent: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      const messageKey =
        error.status === 401 ? "errors.unauthorized" : "errors.forbidden";
      return apiErr(error.code, messageKey, error.status);
    }
    console.error("[GET /api/admin/me error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
