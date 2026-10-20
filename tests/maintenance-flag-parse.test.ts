import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { redisFlagEnabled } from "../src/lib/admin";

// Regression (2026-10-20): the maintenance toggle in the admin panel always
// showed OFF and could never be turned off, because GET /api/admin/maintenance
// compared the Redis value with `val === "1"` while the @upstash/redis client
// auto-deserializes the stored string "1" into the NUMBER 1. The middleware
// (raw REST) still saw "1" and kept the site down, so the panel state and
// reality disagreed permanently.
describe("redisFlagEnabled (maintenance flag parsing)", () => {
  test("string form stored by raw writers", () => {
    assert.equal(redisFlagEnabled("1"), true);
    assert.equal(redisFlagEnabled("0"), false);
  });

  test("number form produced by Upstash auto-deserialization", () => {
    assert.equal(redisFlagEnabled(1), true);
    assert.equal(redisFlagEnabled(0), false);
  });

  test("missing or unrelated values are off", () => {
    assert.equal(redisFlagEnabled(null), false);
    assert.equal(redisFlagEnabled(undefined), false);
    assert.equal(redisFlagEnabled(""), false);
    assert.equal(redisFlagEnabled("true"), false);
    assert.equal(redisFlagEnabled(true), false);
  });
});
