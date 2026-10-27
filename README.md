<h1 align="center">Chithi</h1>

<p align="center">
  <b>A quiet place to send and receive letters</b><br />
  Your own permanent mailbox, opened with a single passcode. No accounts, no feeds, no noise.
</p>

<p align="center">
  <a href="https://mychithi.vercel.app"><b>Open Chithi · mychithi.vercel.app</b></a>
</p>

---

## Overview

Chithi (চিঠি, Bengali for *letter*) is a letter-sending web app built around one simple idea: everyone gets a permanent personal mailbox. You open it with one passcode, receive letters from anyone who knows your mailbox name, and reply in threads, just like real correspondence. Letters can be sent right away or scheduled for later, and there is a public wall of anonymous letters called Benami Kham.

## Features

- **Permanent personal mailbox** — your mailbox never expires, and one permanent passcode opens it. The passcode is saved in your browser, so returning is one tap.
- **Send letters** — write to any mailbox by name, in a calm, letter-like reading and writing experience.
- **Scheduled letters** — choose a future time and the letter is delivered then.
- **Drafts** — unfinished letters are kept safe until you are ready to send them.
- **Reply threads** — replies stay connected to the original letter, up to 5 levels deep.
- **Extendable expiry** — a letter's lifetime can be extended by 24 hours, 3 days, 5 days, or 7 days, within set limits.
- **Benami Kham** — a public wall where anonymous letters can be posted and read.
- **Stamps** — letters carry stamps, shown on the feed and in your inbox.
- **Inbox export** — print your letters or save them as a PDF.
- **Delete your own account** — you can permanently delete your mailbox yourself at any time. The owner's mailbox is protected from deletion.
- **Privacy-respecting admin panel** — the admin sees statistics only. Letter contents are never visible to the admin.

## Tech Stack

- **Framework** — Next.js 15 (App Router)
- **Language** — TypeScript
- **Storage** — Upstash Redis
- **Hosting** — Vercel

## Live App

**[mychithi.vercel.app](https://mychithi.vercel.app)**

Open the link, create your mailbox, and set your passcode. That is all you need to start receiving letters.

## Run Locally

```bash
pnpm install
pnpm dev
```

Running it locally requires Upstash Redis credentials (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) set in your environment.
