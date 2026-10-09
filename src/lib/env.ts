import crypto from "crypto";
import { z } from "zod";
import { USERNAME_REGEX } from "./constants";

const isBuildTimeOnly =
  process.env.npm_lifecycle_event === "build" &&
  process.env.VERCEL_ENV === undefined;

const isBrowser = typeof window !== "undefined";
const isVercelProd = process.env.VERCEL_ENV === "production";
const isProd = (process.env.NODE_ENV === "production" || isVercelProd) && !isBuildTimeOnly && !isBrowser;

// Ephemeral dev fallbacks generated at module load (never committed or persistent)
let devPepper = "dev-fallback-pepper-12345678901234567890123456789012";
let devSalt = "dev-fallback-salt-12345678901234567890123456789012";
if (!isProd && !isVercelProd && !isBrowser) {
  try {
    devPepper = crypto.randomBytes(32).toString("hex");
    devSalt = crypto.randomBytes(32).toString("hex");
  } catch {
    // fallback safe string
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  UPSTASH_REDIS_REST_URL: isProd && !isBrowser
    ? z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL in production")
    : z.string().url().optional().or(z.literal("")),
  UPSTASH_REDIS_REST_TOKEN: isProd && !isBrowser
    ? z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required in production")
    : z.string().optional().or(z.literal("")),
  AUTH_PEPPER: isProd && !isBrowser
    ? z.string().min(32, "AUTH_PEPPER must be at least 32 characters in production")
    : z.string().min(32).default(devPepper),
  IP_SALT: isProd && !isBrowser
    ? z.string().min(32, "IP_SALT must be at least 32 characters in production")
    : z.string().min(16).default(devSalt),
  CRON_SECRET: isVercelProd && !isBrowser
    ? z.string().min(32, "CRON_SECRET must be at least 32 characters in production")
    : z.string().min(1).optional().or(z.literal("")),
  NEXT_PUBLIC_APP_URL: isProd
    ? z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL")
    : z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(["en", "bn"]).default("en"),
  // Permanent (never-expiring) owner mailbox. Credentials live ONLY in env —
  // never hardcode them; this is a public repo.
  PERMANENT_MAILBOX_ENABLED: z.enum(["true", "false"]).default("false"),
  PERMANENT_MAILBOX_NAME: z.string().optional().or(z.literal("")),
  PERMANENT_MAILBOX_USERNAME: z.string().optional().or(z.literal("")),
  PERMANENT_MAILBOX_PASSCODE: z.string().optional().or(z.literal("")),
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  UPSTASH_REDIS_REST_URL: isBrowser ? "" : process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: isBrowser ? "" : process.env.UPSTASH_REDIS_REST_TOKEN,
  AUTH_PEPPER: process.env.AUTH_PEPPER || (isProd && !isBrowser ? undefined : devPepper),
  IP_SALT: process.env.IP_SALT || (isProd && !isBrowser ? undefined : devSalt),
  CRON_SECRET: process.env.CRON_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || (isProd ? undefined : "http://localhost:3000"),
  NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE || "en",
  PERMANENT_MAILBOX_ENABLED: process.env.PERMANENT_MAILBOX_ENABLED,
  PERMANENT_MAILBOX_NAME: process.env.PERMANENT_MAILBOX_NAME,
  PERMANENT_MAILBOX_USERNAME: process.env.PERMANENT_MAILBOX_USERNAME,
  PERMANENT_MAILBOX_PASSCODE: process.env.PERMANENT_MAILBOX_PASSCODE,
});

if (!parsed.success) {
  const formattedErrors = parsed.error.format();
  console.error("FATAL: Invalid or missing environment configuration:\n", JSON.stringify(formattedErrors, null, 2));
  throw new Error("Startup validation failed: required environment variables are invalid or missing.");
}

// Fail fast when the permanent mailbox is enabled but misconfigured.
// Skipped in the browser (env vars are server-only there; enabled defaults to "false").
if (!isBrowser && parsed.data.PERMANENT_MAILBOX_ENABLED === "true") {
  const missing = [
    "PERMANENT_MAILBOX_NAME",
    "PERMANENT_MAILBOX_USERNAME",
    "PERMANENT_MAILBOX_PASSCODE",
  ].filter((k) => !parsed.data[k as "PERMANENT_MAILBOX_NAME"]?.trim());
  if (missing.length > 0) {
    console.error(
      `FATAL: PERMANENT_MAILBOX_ENABLED=true but missing: ${missing.join(", ")}. ` +
        "Set all three in the environment (Vercel env vars / .env.local) — never commit real values."
    );
    throw new Error(
      "Startup validation failed: permanent mailbox is enabled but its credentials are incomplete."
    );
  }
  const pUsername = parsed.data.PERMANENT_MAILBOX_USERNAME!.trim();
  if (!USERNAME_REGEX.test(pUsername)) {
    console.error(
      `FATAL: PERMANENT_MAILBOX_USERNAME="${pUsername}" is not a valid mailbox username.`
    );
    throw new Error("Startup validation failed: PERMANENT_MAILBOX_USERNAME is invalid.");
  }
  const pPasscode = parsed.data.PERMANENT_MAILBOX_PASSCODE!.trim();
  if (!/^\d{6}$/.test(pPasscode)) {
    console.error("FATAL: PERMANENT_MAILBOX_PASSCODE must be exactly 6 digits (the /recover UI takes 6 digits).");
    throw new Error("Startup validation failed: PERMANENT_MAILBOX_PASSCODE must be 6 digits.");
  }
}

if (!isProd && !isVercelProd && (!process.env.AUTH_PEPPER || !process.env.IP_SALT)) {
  console.warn(
    "[chithi] Using ephemeral in-memory secrets for AUTH_PEPPER / IP_SALT. Sessions will not survive a server restart. In production, provide random 32+ character secrets."
  );
}

export const env = parsed.data;
