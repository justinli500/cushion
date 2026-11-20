import { z } from "zod";

const numeric = z.union([z.string(), z.number()]).transform(Number);
const optionalPrice = numeric.nullish().transform((value) => (value == null || Number.isNaN(value) ? null : value));

export const rawContractSchema = z.object({
  label: z.string(),
  ticker: z.string(),
  instrumentSymbol: z.string(),
  strike: z.object({ type: z.string(), value: numeric.nullish() }).nullish(),
  status: z.string().nullish(),
  marketState: z.string().nullish(),
  prices: z
    .object({ bestBid: optionalPrice, bestAsk: optionalPrice, lastTradePrice: optionalPrice })
    .nullish(),
  resolutionSide: z.enum(["yes", "no"]).nullish(),
  settlementValue: numeric.nullish(),
});

export const rawEventSchema = z.object({
  ticker: z.string(),
  title: z.string(),
  type: z.string().nullish(),
  category: z.string().nullish(),
  status: z.string().nullish(),
  startTime: z.string().nullish(),
  expiryDate: z.string().nullish(),
  isLive: z.boolean().nullish(),
  gameId: z.string().nullish(),
  template: z.string().nullish(),
  volume: numeric.nullish(),
  participants: z
    .array(z.object({ name: z.string(), abbreviation: z.string(), side: z.string().nullish() }))
    .nullish(),
  sportsMarket: z
    .object({
      type: z.string().nullish(),
      metric: z.string().nullish(),
      scope: z.object({ type: z.string().nullish() }).nullish(),
      team: z.object({ symbol: z.string().nullish() }).nullish(),
      player: z.object({ name: z.string(), position: z.string().nullish() }).nullish(),
    })
    .nullish(),
  contracts: z.array(rawContractSchema).default([]),
});

export const eventsResponseSchema = z.object({ data: z.array(rawEventSchema) });

const level = z.object({ price: numeric, amount: numeric });
export const bookResponseSchema = z.object({ bids: z.array(level).default([]), asks: z.array(level).default([]) });

export const candlesResponseSchema = z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]));

export type RawEvent = z.infer<typeof rawEventSchema>;
export type RawContract = z.infer<typeof rawContractSchema>;
