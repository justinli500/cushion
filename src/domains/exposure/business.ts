import { stripLegs, teamLossLegs, temperatureLegs } from "@/domains/cushion/legs";
import { chanceAtOrAbove, chanceOf, impliedSpot, yesChance } from "@/domains/cushion/probability";
import { UNDERLYINGS, type BucketMarket, type EventMarket, type Game, type Ladder, type UnderlyingId } from "@/domains/markets/types";
import { formatUsd, formatUsdWhole, formatWhen } from "@/lib/format";
import { EVENT_TITLES, UNKNOWN, eventCover, sumChances, type Cover, type EventKind } from "./business-events";

export type WeatherKind = "cold-day" | "hot-day";

/** Something that costs a small business money, in the owner's words. `why` is one plain sentence. */
export type Risk =
  | { kind: WeatherKind; why: string }
  | { kind: "home-loss"; why: string }
  | { kind: "cost-rise"; underlying: UnderlyingId; what: string; why: string }
  | { kind: "event"; event: EventKind; why: string };

export type CostRisk = Extract<Risk, { kind: "cost-rise" }>;

export interface BusinessType {
  /** Saved in the profile, so it must stay stable. */
  id: string;
  name: string;
  /** Finishes "Suggested for", e.g. "a food truck". */
  forWhom: string;
  risks: Risk[];
}

const cold = (why: string): Risk => ({ kind: "cold-day", why });
const hot = (why: string): Risk => ({ kind: "hot-day", why });
const loss = (why: string): Risk => ({ kind: "home-loss", why });
const cost = (underlying: UnderlyingId, what: string, why: string): CostRisk => ({ kind: "cost-rise", underlying, what, why });
const event = (kind: EventKind, why: string): Risk => ({ kind: "event", event: kind, why });

export const BUSINESS_TYPES: readonly BusinessType[] = [
  {
    id: "food-truck",
    name: "Food truck",
    forWhom: "a food truck",
    risks: [cold("Cold days thin out the lunch line."), cost("BRENT", "fuel", "Fuel for the truck and the generator adds up fast.")],
  },
  {
    id: "ice-cream",
    name: "Ice cream shop",
    forWhom: "an ice cream shop",
    risks: [
      cold("Cold days send people anywhere but the ice cream shop."),
      cost("NGAS", "power", "The freezers never turn off, and power prices follow natural gas."),
    ],
  },
  {
    id: "patio",
    name: "Patio restaurant",
    forWhom: "a patio restaurant",
    risks: [
      cold("Cold evenings keep people off the patio."),
      hot("Scorching afternoons drive people indoors."),
      cost("NGAS", "gas", "The patio heaters and the kitchen both run on gas."),
      event("recession", "In a recession, dinners out are the first thing people cut."),
    ],
  },
  {
    id: "coffee-cart",
    name: "Coffee cart",
    forWhom: "a coffee cart",
    risks: [cold("Bitter cold keeps people from stopping at the cart."), hot("Hot afternoons mean nobody wants a coffee.")],
  },
  {
    id: "sports-bar",
    name: "Sports bar",
    forWhom: "a sports bar",
    risks: [
      loss("When your team loses, the crowd leaves early and the tabs stay small."),
      cost("NGAS", "gas", "The fryers and the kitchen run on gas."),
      event("unemployment", "When people lose their jobs, a night at the bar is an easy cut."),
    ],
  },
  {
    id: "car-wash",
    name: "Car wash",
    forWhom: "a car wash",
    risks: [cold("Freezing days shut the bays, because wet cars ice up."), cost("NGAS", "gas", "Heating the wash water runs on gas.")],
  },
  {
    id: "delivery",
    name: "Delivery or courier",
    forWhom: "a delivery driver",
    risks: [
      cost("BRENT", "fuel", "Fuel is the cost you cannot pass on to customers."),
      event("fed-hike", "If your vehicle loan floats with interest rates, a bigger hike lifts your payment."),
    ],
  },
  {
    id: "landscaping",
    name: "Landscaping",
    forWhom: "a landscaping crew",
    risks: [
      hot("Scorching days cut your crew's hours."),
      cost("BRENT", "fuel", "The mowers, the trimmers and the truck all run on fuel."),
      event("fed-hike", "If your equipment loan floats with interest rates, a bigger hike lifts your payment."),
    ],
  },
  {
    id: "electrician",
    name: "Electrician or contractor",
    forWhom: "an electrician",
    risks: [
      cost("COPPER", "copper", "Wire is copper, and its price lands in every quote you give."),
      cost("BRENT", "fuel", "The van burns fuel on every job."),
    ],
  },
  {
    id: "jeweler",
    name: "Jeweler",
    forWhom: "a jeweler",
    risks: [
      cost("XAU", "gold", "Every ring and chain starts with gold you have to buy."),
      cost("XAG", "silver", "What you pay for silver sets the price of every piece you make."),
      event("stocks-fall", "Rings and chains sell when people feel wealthy, and a falling market takes that feeling away."),
    ],
  },
];

export const businessType = (id: string | null): BusinessType | null => BUSINESS_TYPES.find((b) => b.id === id) ?? null;

export interface Needs {
  city: boolean;
  team: boolean;
  /** Weather, game and news-event cushions pay out what a bad day costs. */
  badDay: boolean;
  /** Each cost risk needs a monthly spend. */
  costs: CostRisk[];
  /** Some risk is a news-event market. */
  events: boolean;
}

/** The questions a business has to answer before its risks can be priced. */
export function needsOf(business: BusinessType): Needs {
  const kinds = new Set(business.risks.map((r) => r.kind));
  return {
    city: kinds.has("cold-day") || kinds.has("hot-day"),
    team: kinds.has("home-loss"),
    badDay: kinds.has("cold-day") || kinds.has("hot-day") || kinds.has("home-loss") || kinds.has("event"),
    costs: business.risks.filter((r): r is CostRisk => r.kind === "cost-rise"),
    events: kinds.has("event"),
  };
}

export type AmountKey = "badDay" | UnderlyingId;

export interface Amount {
  key: AmountKey;
  /** Finishes the sentence the number answers, e.g. "A bad day costs about". */
  label: string;
}

/** The dollar amounts a business owner can set, in the order they are shown. */
export function amountsOf(needs: Needs): Amount[] {
  return [
    ...(needs.badDay ? [{ key: "badDay" as const, label: "A bad day costs about" }] : []),
    ...needs.costs.map((c) => ({ key: c.underlying, label: `What you spend on ${c.what} each month` })),
  ];
}

/** Where an amount starts until the owner types their own: a bad day, or a month's bill. */
export const guessAmount = (key: AmountKey): number => (key === "badDay" ? 300 : 400);

export interface Team {
  league: string;
  abbr: string;
  name: string;
}

const HOUR = 3_600_000;
/** A weather market this close to expiry already has its answer: the day's high is in. */
const LAST_CALL_MS = 3 * HOUR;
const LEAGUE_ORDER = ["NFL", "NBA", "NHL", "NCAAF", "NCAAM"];

export const cityOptions = (markets: BucketMarket[]): string[] => [...new Set(markets.map((m) => m.city))].sort();

export function teamOptions(games: Game[]): Team[] {
  const byKey = new Map<string, Team>();
  for (const g of games) {
    for (const t of g.teams) byKey.set(`${g.league}/${t.abbr}`, { league: g.league, abbr: t.abbr, name: t.name });
  }
  const rank = (league: string) => {
    const i = LEAGUE_ORDER.indexOf(league);
    return i === -1 ? LEAGUE_ORDER.length : i;
  };
  return [...byKey.values()].sort((a, b) => rank(a.league) - rank(b.league) || a.name.localeCompare(b.name));
}

/** The nearest unexpired high-temperature market for the city, preferring one with the day still ahead. */
export function pickWeather(markets: BucketMarket[], city: string, now: number): BucketMarket | null {
  const open = markets
    .filter((m) => m.city === city && Date.parse(m.expiry) > now)
    .sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry));
  return open.find((m) => Date.parse(m.expiry) - now > LAST_CALL_MS) ?? open[0] ?? null;
}

/** "today (November 19)", "tomorrow (November 20)", or "on November 22". */
export function coverDay(market: BucketMarket, now: number): string {
  const date = / on (\w+ \d+)/.exec(market.title)?.[1];
  const hours = (Date.parse(market.expiry) - now) / HOUR;
  const word = hours <= 24 ? "today" : hours <= 48 ? "tomorrow" : null;
  if (word) return date ? `${word} (${date})` : word;
  return date ? `on ${date}` : "that day";
}

/** The team's next game that has not expired. Games arrive sorted by start, but the pick does not rely on it. */
export function pickGame(games: Game[], team: Team, now: number): Game | null {
  const upcoming = games
    .filter((g) => g.league === team.league && g.teams.some((t) => t.abbr === team.abbr) && Date.parse(g.expiry) > now)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  return upcoming[0] ?? null;
}

/** The dated ladder that expires last, which is the month-end one. Intraday ladders are too short to cushion a bill. */
export function monthEndLadder(ladders: Ladder[], underlying: UnderlyingId, now: number): Ladder | null {
  const dated = ladders
    .filter((l) => l.underlying === underlying && l.horizon === "dated" && Date.parse(l.expiry) > now)
    .sort((a, b) => Date.parse(b.expiry) - Date.parse(a.expiry));
  return dated[0] ?? null;
}

/**
 * The temperature a cushion starts from, taken from the market's most likely bucket: the bucket's
 * lower bound for a cold day ("colder than expected") and its upper bound for a hot one. An open
 * tail has no bound on the far side, so the cushion starts one degree inside it.
 */
export function defaultThreshold(market: BucketMarket, kind: WeatherKind): number | null {
  let likely: BucketMarket["buckets"][number] | null = null;
  let best = -1;
  for (const b of market.buckets) {
    const { p } = yesChance(b.contract.quote);
    if (b.contract.open && p != null && p > best) {
      likely = b;
      best = p;
    }
  }
  if (!likely) return null;
  const { lo, hi } = likely;
  if (kind === "cold-day") return lo ?? (hi == null ? null : hi + 1);
  return hi ?? (lo == null ? null : lo - 1);
}

export interface SuggestInput {
  now: number;
  city: string | null;
  /** The market already picked for `city`. */
  weather: BucketMarket | null;
  team: Team | null;
  /** The game already picked for `team`. */
  game: Game | null;
  ladders: Ladder[];
  events: EventMarket[];
  /** Dollars a bad day costs. Weather, game and news-event cushions pay this. */
  badDayCost: number;
  /** Dollars spent each month, by underlying. */
  monthlySpend: Partial<Record<UnderlyingId, number>>;
}

export type Suggestion =
  | ({ status: "ready"; risk: Risk; title: string } & Cover)
  | { status: "unavailable"; risk: Risk; title: string; reason: string };

// Mid-sentence names: UNDERLYINGS capitalises "Natural gas" and "Gold" as if they started one.
const MARKET_WORDS: Partial<Record<UnderlyingId, string>> = { NGAS: "natural gas", XAU: "gold", XAG: "silver", COPPER: "copper" };
const marketWord = (id: UnderlyingId) => MARKET_WORDS[id] ?? UNDERLYINGS[id].name;

const price = (level: number) => (level >= 1000 ? formatUsdWhole(level) : formatUsd(level));
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function titleOf(risk: Risk, input: Pick<SuggestInput, "city" | "team">): string {
  switch (risk.kind) {
    case "cold-day":
    case "hot-day":
      return `A ${risk.kind === "cold-day" ? "cold" : "hot"} day${input.city ? ` in ${input.city}` : ""}`;
    case "home-loss":
      return input.team ? `A loss for ${input.team.name}` : "A loss for your team";
    case "cost-rise":
      return `Pricier ${risk.what}`;
    case "event":
      return EVENT_TITLES[risk.event];
  }
}

function weatherBody(kind: WeatherKind, input: SuggestInput): Cover | string {
  const { weather: market, badDayCost: payout } = input;
  if (!input.city) return "Choose your city to see this one.";
  if (!market) return `There is no temperature market for ${input.city} right now.`;
  const threshold = defaultThreshold(market, kind);
  if (threshold == null) return "Nobody is quoting this market yet.";

  const isCold = kind === "cold-day";
  const cushion = temperatureLegs({ market, direction: isCold ? "below" : "above", threshold, payout });
  if (cushion.legs.length === 0) return `The market lists no ${isCold ? "cooler" : "hotter"} range to cover.`;

  const symbols = new Set(cushion.legs.map((l) => l.symbol));
  const picked = market.buckets.filter((b) => symbols.has(b.contract.symbol));
  const verb = isCold ? `stays under ${threshold}` : `climbs above ${threshold}`;
  return {
    trigger: `Pays ${formatUsdWhole(payout)} if ${market.city}'s high ${verb}°F ${coverDay(market, input.now)}.`,
    when: capitalise(coverDay(market, input.now)),
    cushion,
    chance: sumChances(picked.map((b) => yesChance(b.contract.quote))),
    eventTickers: [market.eventTicker],
    expiry: market.expiry,
  };
}

function gameBody(input: SuggestInput): Cover | string {
  const { game, team, badDayCost: payout } = input;
  if (!team) return "Choose your team to see this one.";
  if (!game) return `No game for ${team.name} is listed soon.`;
  const cushion = teamLossLegs(game, team.abbr, payout);
  const [leg] = cushion.legs;
  if (!leg) return "Nobody is quoting this game yet.";

  const opponent = game.teams.find((t) => t.abbr !== team.abbr);
  const when = game.isLive ? "game on now" : formatWhen(game.startTime);
  const bought = game.teams.find((t) => t.contract.symbol === leg.symbol)?.contract;
  return {
    trigger: `Pays ${formatUsdWhole(payout)} if ${team.name} lose to ${opponent?.name ?? "the other side"} (${when}).`,
    when: capitalise(when),
    cushion,
    chance: bought ? chanceOf(bought.quote, leg.side) : UNKNOWN,
    eventTickers: [game.eventTicker],
    expiry: game.expiry,
  };
}

function costBody(risk: CostRisk, input: SuggestInput): Cover | string {
  const name = marketWord(risk.underlying);
  const ladder = monthEndLadder(input.ladders, risk.underlying, input.now);
  if (!ladder) return `No month-end market for ${name} is open right now.`;
  const implied = impliedSpot(ladder);
  if (implied == null) return `Nobody is quoting ${name} yet.`;

  // Float noise in the interpolation must not push the start a hair past a rung it sits on.
  const start = Math.round(implied * 100) / 100;
  const spend = input.monthlySpend[risk.underlying] ?? 0;
  const cushion = stripLegs({ ladder, direction: "rise", startLevel: start, dollarsPerPoint: spend / start });
  if (cushion.legs.length === 0) return `Nothing is on offer above ${price(start)} for ${name}.`;

  const payout = cushion.legs.reduce((total, l) => total + l.quantity, 0);
  // The first rung can sit above the even-odds start, and the cover only begins paying there.
  const strikes = cushion.legs.map((l) => l.strike ?? start);
  return {
    trigger: `Pays as ${name} climbs past ${price(Math.min(...strikes))} by ${shortDate(ladder.expiry)}, up to ${formatUsdWhole(payout)} at ${price(Math.max(...strikes))}.`,
    when: `By ${shortDate(ladder.expiry)}`,
    cushion,
    chance: { p: chanceAtOrAbove(ladder, start), low: null, high: null, uncertain: false },
    eventTickers: [ladder.eventTicker],
    expiry: ladder.expiry,
  };
}

/** Turns one risk and what the owner told us into a cushion that can be priced, or says why it cannot. */
export function suggest(risk: Risk, input: SuggestInput): Suggestion {
  const title = titleOf(risk, input);
  const body =
    risk.kind === "home-loss"
      ? gameBody(input)
      : risk.kind === "cost-rise"
        ? costBody(risk, input)
        : risk.kind === "event"
          ? eventCover(risk.event, input.events, input.badDayCost)
          : weatherBody(risk.kind, input);
  return typeof body === "string" ? { status: "unavailable", risk, title, reason: body } : { status: "ready", risk, title, ...body };
}
