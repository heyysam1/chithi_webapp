import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { isAdminSurface } from "../src/middleware";

// Regression (2026-10-20): maintenance mode blocked /api/admin/* (login,
// session, the toggle itself) because the middleware only exempted paths
// starting with "/admin". The owner was locked out of the admin panel with
// no way to turn maintenance off. The admin surface must stay reachable.
describe("maintenance mode admin exemption", () => {
  test("admin page and admin API routes are exempt", () => {
    for (const p of [
      "/admin",
      "/admin/",
      "/api/admin",
      "/api/admin/login",
      "/api/admin/session",
      "/api/admin/maintenance",
      "/api/admin/overview",
    ]) {
      assert.equal(isAdminSurface(p), true, p);
    }
  });

  test("regular pages and APIs are NOT exempt", () => {
    for (const p of [
      "/",
      "/feed",
      "/bottle",
      "/about",
      "/api/letters/send",
      "/api/mailbox",
      "/api/session",
    ]) {
      assert.equal(isAdminSurface(p), false, p);
    }
  });

  test("lookalike mailbox paths are NOT exempt", () => {
    for (const p of ["/administrator", "/adminx", "/api/administrator"]) {
      assert.equal(isAdminSurface(p), false, p);
    }
  });
});
