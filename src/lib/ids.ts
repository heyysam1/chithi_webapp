import { nanoid } from "nanoid";

/**
 * Uniform random integer in [min, max) using the platform CSPRNG.
 * (Modulo bias is negligible for these tiny ranges, and the values are
 * only username-suggestion suffixes that still race through SET NX.)
 */
function randomInt(min: number, max: number): number {
  const range = max - min;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return min + ((bytes[0] ?? 0) % range);
}

/**
 * Generates a 256-bit cryptographically secure access token,
 * base64url encoded (32 random bytes).
 */
export function generateAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Generates a 6-digit recovery passcode using rejection sampling
 * over crypto.getRandomValues to eliminate modulo bias.
 * Preserves leading zeroes.
 */
export function generateRecoveryPasscode(): string {
  let passcode = "";
  const byteBuffer = new Uint8Array(1);

  while (passcode.length < 6) {
    crypto.getRandomValues(byteBuffer);
    const val = byteBuffer[0];
    if (val !== undefined && val < 250) {
      // 0..249 maps uniformly to 0..9 (25 occurrences each)
      passcode += (val % 10).toString();
    }
  }

  return passcode;
}

/**
 * Generates a 16-character URL-safe nanoid for letter IDs.
 */
export function generateLetterId(): string {
  return nanoid(16);
}

/**
 * Generates a fresh 16-character URL-safe nanoid for feed items (unlinkable to letter ID).
 */
export function generateFeedId(): string {
  return nanoid(16);
}

/**
 * Suggests an editable, clean URL-safe username from a user's entered name.
 * Example: "Rahim Ahmed" -> "rahim-ahmed"
 */
export function suggestUsernameFromName(name: string): string {
  if (!name || !name.trim()) return "";

  // 1. Basic Bengali transliteration dictionary for common characters
  const bnMap: Record<string, string> = {
    "অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u", "ঋ": "ri",
    "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou",
    "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng",
    "চ": "ch", "ছ": "chh", "জ": "j", "ঝ": "jh", "ঞ": "n",
    "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n",
    "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
    "প": "p", "ফ": "f", "ব": "b", "ভ": "bh", "ম": "m",
    "য": "j", "র": "r", "ল": "l", "শ": "sh", "ষ": "sh", "স": "s", "হ": "h",
    "ড়": "r", "ঢ়": "rh", "য়": "y",
    "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri",
    "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou",
    "্": "", "ং": "ng", "ঃ": "", "ঁ": "",
  };

  let transliterated = "";
  for (const char of name.normalize("NFC")) {
    if (bnMap[char] !== undefined) {
      transliterated += bnMap[char];
    } else {
      transliterated += char;
    }
  }

  // 2. Slugify: lowercase, letters/numbers, hyphens/underscores
  let slug = transliterated
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  if (slug.length < 3) {
    if (slug.length === 0) {
      slug = `writer-${randomInt(1000, 10000)}`;
    } else {
      slug = `${slug}-${randomInt(10, 100)}`;
    }
  }

  // Clamp to max 20 chars
  if (slug.length > 20) {
    slug = slug.slice(0, 20).replace(/[-_]+$/, "");
  }

  return slug;
}
