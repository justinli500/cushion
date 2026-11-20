import { stripLegs } from "@/domains/cushion/legs";
import { impliedSpot } from "@/domains/cushion/probability";
import type { Cushion, Leg } from "@/domains/cushion/types";
import { UNDERLYINGS, type EventMarket, type Ladder } from "@/domains/markets/types";
import { formatLevel, formatPrice } from "@/lib/format";
import type { Exposure, HoldingRead } from "./portfolio";

/** `/api/book` prices at most 40 contracts at once, and one cushion is priced as a whole. */
export const MAX_LEGS = 40;
/** Per scenario, so that two of them can still be bought together. */
const MAX_SCENARIO_LEGS = 20;
/** A coin or commodity cover starts paying this far (as a fraction) past the market's expected close. */
const START_AFTER = 0.01;

/** One thing the portfolio is exposed to, with the legs that pay when it goes wrong. */
export interface Scenario {
  id: string;
  /** "Bitcoin drops 7% by Nov 30". */
  title: string;
  /** "Hits your BTC and MSTR". */
  hurts: string;
  /** True when the size of the exposure was worked out from price history instead of being the holding itself. */
  estimate: boolean;
  /** Dollars lost if the market goes as far as this cover reaches. */
  loss: number;
  cushion: Cushion;
  eventTicker: string;
  expiry: string;
  /** When it pays, to finish "Pays if ...". */
  trigger: string;
  /** The market behind it, one line. */
  market: string;
}

export interface ScenarioInput {
  /** What the holdings have riding on each coin or commodity. */
  exposures: Exposure[];
  /** What the holdings that move with the S&P 500 have riding on it. */
  index: { dollars: number; holdings: HoldingRead[] } | null;
  ladders: Ladder[];
  events: EventMarket[];
  /** The S&P 500's last close, which the index scenario is measured from. */
  indexSpot: number | null;
}

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const dayOf = (iso: string) => day.format(new Date(iso));

const sentence = (symbols: string[]) =>
  symbols.length < 3 ? symbols.join(" and ") : `${symbols.slice(0, -1).join(", ")} and ${symbols[symbols.length - 1]}`;

const hurtsFor = (holdings: HoldingRead[]) => `Hits your ${sentence(holdings.map((h) => h.symbol))}`;

const round2 = (quantity: number) => Math.round(quantity * 100) / 100;

/** The loss at the strip's last rung, the furthest the cover reaches. */
const lossAt = (dollars: number, spot: number, level: number) => (Math.abs(dollars) * Math.abs(spot - level)) / spot;

/** The latest-dated ladder that yields a cover, so the cover runs to the end of the month and not the end of the day. */
function ladderScenario(exposure: Exposure, ladders: Ladder[]): Scenario | null {
  const falling = exposure.dollars > 0;
  const name = UNDERLYINGS[exposure.underlying].name;
  const candidates = ladders
    .filter((l) => l.horizon === "dated" && l.underlying === exposure.underlying)
    .sort((a, b) => Date.parse(b.expiry) - Date.parse(a.expiry));

  for (const ladder of candidates) {
    const spot = impliedSpot(ladder);
    if (spot == null || spot <= 0) continue;
    const strip = stripLegs({
      ladder,
      direction: falling ? "fall" : "rise",
      startLevel: spot * (falling ? 1 - START_AFTER : 1 + START_AFTER),
      dollarsPerPoint: Math.abs(exposure.dollars) / spot,
    });
    const legs = strip.legs.slice(0, MAX_SCENARIO_LEGS);
    const first = legs[0]?.strike;
    const last = legs[legs.length - 1]?.strike;
    if (first == null || last == null) continue;

    const when = dayOf(ladder.expiry);
    return {
      id: `ladder:${exposure.underlying}`,
      title: `${name} ${falling ? "drops" : "climbs"} ${Math.max(1, Math.round((Math.abs(spot - last) / spot) * 100))}% by ${when}`,
      hurts: hurtsFor(exposure.holdings),
      estimate: exposure.holdings.some((h) => h.status === "tracks"),
      loss: lossAt(exposure.dollars, spot, last),
      cushion: { legs, payoutMode: "sum" },
      eventTicker: ladder.eventTicker,
      expiry: ladder.expiry,
      trigger: `${name} closes ${falling ? "below" : "above"} ${formatPrice(first)} on ${when}`,
      market: `Market: \u201c${ladder.title}\u201d \u00b7 pays in steps from ${formatPrice(first)} ${falling ? "down" : "up"} to ${formatPrice(last)}.`,
    };
  }
  return null;
}

const LEVEL = /^([\d,]+(?:\.\d+)?)\s+or\s+(below|above)$/i;

/**
 * "How low will the S&P get this year?" lists a YES contract per level ("6,200 or below") that pays
 * if the index touches that level at any point this year. Holding every level from the nearest to the
 * furthest, each sized to the gap to the one before it, pays the whole loss at whichever level it reaches.
 */
function indexScenario(input: ScenarioInput): Scenario | null {
  const { index, events, indexSpot: spot } = input;
  if (!index || spot == null || spot <= 0 || index.dollars === 0) return null;
  const falling = index.dollars > 0;
  const market = events.find((m) => (falling ? /how low will the s&p/i : /how high will the s&p/i).test(m.title));
  if (!market) return null;

  const levels = market.outcomes
    .flatMap((outcome) => {
      const match = LEVEL.exec(outcome.label.trim());
      const level = match ? Number(match[1].replace(/,/g, "")) : NaN;
      const rightWay = match?.[2].toLowerCase() === (falling ? "below" : "above") && (falling ? level < spot : level > spot);
      return rightWay && outcome.contract.open ? [{ level, contract: outcome.contract }] : [];
    })
    .sort((a, b) => (falling ? b.level - a.level : a.level - b.level))
    .slice(0, MAX_SCENARIO_LEGS);
  if (levels.length === 0) return null;

  const perPoint = Math.abs(index.dollars) / spot;
  const legs: Leg[] = levels.map(({ level, contract }, i) => ({
    symbol: contract.symbol,
    side: "yes",
    quantity: round2(perPoint * Math.abs((i === 0 ? spot : levels[i - 1].level) - level)),
    label: contract.label,
    strike: level,
  }));
  const kept = legs.filter((l) => l.quantity >= 0.01);
  if (kept.length === 0) return null;

  const first = levels[0];
  const last = levels[levels.length - 1];
  const when = dayOf(market.expiry);
  return {
    id: "index",
    title: `Stocks ${falling ? "drop" : "climb"} ${Math.max(1, Math.round((Math.abs(spot - last.level) / spot) * 100))}% by ${when}`,
    hurts: hurtsFor(index.holdings),
    estimate: true,
    loss: lossAt(index.dollars, spot, last.level),
    cushion: { legs: kept, payoutMode: "sum" },
    eventTicker: market.eventTicker,
    expiry: market.expiry,
    trigger: `the S&P 500 touches ${formatLevel(first.level)} before ${when}`,
    market: `Market: \u201c${market.title}\u201d \u00b7 Yes on every level from ${first.contract.label} to ${last.contract.label}. Pays if the index reaches one before ${when}, even if it recovers.`,
  };
}

/** One scenario per thing the portfolio is exposed to that Gemini lists a market for, the biggest possible loss first. */
export function buildScenarios(input: ScenarioInput): Scenario[] {
  return [...input.exposures.map((exposure) => ladderScenario(exposure, input.ladders)), indexScenario(input)]
    .filter((scenario): scenario is Scenario => scenario != null)
    .sort((a, b) => b.loss - a.loss);
}

/** The worst case with the cushion: whatever it leaves uncovered, plus what it cost. */
export const outOfPocket = (loss: number, cost: number, payout: number) => Math.max(0, loss - payout) + cost;
