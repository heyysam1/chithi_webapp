import { describe, it, expect } from "vitest";
import {
  getUniqueVisitorSeries,
  getMetricSeries,
} from "../src/lib/metrics";
import { getRedis } from "../src/lib/redis";
import { keys } from "../src/lib/keys";

describe("Unique visitor counting (HyperLogLog)", () => {
  describe("getUniqueVisitorSeries date validation", () => {
    it("throws on invalid date format", async () => {
      await expect(getUniqueVisitorSeries("2026/10/09", "2026-10-09")).rejects.toThrow(
        "Invalid date format"
      );
      await expect(getUniqueVisitorSeries("2026-10-09", "not-a-date")).rejects.toThrow(
        "Invalid date format"
      );
    });

    it("throws when from is after to", async () => {
      await expect(
        getUniqueVisitorSeries("2026-10-10", "2026-10-09")
      ).rejects.toThrow("Invalid date range");
    });

    it("matches getMetricSeries validation behaviour", async () => {
      // Same inputs must fail the same way for both series readers.
      await expect(getMetricSeries("visits", "bad", "2026-10-09")).rejects.toThrow(
        "Invalid date format"
      );
      await expect(
        getMetricSeries("visits", "2026-10-10", "2026-10-09")
      ).rejects.toThrow("Invalid date range");
    });
  });

  describe("missing keys read as 0", () => {
    it("returns 0 for days with no sketch (pre-deploy history)", async () => {
      const points = await getUniqueVisitorSeries("1999-01-01", "1999-01-03");
      expect(points).toHaveLength(3);
      expect(points.every((p) => p.value === 0)).toBe(true);
      expect(points[0]?.date).toBe("1999-01-01");
    });
  });

  describe("pfadd/pfcount via InMemoryRedisShim", () => {
    it("counts distinct hashes once even when added repeatedly", async () => {
      const redis = getRedis();
      const day = "2031-05-05";
      const key = keys.uniqueVisitorsDay(day);
      await redis.del(key);

      expect(await redis.pfadd(key, "hash-a")).toBe(1);
      expect(await redis.pfadd(key, "hash-a")).toBe(0); // duplicate
      expect(await redis.pfadd(key, "hash-b", "hash-c")).toBe(1);
      expect(await redis.pfcount(key)).toBe(3);

      const points = await getUniqueVisitorSeries(day, day);
      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({ date: day, value: 3 });

      await redis.del(key);
    });

    it("pfcount over multiple keys returns the union", async () => {
      const redis = getRedis();
      const k1 = keys.uniqueVisitorsDay("2031-06-01");
      const k2 = keys.uniqueVisitorsDay("2031-06-02");
      await redis.del(k1, k2);

      await redis.pfadd(k1, "shared", "only-day-1");
      await redis.pfadd(k2, "shared", "only-day-2");
      // Union: shared counts once.
      expect(await redis.pfcount(k1, k2)).toBe(3);

      await redis.del(k1, k2);
    });

    it("uniqueVisitorsDay key follows the stats:uv:{date} convention", () => {
      expect(keys.uniqueVisitorsDay("2026-10-09")).toBe("stats:uv:2026-10-09");
    });
  });
});
