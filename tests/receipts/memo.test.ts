import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildMemo, MEMO_MAX_BYTES } from "@/domains/receipts/memo";
import type { Receipt } from "@/domains/receipts/schema";

const ID = "8c1f2b3a-5d4e-4f60-9a7b-1c2d3e4f5a6b";
const AT = "2026-11-20T01:02:03.000Z";
const symbol = (n: number) => `GEMI-BTC2611202200-HI${String(n).padStart(6, "0")}`;
const leg = (n: number, side: "yes" | "no" = "yes", filled = 10) => ({ symbol: symbol(n), side, filled, cost: 1 });
const receipt = (legs: Receipt["legs"], over: Partial<Receipt> = {}): Receipt => ({ id: ID, at: AT, cost: 12.5, maxPayout: 40, legs, ...over });
const bytes = (text: string) => new TextEncoder().encode(text).length;

describe("buildMemo", () => {
  it("writes a small receipt as compact JSON in a fixed key order", () => {
    const memo = buildMemo(receipt([leg(95000), leg(100000, "no", 2.5)], { cost: 3.14159, maxPayout: 20 }));
    expect(memo).toBe(
      `{"app":"cushion","v":1,"id":"${ID}","at":"${AT}","cost":3.14,"pays":20,"legs":[["${symbol(95000)}","y",10],["${symbol(100000)}","n",2.5]]}`,
    );
  });

  it("carries no title and nothing but the receipt fields", () => {
    const memo = JSON.parse(buildMemo(receipt([leg(1)]))) as Record<string, unknown>;
    expect(Object.keys(memo)).toEqual(["app", "v", "id", "at", "cost", "pays", "legs"]);
  });

  it("rounds float noise to cents and normalises the timestamp", () => {
    const memo = JSON.parse(buildMemo(receipt([leg(1, "yes", 0.1 + 0.2)], { at: "2026-11-20T01:02:03Z", cost: 0.1 + 0.2 })));
    expect(memo).toMatchObject({ at: AT, cost: 0.3, legs: [[symbol(1), "y", 0.3]] });
  });

  describe("when the legs do not fit", () => {
    const legs = Array.from({ length: 40 }, (_, i) => leg(i, i % 2 ? "no" : "yes", 10 + i));
    const full = receipt(legs);
    const memo = JSON.parse(buildMemo(full)) as { legs: unknown[]; more: number; sha256: string };
    const fullJson = JSON.stringify({
      app: "cushion",
      v: 1,
      id: ID,
      at: AT,
      cost: 12.5,
      pays: 40,
      legs: legs.map((l) => [l.symbol, l.side === "yes" ? "y" : "n", l.filled]),
    });

    it("stays within the byte limit", () => {
      expect(bytes(buildMemo(full))).toBeLessThanOrEqual(MEMO_MAX_BYTES);
    });

    it("keeps a prefix of the legs, counts the rest, and commits to the whole receipt", () => {
      expect(memo.legs.length).toBeGreaterThan(0);
      expect(memo.legs.length + memo.more).toBe(40);
      expect(memo.legs).toEqual(JSON.parse(fullJson).legs.slice(0, memo.legs.length));
      expect(memo.sha256).toBe(createHash("sha256").update(fullJson).digest("hex"));
    });

    it("keeps as many legs as fit: one more would break the limit", () => {
      const oneMore = JSON.stringify({ ...memo, legs: JSON.parse(fullJson).legs.slice(0, memo.legs.length + 1), more: memo.more - 1 });
      expect(bytes(oneMore)).toBeGreaterThan(MEMO_MAX_BYTES);
    });

    it("holds the limit for the worst legal receipt", () => {
      const worst = receipt(
        Array.from({ length: 40 }, () => ({ symbol: `GEMI-${"A".repeat(80)}`, side: "no" as const, filled: 99999999.99, cost: 1 })),
        { cost: 1e20, maxPayout: 1e20 },
      );
      expect(bytes(buildMemo(worst))).toBeLessThanOrEqual(MEMO_MAX_BYTES);
    });
  });

  describe("at the byte limit", () => {
    const padded = (extra: number) => receipt([{ symbol: `GEMI-${"A".repeat(extra)}`, side: "yes", filled: 1, cost: 1 }]);
    const fixed = bytes(buildMemo(padded(0)));

    it("keeps a memo of exactly 500 bytes whole", () => {
      const memo = buildMemo(padded(MEMO_MAX_BYTES - fixed));
      expect(bytes(memo)).toBe(MEMO_MAX_BYTES);
      expect(JSON.parse(memo)).not.toHaveProperty("sha256");
    });

    it("switches to the committed form at 501", () => {
      const memo = JSON.parse(buildMemo(padded(MEMO_MAX_BYTES - fixed + 1)));
      expect(memo).toMatchObject({ legs: [], more: 1 });
      expect(memo.sha256).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
