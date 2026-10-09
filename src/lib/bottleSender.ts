import { NextRequest } from "next/server";
import { getSessionUsername } from "@/lib/auth";

/**
 * Resolves the sender identity used for self-targeting exclusion.
 * Only a server-verified session cookie is authoritative: `getSessionUsername`
 * derives the username from `chithi_s_*` cookies (the optional claimed name is
 * only a disambiguator among those cookies). For a logged-out sender the
 * client-supplied `senderUsername` is *never* trusted — it is dropped instead
 * of being used to exclude an arbitrary mailbox from receiving the bottle.
 */
export function resolveBottleSender(
  req: NextRequest,
  claimedUsername?: string | null
): string | undefined {
  return getSessionUsername(req, claimedUsername) ?? undefined;
}
