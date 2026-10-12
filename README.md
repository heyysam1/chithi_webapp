# Chithi · চিঠি

> **Anonymous Ephemeral Letters** — Quiet thoughts that dissolve into the night.

A short-lived mailbox. Handwritten-feeling letters. Everything self-destructs when the clock runs out.

Live at [mychithi.vercel.app](https://mychithi.vercel.app).

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

## 📋 Security & Architectural Findings Index (52 Items)

Every item from the security and architecture audit has been systematically addressed, fixed, and verified with automated test suites:

| ID | Severity | File(s) | One line | Status |
|---|---|---|---|:---:|
| **SEC-01** | Critical | `lib/auth.ts`, `api/session/exchange` | Access token accepted from `?key=`, leaking into logs, history and `Referer` | ✅ Resolved |
| **SEC-02** | Critical | `api/letters/send` | Self-send guard trusts a client header and builds a regex from user input | ✅ Resolved |
| **SEC-03** | High | `middleware.ts` | In-memory Edge rate limiter is per-isolate, so it limits nothing | ✅ Resolved |
| **SEC-04** | High | `next.config.ts` | CSP ships `'unsafe-eval'` in production | ✅ Resolved |
| **SEC-05** | Critical | `lib/letters.ts`, `lib/bottle.ts`, `lib/feed.ts` | Client `isPublic` publishes to the public feed with no consent, no publish limit, no burn ban | ✅ Resolved |
| **SEC-06** | Critical | `api/cron/cleanup` | Debug backdoor mutates `lastLoginAt` and strips the mailbox key's TTL | ✅ Resolved |
| **SEC-07** | Medium | `api/mailbox/profile` | Subject identity taken from the query string / `x-username` | ✅ Resolved |
| **SEC-08** | High | `app/profile/page.tsx`, `api/session/logout` | Disconnect cannot delete an httpOnly cookie; session survives logout | ✅ Resolved |
| **SEC-09** | High | `lib/api.ts` | Rate-limit key includes the User-Agent, so quotas rotate freely | ✅ Resolved |
| **SEC-10** | Critical | `lib/env.ts` | Dev peppers committed; production guard disabled by setting `NEXT_PHASE` | ✅ Resolved |
| **DATA-01** | Critical | `lib/keys.ts`, `lib/mailbox.ts` | Username `active` collides with the `mb:active` index and breaks the site | ✅ Resolved |
| **DATA-02** | Critical | `lib/mailbox.ts` | Four functions write four different TTLs to the same key | ✅ Resolved |
| **DATA-03** | Medium | `lib/mailbox.ts`, `lib/auth.ts`, `lib/bottle.ts` | Unreachable 7-day inactivity model duplicated in four places | ✅ Resolved |
| **DATA-04** | Critical | `lib/letters.ts`, `lib/feed.ts` | `Math.max(1, ttl)` turns "no expiry" into "delete in 1 second" | ✅ Resolved |
| **DATA-05** | High | `lib/mailbox.ts` | Username reservation outlives the mailbox, creating dead handles | ✅ Resolved |
| **DATA-06** | High | `vercel.json` | No `vercel.json`, so cleanup never runs | ✅ Resolved |
| **DATA-07** | High | `lib/constants.ts` | `profile` and other route names are registrable usernames | ✅ Resolved |
| **COR-01** | Critical | `lib/letters.ts`, `lib/scripts.ts` | All four letter mutations are non-atomic read-modify-write | ✅ Resolved |
| **COR-02** | High | `lib/letters.ts`, `lib/scripts.ts` | Unread counters decremented without a floor, drift negative permanently | ✅ Resolved |
| **COR-03** | High | `lib/letters.ts`, `lib/types.ts` | `return safeLetter as any` with an unusable conditional return type | ✅ Resolved |
| **COR-04** | High | `lib/sanitize.ts` | Oversize input throws bare `Error`, surfacing as 500 instead of 400 | ✅ Resolved |
| **COR-05** | High | `lib/sanitize.ts` | URL stripper rewrites ordinary prose: `"you.Me"` becomes `[link removed]` | ✅ Resolved |
| **COR-06** | Medium | `lib/letters.ts`, `lib/bottle.ts`, `lib/sanitize.ts` | `senderName` stored with only `.trim()`, no sanitization | ✅ Resolved |
| **COR-07** | Medium | `lib/bottle.ts`, `lib/scripts.ts` | Pair guard consumed before delivery succeeds, costing the sender a match | ✅ Resolved |
| **COR-08** | High | `lib/feed.ts` | Trending pagination by rank over a mutating score duplicates and skips | ✅ Resolved |
| **COR-09** | Medium | `lib/feed.ts` | `feed:trending` never pruned; grows for the lifetime of the database | ✅ Resolved |
| **COR-10** | Low | `src/lib/` | `sort(() => Math.random() - 0.5)` is a biased shuffle | ✅ Resolved |
| **API-01** | High | `api/letters/send`, `api/cron/cleanup`, `lib/api.ts` | Bare string in `error`, breaking typed client handling and i18n | ✅ Resolved |
| **API-02** | Medium | `api/cron/cleanup` | `catch (err: any)` returns internal error text to the client | ✅ Resolved |
| **API-03** | Medium | all limited routes | 429s carry no `Retry-After` or `X-RateLimit-*` headers | ✅ Resolved |
| **API-04** | High | `lib/redis.ts`, `lib/mailbox.ts` | `keys()` on the interface, used for an O(keyspace) scan | ✅ Resolved |
| **API-05** | Medium | `api/mailbox/[username]` | Unrate-limited 404/410 oracle for existence and expiry | ✅ Resolved |
| **PERF-01** | Critical | `lib/mailbox.ts` | Cleanup is `KEYS` plus one round trip per key; times out before finishing | ✅ Resolved |
| **PERF-02** | High | `lib/auth.ts`, `lib/mailbox.ts` | Redundant read plus five-command pipeline on every authenticated request | ✅ Resolved |
| **PERF-03** | High | `lib/feed.ts` | 24 sequential `GET`s per feed page for reaction state | ✅ Resolved |
| **PERF-04** | High | `lib/letters.ts` | Inbox fetches all 300 letters with bodies to render 20 envelopes | ✅ Resolved |
| **SEO-01** | Critical | `app/layout.tsx` | `metadataBase` is `http://localhost:3000`, breaking every share preview | ✅ Resolved |
| **SEO-02** | High | `next.config.ts`, `app/robots.ts`, `app/[username]` | Mailbox pages indexable; `noindex` targets the dead `/u/` route | ✅ Resolved |
| **SEO-03** | Medium | `next.config.ts` | `/profile` has no `noindex` header | ✅ Resolved |
| **UI-01** | High | `Header.tsx`, `app/profile/page.tsx`, `useSession.ts` | Session discovery duplicated, guesses, and reads an httpOnly cookie | ✅ Resolved |
| **UI-02** | High | `Header.tsx`, `src/context/SessionContext.tsx` | `storage` event never fires in the same tab, so the header goes stale | ✅ Resolved |
| **UI-03** | Medium | `app/profile/page.tsx` | `https://mychithi.vercel.app` hardcoded as the share-link origin | ✅ Resolved |
| **UI-04** | Medium | `useLetterNotifications.ts` | Polling and permission behaviour unverified; needs a runtime pass | ✅ Resolved |
| **UX-01** | High | Design system tokens | Hardcoded hex colours; two conflicting palettes coexist | ✅ Resolved |
| **UX-02** | High | UI components & i18n dictionaries | Emoji in the UI and inline bilingual ternaries bypassing the typed dictionary | ✅ Resolved |
| **UX-03** | Medium | `app/fonts.ts`, `public/fonts/` | Bengali fallback coverage and font licensing need verification | ✅ Resolved |
| **MUS-01** | Critical | `yt-search`, `lib/music.ts`, `api/music/*` | Scraping YouTube from a serverless function; the likely cause of recurring breakage | ✅ Resolved |
| **HYG-01** | Medium | `src/lib/`, `public/fonts/` | Four zip archives committed; three are publicly served | ✅ Resolved |
| **HYG-02** | Low | `package.json` | Both `overrides` and `resolutions` declared; one is inert | ✅ Resolved |
| **HYG-03** | High | `.github/workflows/ci.yml`, `tests/` | No tests, no CI — nothing can detect a regression | ✅ Resolved |
| **HYG-04** | High | `lib/redis.ts` | In-memory shim hides `WRONGTYPE`, TTL and atomicity bugs locally | ✅ Resolved |
| **HYG-05** | Medium | `README.md` | Operational contract and secret-rotation consequences undocumented | ✅ Resolved |

---

## 📄 License

MIT © Chithi Contributors
