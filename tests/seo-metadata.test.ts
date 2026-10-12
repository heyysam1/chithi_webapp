import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { generateMetadata as generateMailboxMetadata } from "../src/app/[username]/page";
import { metadata as profileMetadata } from "../src/app/profile/layout";
import { metadata as inboxMetadata } from "../src/app/inbox/layout";

test("SEO-01: root metadataBase is configurable and not hardcoded to localhost in prod", async () => {
  const layoutSource = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
  assert.ok(
    layoutSource.includes("process.env.NEXT_PUBLIC_APP_URL") || layoutSource.includes("process.env.VERCEL_URL"),
    "layout.tsx must dynamically resolve metadataBase via NEXT_PUBLIC_APP_URL / VERCEL_URL"
  );
  assert.ok(
    !layoutSource.includes('metadataBase: new URL("http://localhost:3000")'),
    "metadataBase must not be hardcoded to http://localhost:3000"
  );
  assert.ok(
    layoutSource.includes("metadataBase: new URL(appUrl)"),
    "metadataBase must use new URL(appUrl)"
  );
});

test("SEO-02: Public mailbox page has strict noindex/nofollow and no username in title", async () => {
  const meta = await generateMailboxMetadata({
    params: Promise.resolve({ username: "victim_alice" }),
  });

  // Verify title does NOT leak the username or handle (unified site title)
  assert.deepEqual(
    meta.title,
    { absolute: "MyChithi - Anonymous Private Letters" },
    "Title must be the unified site title and must not leak username or handle"
  );
  assert.ok(!JSON.stringify(meta).includes("victim_alice"), "Metadata must never leak username");

  // Verify robots directives
  assert.deepEqual(meta.robots, {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  });
});

test("SEO-02: robots.ts and sitemap.ts configure crawling boundaries strictly", async () => {
  const robotsConfig = robots();
  assert.ok(Array.isArray(robotsConfig.rules) || typeof robotsConfig.rules === "object");

  const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;
  assert.ok(rules, "Robots rules must be defined");

  // Disallow must protect /inbox/, /api/, /profile
  const disallow = Array.isArray(rules?.disallow) ? rules.disallow : [rules?.disallow];
  assert.ok(disallow.includes("/inbox/"), "Must disallow /inbox/");
  assert.ok(disallow.includes("/api/"), "Must disallow /api/");
  assert.ok(disallow.includes("/profile"), "Must disallow /profile");

  // Sitemap must only list marketing / public discovery pages
  const sitemapEntries = sitemap();
  const urls = sitemapEntries.map((e) => new URL(e.url).pathname);
  assert.ok(urls.includes("/"), "Sitemap must include /");
  assert.ok(urls.includes("/about"), "Sitemap must include /about");
  assert.ok(urls.includes("/feed"), "Sitemap must include /feed");
  assert.ok(urls.includes("/bottle"), "Sitemap must include /bottle");
  assert.equal(urls.length, 4, "Sitemap must contain exactly 4 public routes");
});

test("SEO-03: /profile and /inbox routes configure page-level and header-level noindex", async () => {
  // Page-level metadata in layout
  assert.deepEqual(profileMetadata.robots, {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  });

  assert.deepEqual(inboxMetadata.robots, {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  });

  // next.config.ts header check
  const nextConfigSource = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  assert.ok(!nextConfigSource.includes('source: "/u/:path*"'), "/u/:path* must be removed from next.config.ts");
  assert.ok(nextConfigSource.includes('source: "/profile"'), "/profile must have X-Robots-Tag in next.config.ts");
});
