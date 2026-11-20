import { stripLegs, teamLossLegs, temperatureLegs } from "@/domains/cushion/legs";
import { chanceAtOrAbove, chanceOf, impliedSpot, yesChance } from "@/domains/cushion/probability";
import type { Chance, Cushion } from "@/domains/cushion/types";
import { UNDERLYINGS, type BucketMarket, type Game, type Ladder, type UnderlyingId } from "@/domains/markets/types";
import { formatUsd, formatUsdWhole, formatWhen } from "@/lib/format";

export type WeatherKind = "cold-day" | "hot-day";

/** Something that costs a small business money, in the owner's words. `why` is one plain sentence. */
export type Risk =
  | { kind: WeatherKind; why: string }
  | { kind: "home-loss"; why: string }
  | { kind: "cost-rise"; underlying: UnderlyingId; what: string; why: string };

export type CostRisk = Extract<Risk, { kind: "cost-rise" }>;

export interface BusinessType {
  /** Saved in the profile, so it must stay stable. */
  id: string;
  name: string;
  blurb: string;
  risks: Risk[];
}

const cold = (why: string): Risk => ({ kind: "cold-day", why });
const hot = (why: string): Risk => ({ kind: "hot-day", why });
const loss = (why: string): Risk => ({ kind: "home-loss", why });
const cost = (underlying: UnderlyingId, what: string, why: string): CostRisk => ({ kind: "cost-rise", underlying, what, why });

export const BUSINESS_TYPES: readonly BusinessType[] = [
  {
    id: "food-truck",
    name: "Food truck",
    blurb: "Paid when the weather thins the line.",
    risks: [cold("Cold days thin out the lunch line."), cost("BRENT", "fuel", "Fuel for the truck and the generator adds up fast.")],
  },
  {
    id: "ice-cream",
    name: "Ice cream shop",
    blurb: "Paid when a cold snap empties the shop.",
    risks: [
      cold("Cold days send people anywhere but the ice cream shop."),
      cost("NGAS", "power", "The freezers never turn off, and power prices follow natural gas."),
    ],
  },
  {
    id: "patio",
    name: "Patio restaurant",
    blurb: "Paid when the weather keeps people inside.",
    risks: [
      cold("Cold evenings keep people off the patio."),
      hot("Scorching afternoons drive people indoors."),
      cost("NGAS", "gas", "The patio heaters and the kitchen both run on gas."),
    ],
  },
  {
    id: "coffee-cart",
    name: "Coffee cart",
    blurb: "Paid when the weather turns people away.",
    risks: [cold("Bitter cold keeps people from stopping at the cart."), hot("Hot afternoons mean nobody wants a coffee.")],
  },
  {
    id: "sports-bar",
    name: "Sports bar",
    blurb: "Paid when your team loses.",
    risks: [
      loss("When our team loses, the crowd leaves early and the tabs stay small."),
      cost("NGAS", "gas", "The fryers and the kitchen run on gas."),
    ],
  },
  {
    id: "car-wash",
    name: "Car wash",
    blurb: "Paid when a freeze shuts the bays.",
    risks: [cold("Freezing days shut the bays, because wet cars ice up."), cost("NGAS", "gas", "Heating the wash water runs on gas.")],
  },
  {
    id: "delivery",
    name: "Delivery or courier",
    blurb: "Paid when fuel gets pricier.",
    risks: [cost("BRENT", "fuel", "Fuel is the cost I cannot pass on to customers.")],
  },
  {
    id: "landscaping",
    name: "Landscaping",
    blurb: "Paid when heat or fuel eats your margin.",
    risks: [hot("Scorching days cut my crew's hours."), cost("BRENT", "fuel", "The mowers, the trimmers and the truck all run on fuel.")],
  },
  {
    id: "electrician",
    name: "Electrician or contractor",
    blurb: "Paid when materials get pricier.",
    risks: [
      cost("COPPER", "copper", "Wire is copper, and its price lands in every quote I give."),
      cost("BRENT", "fuel", "The van burns fuel on every job."),
    ],
  },
  {
    id: "jeweler",
    name: "Jeweler",
    blurb: "Paid when metal gets pricier.",
    risks: [
      cost("XAU", "gold", "Every ring and chain starts with gold I have to buy."),
      cost("XAG", "silver", "What I pay for silver sets the price of every piece I make."),
    ],
  },
];

export const businessType = (id: string | null): BusinessType | null => BUSINESS_TYPES.find((b) => b.id === id) ?? null;

export interface Needs {
  city: boolean;
  team: boolean;
  /** Weather and game cushions pay out what a bad day costs. */
  badDay: boolean;
  /** Each cost risk needs a monthly spend. */
  costs: CostRisk[];
}

/** The questions a business has to answer before its risks can be priced. */
export function needsOf(business: BusinessType): Needs {
  const kinds = new Set(business.risks.map((r) => r.kind));
  return {
    city: kinds.has("cold-day") || kinds.has("hot-day"),
    team: kinds.has("home-loss"),
    badDay: kinds.has("cold-day") || kinds.has("hot-day") || kinds.has("home-loss"),
    costs: business.risks.filter((r): r is CostRisk => r.kind === "cost-rise"),
  };
}

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
  /** Dollars a bad day costs. Weather and game cushions pay this. */
  badDayCost: number;
  /** Dollars spent each month, by underlying. */
  monthlySpend: Partial<Record<UnderlyingId, number>>;
}

interface Body {
  /** What triggers the payout, in one plain sentence. */
  trigger: string;
  cushion: Cushion;
  /** The market's chance that the cushion pays anything. */
  chance: Chance;
  eventTickers: string[];
  expiry: string;
}

export type Suggestion =
  | ({ status: "ready"; risk: Risk; title: string } & Body)
  | { status: "unavailable"; risk: Risk; title: string; reason: string };

const UNKNOWN: Chance = { p: null, low: null, high: null, uncertain: true };

/** Exactly one bucket wins, so the chance any of several pays is the sum of theirs. */
function sumChances(chances: Chance[]): Chance {
  if (chances.every((c) => c.p == null)) return UNKNOWN;
  const total = (pick: (c: Chance) => number) => Math.min(1, chances.reduce((t, c) => t + pick(c), 0));
  return {
    p: total((c) => c.p ?? 0),
    low: total((c) => c.low ?? 0),
    high: total((c) => c.high ?? 1),
    uncertain: chances.some((c) => c.uncertain),
  };
}

// Mid-sentence names: UNDERLYINGS capitalises "Natural gas" and "Gold" as if they started one.
const MARKET_WORDS: Partial<Record<UnderlyingId, string>> = { NGAS: "natural gas", XAU: "gold", XAG: "silver", COPPER: "copper" };
const marketWord = (id: UnderlyingId) => MARKET_WORDS[id] ?? UNDERLYINGS[id].name;

const price = (level: number) => (level >= 1000 ? formatUsdWhole(level) : formatUsd(level));
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function titleOf(risk: Risk, input: Pick<SuggestInput, "city" | "team">): string {
  switch (risk.kind) {
    case "cold-day":
    case "hot-day":
      return `A ${risk.kind === "cold-day" ? "cold" : "hot"} day${input.city ? ` in ${input.city}` : ""}`;
    case "home-loss":
      return input.team ? `A loss for ${input.team.name}` : "A loss for your team";
    case "cost-rise":
      return `Pricier ${risk.what}`;
  }
}

function weatherBody(kind: WeatherKind, input: SuggestInput): Body | string {
  const { weather: market, badDayCost: payout } = input;
  if (!market) return `There is no temperature market for ${input.city ?? "your city"} right now.`;
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
    cushion,
    chance: sumChances(picked.map((b) => yesChance(b.contract.quote))),
    eventTickers: [market.eventTicker],
    expiry: market.expiry,
  };
}

function gameBody(input: SuggestInput): Body | string {
  const { game, team, badDayCost: payout } = input;
  if (!team) return "Pick your team to see this one.";
  if (!game) return `No game for ${team.name} is listed soon.`;
  const cushion = teamLossLegs(game, team.abbr, payout);
  const [leg] = cushion.legs;
  if (!leg) return "Nobody is quoting this game yet.";

  const opponent = game.teams.find((t) => t.abbr !== team.abbr);
  const when = game.isLive ? "game on now" : formatWhen(game.startTime);
  const bought = game.teams.find((t) => t.contract.symbol === leg.symbol)?.contract;
  return {
    trigger: `Pays ${formatUsdWhole(payout)} if ${team.name} lose to ${opponent?.name ?? "the other side"} (${when}).`,
    cushion,
    chance: bought ? chanceOf(bought.quote, leg.side) : UNKNOWN,
    eventTickers: [game.eventTicker],
    expiry: game.expiry,
  };
}

function costBody(risk: CostRisk, input: SuggestInput): Body | string {
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
    risk.kind === "home-loss" ? gameBody(input) : risk.kind === "cost-rise" ? costBody(risk, input) : weatherBody(risk.kind, input);
  return typeof body === "string" ? { status: "unavailable", risk, title, reason: body } : { status: "ready", risk, title, ...body };
}
