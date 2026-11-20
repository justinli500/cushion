import { describe, expect, it } from "vitest";
import { receiptSchema } from "@/domains/receipts/schema";

const valid = {
  id: "8c1f2b3a-5d4e-4f60-9a7b-1c2d3e4f5a6b",
  at: "2026-11-20T01:02:03.000Z",
  title: "Protect my Bitcoin",
  cost: 12.5,
  maxPayout: 40,
  legs: [{ symbol: "GEMI-BTC2611202200-HI95000", side: "yes", filled: 10, cost: 5 }],
};
const withLegs = (n: number) => ({ ...valid, legs: Array.from({ length: n }, () => valid.legs[0]) });

describe("receiptSchema", () => {
  it("accepts the app's request and drops fields it does not use", () => {
    const parsed = receiptSchema.parse({ ...valid, extra: "x", legs: [{ ...valid.legs[0], note: "x" }] });
    expect(parsed).toEqual({ id: valid.id, at: valid.at, cost: 12.5, maxPayout: 40, legs: [valid.legs[0]] });
  });

  it("lowercases the id so one purchase has one key", () => {
    expect(receiptSchema.parse({ ...valid, id: valid.id.toUpperCase() }).id).toBe(valid.id);
  });

  it.each([
    ["an id that is not a uuid", { id: "abc" }],
    ["a time that is not ISO", { at: "yesterday" }],
    ["no legs", { legs: [] }],
    ["41 legs", withLegs(41)],
    ["a symbol that is not a market", { legs: [{ ...valid.legs[0], symbol: "BTC" }] }],
    ["a lowercase symbol", { legs: [{ ...valid.legs[0], symbol: "gemi-btc2611202200-hi95000" }] }],
    ["a side that is not yes or no", { legs: [{ ...valid.legs[0], side: "maybe" }] }],
    ["a negative cost", { cost: -1 }],
    ["a negative fill", { legs: [{ ...valid.legs[0], filled: -1 }] }],
    ["a payout that is not a number", { maxPayout: "40" }],
    ["a null amount, which is what JSON makes of NaN or Infinity", { cost: null }],
  ])("rejects %s", (_name, change) => {
    expect(receiptSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });

  it("accepts 1 and 40 legs", () => {
    expect(receiptSchema.safeParse(withLegs(1)).success).toBe(true);
    expect(receiptSchema.safeParse(withLegs(40)).success).toBe(true);
  });
});
