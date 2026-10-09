import { NextRequest, NextResponse } from "next/server";
import { apiErr } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";

/**
 * Shared admin guard for /api/admin/* routes.
 * Returns null when the requester is the permanent owner mailbox,
 * otherwise the proper error response. requireAdmin (src/lib/admin.ts)
 * throws `{ status: 401|403, code: string }`.
 */
export async function guardAdmin(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    await requireAdmin(req);
    return null;
  } catch (e: unknown) {
    const status =
      typeof e === "object" && e !== null && "status" in e
        ? Number((e as { status: unknown }).status)
        : 500;
    if (status === 401) {
      return apiErr("UNAUTHORIZED", "errors.unauthorized", 401);
    }
    if (status === 403) {
      return apiErr("FORBIDDEN", "errors.forbidden", 403);
    }
    return apiErr("INTERNAL", "errors.generic", 500);
  }
}
