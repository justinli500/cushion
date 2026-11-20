import { yesChance } from "@/domains/cushion/probability";
import type { Chance, Cushion } from "@/domains/cushion/types";
import type { EventMarket } from "@/domains/markets/types";
import { formatUsdWhole } from "@/lib/format";

/** The news-event markets Gemini lists that a small business can honestly lean on. */
export type EventKind = "fed-hike" | "recession" | "stocks-fall" | "unemployment";

/** What a suggestion needs once its market is found: when it pays, the cushion, and how likely it is. */
export interface Cover {
  /** What triggers the payout, in one plain sentence. */
  trigger: string;
  /** The line above the title: when the cover applies. */
  when: string;
  cushion: Cushion;
  /** The market's chance that the cushion pays anything. */
  chance: Chance;
  eventTickers: string[];
  expiry: string;
  /** Set when the market only loosely tracks what the business loses, said in plain words on the card. */
  roughMatch?: string;
}

export const UNKNOWN: Chance = { p: null, low: null, high: null, uncertain: true };

/** Exactly one bucket wins, so the chance any of several pays is the sum of theirs. */
export function sumChances(chances: Chance[]): Chance {
  if (chances.every((c) => c.p == null)) return UNKNOWN;
  const total = (pick: (c: Chance) => number) => Math.min(1, chances.reduce((t, c) => t + pick(c), 0));
  return {
    p: total((c) => c.p ?? 0),
    low: total((c) => c.low ?? 0),
    high: total((c) => c.high ?? 1),
    uncertain: chances.some((c) => c.uncertain),
  };
}

export const EVENT_TITLES: Record<EventKind, string> = {
  "fed-hike": "Higher interest rates",
  recession: "A recession",
  "stocks-fall": "A stock market drop",
  unemployment: "Rising unemployment",
};

/** Gemini lists these by title, and each month's Fed market has a new ticker, so the title is the stable handle. */
const MARKET_TITLES: Record<EventKind, RegExp> = {
  "fed-hike": /^Fed decision/i,
  recession: /^Recession this year/i,
  "stocks-fall": /^How low will the S&P get/i,
  unemployment: /^How high will unemployment get/i,
};

const ROUGH_MATCH: Record<EventKind, string> = {
  "fed-hike": "It pays on the Fed's decision, not on your own loan.",
  recession: "It pays if the economy is in recession, not on your own sales.",
  "stocks-fall": "It pays on the stock market, not on your own sales.",
  unemployment: "It pays on the national jobless rate, not on your own sales.",
};

type Outcome = EventMarket["outcomes"][number];
interface Pick {
  outcomes: Outcome[];
  trigger: string;
  when: string;
  /** "one" when the outcomes are rivals and only one can win. */
  mode: Cushion["payoutMode"];
}

const buyable = (o: Outcome) => o.contract.open && o.contract.quote.ask != null;
const nobodySelling = (what: string) => `Nobody is selling ${what} on Gemini right now.`;

/** How big a rate rise a Fed outcome is, in basis points; 0 for a cut or no change. ">25" sorts just above 25. */
const hikeSize = (label: string): number => (/hike/i.test(label) ? Number(/\d+/.exec(label)?.[0] ?? 0) + (label.includes(">") ? 0.5 : 0) : 0);

function pickFed(market: EventMarket, sell: Outcome[], amount: string): Pick | string {
  // Paying on the hike the market already expects would cost nearly the whole payout, so cover only a bigger one.
  const favourite = [...market.outcomes].sort((a, b) => (yesChance(b.contract.quote).p ?? -1) - (yesChance(a.contract.quote).p ?? -1))[0];
  const expected = hikeSize(favourite.label);
  const outcomes = sell.filter((o) => hikeSize(o.label) > expected);
  if (outcomes.length === 0) return nobodySelling("cover against a bigger rate hike");
  const month = /\bin (\w+)\??$/i.exec(market.title)?.[1];
  const decision = `${month ?? "next"} decision`;
  const hint = expected > 0 ? ` (the market expects ${favourite.label})` : "";
  return {
    outcomes,
    mode: "one",
    when: `${month ?? "Next"} decision`,
    trigger: `Pays ${amount} if the Fed's ${decision} is ${outcomes.map((o) => o.label).join(" or ")}${hint}.`,
  };
}

function pickRecession(sell: Outcome[], amount: string): Pick | string {
  const yes = sell.find((o) => /^yes$/i.test(o.label));
  if (!yes) return nobodySelling("cover against a recession");
  return { outcomes: [yes], mode: "sum", when: "This year", trigger: `Pays ${amount} if the US is in a recession this year.` };
}

function pickStocks(sell: Outcome[], amount: string): Pick | string {
  // The shallowest dip the market lists is the likeliest to happen, so it is the one that pays most often.
  const dips = sell
    .map((o) => ({ o, level: Number(/^([\d,]+) or below$/i.exec(o.label)?.[1].replace(/,/g, "") ?? NaN) }))
    .filter((d) => Number.isFinite(d.level))
    .sort((a, b) => b.level - a.level);
  if (dips.length === 0) return nobodySelling("cover against a stock market drop");
  const { o } = dips[0];
  return { outcomes: [o], mode: "sum", when: "This year", trigger: `Pays ${amount} if the S&P 500 falls to ${o.label} at any point this year.` };
}

function pickUnemployment(sell: Outcome[], amount: string): Pick | string {
  const rates = sell
    .map((o) => ({ o, rate: Number(/^Above (\d+(?:\.\d+)?)%$/i.exec(o.label)?.[1] ?? NaN) }))
    .filter((r) => Number.isFinite(r.rate))
    .sort((a, b) => a.rate - b.rate);
  if (rates.length === 0) return nobodySelling("cover against rising unemployment");
  const { o, rate } = rates[0];
  return { outcomes: [o], mode: "sum", when: "This year", trigger: `Pays ${amount} if unemployment gets above ${rate}% at any point this year.` };
}

/** A cover built from one news-event market, paying `payout` dollars, or a plain sentence on why there is none. */
export function eventCover(kind: EventKind, markets: EventMarket[], payout: number): Cover | string {
  const market = markets.find((m) => MARKET_TITLES[kind].test(m.title));
  if (!market) return "Gemini has no open market on this right now.";

  const sell = market.outcomes.filter(buyable);
  const amount = formatUsdWhole(payout);
  const picked =
    kind === "fed-hike"
      ? pickFed(market, sell, amount)
      : kind === "recession"
        ? pickRecession(sell, amount)
        : kind === "stocks-fall"
          ? pickStocks(sell, amount)
          : pickUnemployment(sell, amount);
  if (typeof picked === "string") return picked;

  // Gemini trades whole contracts in hundredths, and a payout under a cent cannot be bought.
  const quantity = Math.round(payout * 100) / 100;
  return {
    trigger: picked.trigger,
    when: picked.when,
    cushion: {
      payoutMode: picked.mode,
      legs: quantity < 0.01 ? [] : picked.outcomes.map((o) => ({ symbol: o.contract.symbol, side: "yes" as const, quantity, label: `${market.title} ${o.label}` })),
    },
    chance: sumChances(picked.outcomes.map((o) => yesChance(o.contract.quote))),
    eventTickers: [market.eventTicker],
    expiry: market.expiry,
    roughMatch: ROUGH_MATCH[kind],
  };
}
