# Chithi · চিঠি

> **Anonymous Ephemeral Letters** — Quiet thoughts that dissolve into the night.

A short-lived mailbox. Handwritten-feeling letters. Everything self-destructs when the clock runs out.

---

## 📜 Philosophy

Modern digital communication is loud, eternal, and indexed forever. **Chithi** (`চিঠি`, Bengali for *letter*) restores intentionality, warmth, and ephemerality:
- **No passwords, no profiles, no tracking.**
- **Hard Redis TTLs**: When the mailbox clock hits zero, everything dissolves into ash.
- **Physical tactile beauty**: Hand-crafted parchment, midnight, rose, and typewriter papers; wax seals; envelope-unfolding physics; and script-aware Bengali typography.
- **Benami Kham (বেনামী খাম)**: A public wall of anonymous letters that also expires within 48 hours.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router, Node.js runtime)
- **Language**: TypeScript (strict mode, `noUncheckedIndexedAccess`)
- **Styling**: Tailwind CSS + Custom Vintage Design System Tokens
- **Typography**: Playfair Display, Cinzel, Noto Serif Bengali, JetBrains Mono
- **Database & Storage**: Upstash Redis (with seamless in-memory fallback for local development)
- **Rate Limiting**: Upstash Ratelimit (sliding-window with in-memory fallback)
- **Validation & Sanitization**: Zod, sanitize-html, NFC Unicode normalization
- **Motion & Physics**: Framer Motion (with `prefers-reduced-motion` instantaneous fallbacks)
- **Postcard Export**: `html-to-image` at 1080×1920 with two-pass font rasterization

---

## 🚀 Quick Start (Zero Cloud Setup Required)

Chithi includes a **built-in in-memory Redis shim**, meaning you can clone and run it immediately on `localhost` without needing any external accounts or cloud credentials!

### 1. Install dependencies
```bash
pnpm install
```

### 2. Set up environment variables
Copy the example environment file:
```bash
cp .env.example .env.local
```

### 3. Start development server
```bash
pnpm dev
```
Open [https://mychithi.vercel.app](https://mychithi.vercel.app) in your browser.

---

## ⚙️ Environment Variables

| Variable | Required? | Default | Description |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Optional in dev | `""` (in-memory) | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Optional in dev | `""` (in-memory) | Upstash Redis REST token |
| `AUTH_PEPPER` | Required in prod | Ephemeral dev random | SHA-256 pepper for access tokens & passcodes |
| `IP_SALT` | Required in prod | Ephemeral dev random | Pepper for hashing viewer IPs in rate limiting & dedup |
| `CRON_SECRET` | Required in prod | Ephemeral dev random | Bearer token secret for Vercel Cron cleanup invocation |
| `NEXT_PUBLIC_APP_URL` | Optional | `http://localhost:3000` | Canonical app URL for links |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | Optional | `en` | Initial locale fallback (`en` or `bn`) |

---

## 🏗️ Architecture & Security Model

### 1. Redis Keyspace
All data is stored with native TTLs. Nothing survives mailbox expiry:
- `mb:<username>`: JSON `MailboxRecord` with hard TTL (`expiresAt` timestamp and Redis TTL matching).
- `mb:name:<username>`: Username reservation lock with TTL synchronized to mailbox expiry.
- `mb:recover:<username>`: SHA-256 hashed 6-digit recovery passcode (`passcodeHash`).
- `mb:ltrs:<username>`: Sorted set of letter IDs scored by creation timestamp (`createdAt`).
- `mb:unread:<username>`: Atomic integer unread letter counter with non-negative floor.
- `ltr:<id>`: JSON `LetterRecord` with TTL matching recipient mailbox remainder.
- `bottle:pool:<gender>`: Candidate pools (`any`, `male`, `female`, `other`) for anonymous bottle matching.
- `bottle:pair:<senderViewerHash>:<username>`: 24-hour pair delivery guard preventing repeated bottle matching.
- `feed:ids`: Chronological sorted set of public letter feed items expiring in 48 hours.
- `feed:trending`: Trending sorted set weighted by reactions (`hearts * 2 + heartCracks`).
- `feed:<id>`: JSON `FeedRecord` stripped of recipient, sender, locks, and burn timers.

### 2. Zero-Password Ownership
- On mailbox creation, a 256-bit cryptographically secure token is generated and stored in an `httpOnly` secure cookie.
- A 6-digit rejection-sampled passcode (no modulo bias) is shown once to the creator for recovery.
- Recovery via `/recover` rotates the access token atomically and clears previous sessions.

### 3. Plain Text & Content Sanitization
- All letter bodies, hints, and riddles are normalized to **Unicode NFC**.
- Strips all HTML entities and tags; letters are rendered with `white-space: pre-wrap`.
- Preserves Bengali **Zero Width Non-Joiner (ZWNJ, `\u200C`)** and **Zero Width Joiner (ZWJ, `\u200D`)** to ensure complex conjuncts (যুক্তাক্ষর) render accurately.
- URLs are automatically stripped and replaced with `[link removed]`.
- Max word length enforcement (60 characters) prevents layout breakage.

### 4. Abuse Prevention
- 3-strike reporting system automatically quarantines abusive letters and removes them from feeds.
- Flood limits prevent rapid automated sending to any single recipient.
- Sliding-window rate limiters on mailbox creation, letter submission, and passcode recovery.

---

## 🌐 Localization (English & বাংলা)

- Fully localized with idiomatic English and Bengali dictionaries (`en.ts`, `bn.ts`).
- Type-safe dictionary verification ensures zero missing keys.
- Numbers and timestamps automatically convert to Bengali numerals (`১২৩৪`) when the Bengali locale is active.

---

## 📦 Production Deployment (Vercel)

1. Connect your repository to Vercel.
2. In the Vercel Project Settings:
   - Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from an Upstash Redis database.
   - Generate three random 64-character hex strings:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
     Set them as `AUTH_PEPPER`, `IP_SALT`, and `CRON_SECRET`.
   - Set `NEXT_PUBLIC_APP_URL` to your production domain (e.g. `https://chithi.app`).
3. **Automated Cleanup Cron (`vercel.json`)**:
   - `vercel.json` configures `/api/cron/cleanup` on schedule `0 */6 * * *` (every 6 hours).
   - Vercel automatically sends `Authorization: Bearer $CRON_SECRET`.
   - *Note on Vercel Hobby plan*: hobby accounts run crons once daily (`0 3 * * *` at 03:00 UTC) with ±45min jitter; Pro/Enterprise plans support sub-daily cron schedules.
4. Deploy! Next.js will compile the standalone production bundle with strict CSP and security headers.

---

## 🛠️ Operations

### 1. Environment Variables & Enforcement

All environment variables are validated at startup in `src/lib/env.ts` with strict Zod constraints and minimum length requirements:

| Variable | Scope | Required? | Minimum Length | Purpose & Constraints |
|---|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Server | Required in prod | Valid URL format | Upstash REST API endpoint (`https://...upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | Server | Required in prod | Non-empty string | Upstash REST authorization bearer token |
| `AUTH_PEPPER` | Server | Required in prod | **32 characters** | Salt/pepper for hashing session tokens & recovery passcodes |
| `IP_SALT` | Server | Required in prod | **32 characters** | Salt for hashing client IP addresses in rate limiters & feed deduplication |
| `CRON_SECRET` | Server | Required in prod | **32 characters** | Bearer secret protecting `/api/cron/cleanup` |
| `NEXT_PUBLIC_APP_URL` | Public | Optional | Valid URL format | Canonical public URL (e.g. `https://chithi.app`, default `http://localhost:3000`) |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | Public | Optional | `"en"` or `"bn"` | Default locale fallback when no client preference exists (default `en`) |

> [!NOTE]
> In local development (`NODE_ENV !== "production"`), ephemeral random 32-character secrets are auto-generated in memory if `AUTH_PEPPER`, `IP_SALT`, or `CRON_SECRET` are not set. In production (`NODE_ENV === "production"`), missing or undersized secrets halt boot immediately.

### 2. Secret Rotation Consequences

- **Rotating `AUTH_PEPPER`**:
  - **Impact**: **Invalidates all active sessions and passcodes**.
  - Because mailbox tokens and passcodes are stored as `sha256(token + AUTH_PEPPER)`, changing `AUTH_PEPPER` causes all existing cookies and passcodes to mismatch. All mailbox owners will be logged out and cannot recover mailboxes created before the rotation.
- **Rotating `IP_SALT`**:
  - **Impact**: **Resets IP-based rate limiting and view tracking**.
  - All sliding-window rate limit buckets and IP view deduplication keys will recalculate. No user sessions or mailboxes are lost.
- **Rotating `CRON_SECRET`**:
  - **Impact**: **Requires immediate update of cron trigger callers**.
  - Vercel Cron or any automated task caller must be updated simultaneously with the new Bearer token. Any requests presenting the old secret will receive `401 Unauthorized`.

### 3. Manual Cleanup Cron Trigger

You can invoke the cleanup routine manually at any time using `curl`:

```bash
curl -X GET https://<your-domain>/api/cron/cleanup \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Expected JSON response:
```json
{
  "ok": true,
  "data": {
    "purgedCount": 0,
    "feedPrunedCount": 0
  }
}
```

### 4. Ephemeral Architecture & Absence of Backups

- **Deliberate Absence of User-Data Backups**:
  - Chithi is an **ephemeral messaging system** by design. All mailboxes, letters, bottles, and feed posts are tied to hard Redis TTLs (ranging from 12 hours to 7 days).
  - When a mailbox or letter expires, it is permanently deleted by Redis key eviction or the automated cleanup cron.
  - **No cold backups, database dumps, or long-term snapshots of user letters exist**. Once deleted or expired, data cannot be recovered by anyone, including system administrators.

### 5. Cryptographic Credential Storage

- **Zero Plaintext Credentials**:
  - Redis holds **no plaintext passwords, passcodes, or tokens**.
  - Mailbox owner tokens and 6-digit recovery passcodes are stored exclusively as one-way cryptographic hashes:
    $$\text{hash} = \text{SHA-256}(\text{passcode} \parallel \text{AUTH\_PEPPER})$$
  - Verification is performed using timing-safe comparisons (`timingSafeEqual`) to prevent side-channel timing attacks.
  - Even if a complete Redis read dump were compromised, attackers cannot reconstruct user passcodes without inverting SHA-256 with the high-entropy pepper.

---

## 📄 License

MIT © Chithi Contributors
