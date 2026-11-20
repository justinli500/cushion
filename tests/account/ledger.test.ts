import { describe, expect, it } from "vitest";
import { ledgerSchema, replay, STARTING_BALANCE, type LedgerEvent } from "@/domains/account/ledger";

const bought = (id: string, cost: number): LedgerEvent => ({
  type: "CushionBought",
  at: "2026-11-20T02:00:00.000Z",
  id,
  section: "portfolio",
  title: "BTC cushion",
  detail: "Pays if BTC closes under $62,000",
  legs: [{ symbol: "GEMI-BTC-HI62000", side: "no", quantity: 10, label: "$62,000 or above", strike: 62000, filled: 10, cost }],
  cost,
  maxPayout: 10,
  eventTickers: ["BTC2611202200"],
  expiry: "2026-11-20T22:00:00.000Z",
});

describe("replaying the ledger", () => {
  it("starts with the play-money balance", () => {
    expect(replay([])).toEqual({ balance: STARTING_BALANCE, positions: [] });
  });

  it("charges the cost on purchase and credits the payout on settlement", () => {
    const account = replay([
      bought("a", 6.2),
      { type: "CushionSettled", at: "2026-11-20T22:01:00.000Z", id: "a", payout: 10 },
    ]);
    expect(account.balance).toBe(1003.8);
    expect(account.positions[0]).toMatchObject({ id: "a", payout: 10, settledAt: "2026-11-20T22:01:00.000Z" });
  });

  it("pays a settlement only once, even if it is recorded twice", () => {
    const settle: LedgerEvent = { type: "CushionSettled", at: "2026-11-20T22:01:00.000Z", id: "a", payout: 10 };
    expect(replay([bought("a", 6), settle, settle]).balance).toBe(1004);
  });

  it("keeps open positions newest first and attaches receipts", () => {
    const account = replay([
      bought("a", 1),
      bought("b", 2),
      { type: "ReceiptRecorded", at: "2026-11-20T02:01:00.000Z", id: "a", signature: "sig" },
    ]);
    expect(account.positions.map((p) => [p.id, p.payout, p.receipt])).toEqual([["b", null, null], ["a", null, "sig"]]);
  });

  it("clears everything on reset", () => {
    const account = replay([bought("a", 5), { type: "AccountReset", at: "2026-11-20T03:00:00.000Z", balance: 1000 }]);
    expect(account).toEqual({ balance: 1000, positions: [] });
  });

  it("rejects a stored log that is not a ledger", () => {
    expect(ledgerSchema.safeParse([{ type: "CushionBought", id: 7 }]).success).toBe(false);
    expect(ledgerSchema.safeParse([bought("a", 1)]).success).toBe(true);
  });
});
