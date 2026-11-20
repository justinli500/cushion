import { describe, expect, it } from "vitest";
import {
  BUSINESS_TYPES,
  amountsOf,
  businessType,
  guessAmount,
  cityOptions,
  coverDay,
  defaultThreshold,
  monthEndLadder,
  needsOf,
  pickGame,
  pickWeather,
  suggest,
  teamOptions,
  type Risk,
  type SuggestInput,
} from "@/domains/exposure/business";
import { priceCushion } from "@/domains/cushion/price";
import type { Book, Bucket, BucketMarket, Contract, Game, Ladder } from "@/domains/markets/types";

const HOUR = 3_600_000;
// 02:15 UTC on Nov 20, the evening of Nov 19 in Austin.
const NOW = Date.parse("2026-11-20T02:15:00.000Z");

const contract = (symbol: string, bid: number | null, ask: number | null, open = true): Contract => ({
  symbol,
  label: symbol,
  quote: { bid, ask, last: null },
  open,
});

const bucket = (lo: number | null, hi: number | null, bid: number | null, ask: number | null, open = true): Bucket => ({
  lo,
  hi,
  contract: contract(`T${lo ?? "L"}-${hi ?? "H"}`, bid, ask, open),
});

const market = (city: string, expiry: string, date: string, buckets: Bucket[]): BucketMarket => ({
  kind: "buckets", unit: "F",
  eventTicker: `WX-${city}-${expiry}`,
  title: `Highest temperature in ${city} on ${date}, 2026?`,
  city,
  expiry,
  buckets,
});

// Live Austin quotes for Nov 20: the day's high most likely finishes at 76 to 77.
const austinTomorrow = () =>
  market("Austin", "2026-11-21T04:59:59.000Z", "November 20", [
    bucket(null, 73, 0.02, 0.04),
    bucket(74, 75, 0.33, 0.37),
    bucket(76, 77, 0.53, 0.56),
    bucket(78, 79, 0.06, 0.08),
    bucket(80, 81, null, 0.01),
    bucket(82, null, null, 0.01),
  ]);

const ladder = (
  underlying: Ladder["underlying"],
  expiry: string,
  rungs: [strike: number, bid: number | null, ask: number | null, open?: boolean][],
  horizon: Ladder["horizon"] = "dated",
): Ladder => ({
  kind: "ladder",
  eventTicker: `${underlying}-${expiry}`,
  title: `${underlying} price`,
  underlying,
  expiry,
  horizon,
  rungs: rungs.map(([strike, bid, ask, open]) => ({ strike, contract: contract(`${underlying}${strike}`, bid, ask, open) })),
});

const brentMonthEnd = () =>
  ladder("BRENT", "2026-11-30T22:00:00.000Z", [
    [87, 0.66, 0.7],
    [90, 0.48, 0.52],
    [93, 0.32, 0.36],
    [96, 0.17, 0.21],
  ]);

const game = (): Game => ({
  kind: "game",
  gameId: "g1",
  eventTicker: "NFL-IND-HOU",
  league: "NFL",
  title: "Indianapolis vs Houston",
  startTime: "2026-11-22T18:00:00.000Z",
  expiry: "2026-11-24T18:00:00.000Z",
  isLive: false,
  teams: [
    { abbr: "HOU", name: "Houston Texans", side: "home", contract: contract("HOU", 0.93, 0.95) },
    { abbr: "IND", name: "Indianapolis Colts", side: "away", contract: contract("IND", 0.04, 0.06) },
  ],
  hasDraw: false,
  volume: 0,
});

const input = (over: Partial<SuggestInput> = {}): SuggestInput => ({
  now: NOW,
  city: "Austin",
  weather: austinTomorrow(),
  game: null,
  team: null,
  ladders: [],
  events: [],
  badDayCost: 300,
  monthlySpend: {},
  ...over,
});

const cold: Risk = { kind: "cold-day", why: "Cold days keep people off the patio." };
const hot: Risk = { kind: "hot-day", why: "Scorching days drive people indoors." };
const fuel: Risk = { kind: "cost-rise", underlying: "BRENT", what: "fuel", why: "Fuel adds up." };

describe("the preset table", () => {
  it("covers the business types the owner asked for, each with a plain reason per risk", () => {
    const ids = BUSINESS_TYPES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["food-truck", "ice-cream", "patio", "sports-bar", "delivery", "landscaping", "jeweler", "electrician", "coffee-cart", "car-wash"]) {
      expect(ids).toContain(id);
    }
    for (const b of BUSINESS_TYPES) {
      expect(b.risks.length).toBeGreaterThan(0);
      for (const r of b.risks) expect(r.why).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("maps costs to the commodities Gemini lists a month-end ladder for", () => {
    const costs = BUSINESS_TYPES.flatMap((b) => needsOf(b).costs);
    expect(new Set(costs.map((c) => c.underlying))).toEqual(new Set(["BRENT", "NGAS", "XAU", "XAG", "COPPER"]));
  });

  it("asks only what the business's risks need", () => {
    const need = (id: string) => needsOf(businessType(id)!);
    expect(need("patio")).toMatchObject({ city: true, team: false, badDay: true, events: true });
    expect(need("sports-bar")).toMatchObject({ city: false, team: true, badDay: true });
    // Its only non-cost risk is a news event, which pays a bad day's worth.
    expect(need("jeweler")).toMatchObject({ city: false, team: false, badDay: true, events: true });
    expect(need("jeweler").costs.map((c) => c.underlying)).toEqual(["XAU", "XAG"]);
    expect(need("electrician")).toMatchObject({ city: false, team: false, badDay: false, events: false });
  });

  it("offers one amount for a bad day and one per monthly bill, each with a starting guess", () => {
    expect(amountsOf(needsOf(businessType("food-truck")!)).map((a) => a.key)).toEqual(["badDay", "BRENT"]);
    expect(amountsOf(needsOf(businessType("electrician")!)).map((a) => a.key)).toEqual(["COPPER", "BRENT"]);
    expect(amountsOf(needsOf(businessType("coffee-cart")!)).map((a) => a.key)).toEqual(["badDay"]);
    expect(guessAmount("badDay")).toBeGreaterThan(0);
    expect(guessAmount("BRENT")).toBeGreaterThan(0);
  });

  it("gives every business type a plain name for 'Suggested for ...'", () => {
    for (const b of BUSINESS_TYPES) expect(b.forWhom).toMatch(/^an? [a-z ]+$/);
  });

  it("returns nothing for an id it does not know", () => {
    expect(businessType("unicorn")).toBeNull();
    expect(businessType(null)).toBeNull();
  });
});

describe("defaultThreshold", () => {
  it("takes the lower bound of the most likely bucket for a cold day and the upper bound for a hot one", () => {
    expect(defaultThreshold(austinTomorrow(), "cold-day")).toBe(76);
    expect(defaultThreshold(austinTomorrow(), "hot-day")).toBe(77);
  });

  it("steps one degree inside an open tail when the tail is the most likely bucket", () => {
    const low = market("A", "2026-11-21T04:59:59.000Z", "November 20", [bucket(null, 40, 0.7, 0.74), bucket(41, null, 0.2, 0.24)]);
    expect(defaultThreshold(low, "cold-day")).toBe(41);
    const high = market("A", "2026-11-21T04:59:59.000Z", "November 20", [bucket(null, 40, 0.1, 0.14), bucket(41, null, 0.8, 0.84)]);
    expect(defaultThreshold(high, "hot-day")).toBe(40);
  });

  it("ignores closed buckets and returns null when nothing is quoted", () => {
    const m = market("A", "2026-11-21T04:59:59.000Z", "November 20", [bucket(70, 71, 0.9, 0.92, false), bucket(72, 73, 0.05, 0.07)]);
    expect(defaultThreshold(m, "cold-day")).toBe(72);
    const blank = market("A", "2026-11-21T04:59:59.000Z", "November 20", [bucket(70, 71, null, null)]);
    expect(defaultThreshold(blank, "cold-day")).toBeNull();
  });
});

describe("picking the right market", () => {
  const today = market("Austin", "2026-11-20T04:59:59.000Z", "November 19", [bucket(70, 71, 0.9, 0.92)]);
  const gone = market("Austin", "2026-11-19T04:59:59.000Z", "November 18", [bucket(70, 71, 0.9, 0.92)]);
  const tomorrow = austinTomorrow();
  const dallas = market("Dallas", "2026-11-21T04:59:59.000Z", "November 20", [bucket(70, 71, 0.9, 0.92)]);

  it("takes the nearest market that is not expired", () => {
    expect(pickWeather([gone, tomorrow, dallas], "Austin", NOW)).toBe(tomorrow);
  });

  it("skips a market about to expire, since the day's high is already known", () => {
    expect(today.expiry < new Date(NOW + 3 * HOUR).toISOString()).toBe(true);
    expect(pickWeather([today, tomorrow], "Austin", NOW)).toBe(tomorrow);
    expect(pickWeather([today], "Austin", NOW)).toBe(today);
  });

  it("finds nothing for a city with no market", () => {
    expect(pickWeather([tomorrow], "Nome", NOW)).toBeNull();
    expect(pickWeather([gone], "Austin", NOW)).toBeNull();
  });

  it("names the day the market covers", () => {
    expect(coverDay(today, NOW)).toBe("today (November 19)");
    expect(coverDay(tomorrow, NOW)).toBe("tomorrow (November 20)");
    const later = market("Austin", "2026-11-23T04:59:59.000Z", "November 22", []);
    expect(coverDay(later, NOW)).toBe("on November 22");
  });

  it("takes a team's next unexpired game, matching league as well as abbreviation", () => {
    const soon = { ...game(), gameId: "soon", startTime: "2026-11-21T18:00:00.000Z" };
    const nba = { ...game(), gameId: "nba", league: "NBA", startTime: "2026-11-20T18:00:00.000Z" };
    const done = { ...game(), gameId: "done", expiry: "2026-11-19T00:00:00.000Z" };
    const team = { league: "NFL", abbr: "HOU", name: "Houston Texans" };
    expect(pickGame([game(), soon, nba, done], team, NOW)?.gameId).toBe("soon");
    expect(pickGame([nba], team, NOW)).toBeNull();
  });

  it("takes the latest dated ladder, which is the month-end one, and never an intraday one", () => {
    const daily = ladder("BRENT", "2026-11-20T22:00:00.000Z", [[90, 0.5, 0.52]]);
    const intraday = ladder("BRENT", "2026-12-20T22:00:00.000Z", [[90, 0.5, 0.52]], "intraday");
    const wti = ladder("WTI", "2026-11-30T22:00:00.000Z", [[70, 0.5, 0.52]]);
    const monthEnd = brentMonthEnd();
    expect(monthEndLadder([daily, intraday, wti, monthEnd], "BRENT", NOW)).toBe(monthEnd);
    expect(monthEndLadder([daily, intraday], "NGAS", NOW)).toBeNull();
    expect(monthEndLadder([ladder("BRENT", "2026-11-19T22:00:00.000Z", [[90, 0.5, 0.52]])], "BRENT", NOW)).toBeNull();
  });

  it("lists each city once and each team once, pro leagues first", () => {
    expect(cityOptions([tomorrow, today, dallas])).toEqual(["Austin", "Dallas"]);
    const college = { ...game(), league: "NCAAF", teams: [{ ...game().teams[0], abbr: "HOU", name: "Houston Cougars" }, game().teams[1]] };
    const teams = teamOptions([college, game(), game()]);
    expect(teams.map((t) => `${t.league}/${t.abbr}`)).toEqual(["NFL/HOU", "NFL/IND", "NCAAF/HOU", "NCAAF/IND"]);
  });
});

describe("a cold or hot day cushion", () => {
  it("pays $300 on every cooler bucket and prices at the sum of their asks", () => {
    const s = suggest(cold, input());
    if (s.status !== "ready") throw new Error(s.reason);
    expect(s.cushion.payoutMode).toBe("one");
    expect(s.cushion.legs.map((l) => [l.symbol, l.side, l.quantity])).toEqual([
      ["TL-73", "yes", 300],
      ["T74-75", "yes", 300],
    ]);
    expect(s.trigger).toBe("Pays $300 if Austin's high stays under 76°F tomorrow (November 20).");
    expect(s.title).toBe("A cold day in Austin");
    expect(s.eventTickers).toEqual([austinTomorrow().eventTicker]);

    const books: Record<string, Book> = {
      "TL-73": { bids: [], asks: [{ price: 0.04, size: 1000 }] },
      "T74-75": { bids: [], asks: [{ price: 0.37, size: 1000 }] },
    };
    const quote = priceCushion(s.cushion, books);
    // 300 x $0.04 + 300 x $0.37
    expect(quote.cost).toBe(123);
    expect(quote.maxPayout).toBe(300);
    expect(quote.partial).toBe(false);
  });

  it("gives the chance as the sum of the buckets' chances", () => {
    const s = suggest(cold, input());
    if (s.status !== "ready") throw new Error(s.reason);
    expect(s.chance.p).toBeCloseTo(0.03 + 0.35, 10);
    expect(s.chance.low).toBeCloseTo(0.02 + 0.33, 10);
    expect(s.chance.high).toBeCloseTo(0.04 + 0.37, 10);
    expect(s.chance.uncertain).toBe(false);
  });

  it("marks the chance uncertain when any bucket's quote is one-sided", () => {
    const s = suggest(hot, input());
    if (s.status !== "ready") throw new Error(s.reason);
    expect(s.cushion.legs.map((l) => l.symbol)).toEqual(["T78-79", "T80-81", "T82-H"]);
    expect(s.trigger).toBe("Pays $300 if Austin's high climbs above 77°F tomorrow (November 20).");
    // 0.07 + 0.005 + 0.005 from the midpoint of each bucket, with the lone asks capped at one cent
    expect(s.chance.p).toBeCloseTo(0.08, 10);
    expect(s.chance.low).toBeCloseTo(0.06, 10);
    expect(s.chance.high).toBeCloseTo(0.1, 10);
    expect(s.chance.uncertain).toBe(true);
  });

  it("asks for a city before it looks for a market", () => {
    const s = suggest(cold, input({ weather: null, city: null }));
    expect(s).toMatchObject({ status: "unavailable", title: "A cold day" });
    expect(s.status === "unavailable" && s.reason).toBe("Choose your city to see this one.");
  });

  it("says when it applies", () => {
    const s = suggest(cold, input());
    expect(s.status === "ready" && s.when).toBe("Tomorrow (November 20)");
  });

  it("is unavailable, with the city named, when the city has no market", () => {
    const s = suggest(cold, input({ weather: null, city: "Nome" }));
    expect(s).toMatchObject({ status: "unavailable", title: "A cold day in Nome" });
    expect(s.status === "unavailable" && s.reason).toBe("There is no temperature market for Nome right now.");
  });

  it("is unavailable when nothing is quoted or no cooler bucket can be bought", () => {
    const blank = market("Austin", "2026-11-21T04:59:59.000Z", "November 20", [bucket(70, 71, null, null)]);
    expect(suggest(cold, input({ weather: blank })).status).toBe("unavailable");
    const closed = market("Austin", "2026-11-21T04:59:59.000Z", "November 20", [bucket(70, 71, 0.1, 0.12, false), bucket(72, 73, 0.8, 0.82)]);
    const s = suggest(cold, input({ weather: closed }));
    expect(s.status === "unavailable" && s.reason).toBe("The market lists no cooler range to cover.");
  });
});

describe("a team loss cushion", () => {
  const colts = { league: "NFL", abbr: "IND", name: "Indianapolis Colts" };

  it("buys the cheaper side of the loss and gives the loss chance", () => {
    const s = suggest({ kind: "home-loss", why: "The crowd leaves early." }, input({ game: game(), team: colts, badDayCost: 400 }));
    if (s.status !== "ready") throw new Error(s.reason);
    // Houston YES at 0.95 beats Indianapolis NO at 1 - 0.04 = 0.96.
    expect(s.cushion.legs.map((l) => [l.symbol, l.side, l.quantity])).toEqual([["HOU", "yes", 400]]);
    expect(s.trigger).toMatch(/^Pays \$400 if Indianapolis Colts lose to Houston Texans \(.+\)\.$/);
    expect(s.title).toBe("A loss for Indianapolis Colts");
    expect(s.chance.p).toBeCloseTo(0.94, 10);
    expect(s.eventTickers).toEqual(["NFL-IND-HOU"]);
  });

  it("is unavailable when the team has no game listed", () => {
    const s = suggest({ kind: "home-loss", why: "x." }, input({ game: null, team: colts }));
    expect(s.status === "unavailable" && s.reason).toBe("No game for Indianapolis Colts is listed soon.");
  });

  it("is unavailable when neither side of the game is open to buy", () => {
    const shut = game();
    shut.teams.forEach((t) => (t.contract.open = false));
    expect(suggest({ kind: "home-loss", why: "x." }, input({ game: shut, team: colts })).status).toBe("unavailable");
  });
});

describe("a cost cushion", () => {
  it("starts at the market's own price and sizes each step to monthly spend over that price", () => {
    const s = suggest(fuel, input({ ladders: [brentMonthEnd()], monthlySpend: { BRENT: 450 } }));
    if (s.status !== "ready") throw new Error(s.reason);
    // The even-odds level is $90, so $450 a month is $5 for each $1 the price rises, $15 per $3 rung.
    expect(s.cushion.legs.map((l) => [l.strike, l.side, l.quantity])).toEqual([
      [90, "yes", 15],
      [93, "yes", 15],
      [96, "yes", 15],
    ]);
    expect(s.title).toBe("Pricier fuel");
    expect(s.trigger).toBe("Pays as Brent oil climbs past $90.00 by Nov 30, up to $45 at $96.00.");
    expect(s.chance.p).toBeCloseTo(0.5, 10);
    expect(s.chance).toMatchObject({ low: null, high: null, uncertain: false });
    expect(s.expiry).toBe("2026-11-30T22:00:00.000Z");
    expect(s.when).toBe("By Nov 30");
  });

  it("names the first rung it pays at when the even-odds start falls between rungs", () => {
    const between = ladder("BRENT", "2026-11-30T22:00:00.000Z", [
      [87, 0.66, 0.7],
      [90, 0.52, 0.56],
      [93, 0.42, 0.46],
      [96, 0.2, 0.24],
    ]);
    const s = suggest(fuel, input({ ladders: [between], monthlySpend: { BRENT: 450 } }));
    if (s.status !== "ready") throw new Error(s.reason);
    // Even odds sit at 91.2, so the first rung that pays is 93.
    expect(s.cushion.legs.map((l) => l.strike)).toEqual([93, 96]);
    expect(s.trigger).toMatch(/^Pays as Brent oil climbs past \$93\.00 by Nov 30, up to \$.+ at \$96\.00\.$/);
  });

  it("keeps the rung it starts on when the interpolated start lands a hair past it", () => {
    // Interpolating to the 52.68 rung gives 52.68000000000001 in floating point.
    const gas = ladder("NGAS", "2026-11-30T22:00:00.000Z", [
      [27.68, 0.688, 0.708],
      [52.68, 0.49, 0.51],
      [60.18, 0.2, 0.22],
    ]);
    const s = suggest({ ...fuel, underlying: "NGAS" }, input({ ladders: [gas], monthlySpend: { NGAS: 5268 } }));
    if (s.status !== "ready") throw new Error(s.reason);
    expect(s.cushion.legs.map((l) => l.strike)).toEqual([52.68, 60.18]);
  });

  it("prices against the asks of each step", () => {
    const s = suggest(fuel, input({ ladders: [brentMonthEnd()], monthlySpend: { BRENT: 450 } }));
    if (s.status !== "ready") throw new Error(s.reason);
    const books: Record<string, Book> = {
      BRENT90: { bids: [], asks: [{ price: 0.52, size: 100 }] },
      BRENT93: { bids: [], asks: [{ price: 0.36, size: 100 }] },
      BRENT96: { bids: [], asks: [{ price: 0.21, size: 100 }] },
    };
    // 15 x (0.52 + 0.36 + 0.21)
    expect(priceCushion(s.cushion, books)).toMatchObject({ cost: 16.35, maxPayout: 45, partial: false });
  });

  it("shows a thin book as a cushion that cannot fill, not as a different cushion", () => {
    const s = suggest(fuel, input({ ladders: [brentMonthEnd()], monthlySpend: { BRENT: 450 } }));
    if (s.status !== "ready") throw new Error(s.reason);
    expect(priceCushion(s.cushion, {})).toMatchObject({ cost: 0, maxPayout: 0, partial: true });
  });

  it("is unavailable when no month-end ladder is open, nothing is quoted, or nothing is on offer past the start", () => {
    const risk = (input_: Partial<SuggestInput>) => suggest(fuel, input({ monthlySpend: { BRENT: 450 }, ...input_ }));
    const none = risk({ ladders: [] });
    expect(none.status === "unavailable" && none.reason).toBe("No month-end market for Brent oil is open right now.");
    const unquoted = ladder("BRENT", "2026-11-30T22:00:00.000Z", [[90, null, null]]);
    expect(risk({ ladders: [unquoted] }).status).toBe("unavailable");
    const shut = ladder("BRENT", "2026-11-30T22:00:00.000Z", [[87, 0.66, 0.7], [90, 0.48, 0.52, false]]);
    expect(risk({ ladders: [shut] }).status).toBe("unavailable");
  });
});
