import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiErr, ApiError, parseJsonBody } from "@/lib/api";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { keys } from "@/lib/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MaintenanceSchema = z.object({
  enabled: z.boolean(),
});

function adminErrorMessage(code: string): string {
  switch (code) {
    case "NO_ADMIN_SESSION":
      return "Admin login required.";
    case "NOT_OWNER_MAILBOX":
      return "This session is not the owner admin mailbox.";
    case "ADMIN_NOT_CONFIGURED":
      return "Admin panel is not configured on this server.";
    default:
      return code;
  }
}

/**
 * GET /api/admin/maintenance -> { enabled }
 * POST /api/admin/maintenance { enabled: boolean } -> { enabled }
 *
 * Stores the maintenance-mode flag at admin:maintenance ("1"/"0").
 * NOTE: enforcement (middleware returning 503 while enabled) is a separate
 * future step — this endpoint only manages the flag.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const redis = getRedis();
    const val = await redis.get<string>(keys.adminMaintenance());
    return apiOk({ enabled: val === "1" });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[GET /api/admin/maintenance error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const input = await parseJsonBody(req, MaintenanceSchema);
    const redis = getRedis();
    await redis.set(keys.adminMaintenance(), input.enabled ? "1" : "0");
    return apiOk({ enabled: input.enabled });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return apiErr(error.code, adminErrorMessage(error.code), error.status);
    }
    if (error instanceof ApiError) {
      return apiErr(error.code, error.message, error.status, error.details);
    }
    console.error("[POST /api/admin/maintenance error]", error);
    return apiErr("INTERNAL", "errors.internal", 500);
  }
}
