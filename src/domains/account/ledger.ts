import { z } from "zod";

export const STARTING_BALANCE = 1000;

export const SECTIONS = ["portfolio", "games", "bills", "fantasy", "business"] as const;
export type Section = (typeof SECTIONS)[number];

const legSchema = z.object({
  symbol: z.string(),
  side: z.enum(["yes", "no"]),
  quantity: z.number(),
  label: z.string(),
  strike: z.number().optional(),
  filled: z.number(),
  cost: z.number(),
});

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("AccountOpened"), at: z.string(), balance: z.number() }),
  z.object({
    type: z.literal("CushionBought"),
    at: z.string(),
    id: z.string(),
    section: z.enum(SECTIONS),
    title: z.string(),
    detail: z.string(),
    legs: z.array(legSchema),
    cost: z.number(),
    maxPayout: z.number(),
    eventTickers: z.array(z.string()),
    expiry: z.string(),
    /** Set on a cushion bought during a game replay. It settles when the replay ends, not from Gemini. */
    replay: z.string().optional(),
  }),
  z.object({ type: z.literal("CushionSettled"), at: z.string(), id: z.string(), payout: z.number() }),
  z.object({ type: z.literal("ReceiptRecorded"), at: z.string(), id: z.string(), signature: z.string() }),
  z.object({ type: z.literal("AccountReset"), at: z.string(), balance: z.number() }),
]);

export const ledgerSchema = z.array(eventSchema);
export type LedgerEvent = z.infer<typeof eventSchema>;
export type CushionBought = Extract<LedgerEvent, { type: "CushionBought" }>;

export interface Position extends CushionBought {
  /** Null while the cushion is still open. */
  payout: number | null;
  settledAt: string | null;
  receipt: string | null;
}

export interface Account {
  balance: number;
  /** Newest first. */
  positions: Position[];
}

const round = (dollars: number) => Math.round(dollars * 100) / 100;

/** The account is never stored, only derived: replaying the log is the single source of truth. */
export function replay(events: LedgerEvent[]): Account {
  let balance = STARTING_BALANCE;
  let positions: Position[] = [];
  const update = (id: string, change: (p: Position) => Position) => {
    positions = positions.map((p) => (p.id === id ? change(p) : p));
  };

  for (const event of events) {
    switch (event.type) {
      case "AccountOpened":
      case "AccountReset":
        balance = event.balance;
        positions = [];
        break;
      case "CushionBought": {
        balance = round(balance - event.cost);
        positions = [{ ...event, payout: null, settledAt: null, receipt: null }, ...positions];
        break;
      }
      case "CushionSettled": {
        const open = positions.find((p) => p.id === event.id && p.payout == null);
        // Settling twice must not pay twice: a retried settlement is ignored.
        if (!open) break;
        balance = round(balance + event.payout);
        update(event.id, (p) => ({ ...p, payout: event.payout, settledAt: event.at }));
        break;
      }
      case "ReceiptRecorded":
        update(event.id, (p) => ({ ...p, receipt: event.signature }));
        break;
    }
  }
  return { balance, positions };
}
