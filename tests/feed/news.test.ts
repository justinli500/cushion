import { describe, expect, it } from "vitest";
import { dayMove, eventItem, gameItem, hasShape, leadingOutcome, pickHero, PAYOUT, relatedLink, sidePrices, tradeCopy, tradeCushion, upcoming } from "@/domains/feed/news";
import type { Candle, Contract, EventMarket, Game } from "@/domains/markets/types";

const contract = (symbol: string, bid: number | null, ask: number | null, label = symbol): Contract => ({ symbol, label, quote: { bid, ask, last: null }, open: true });

const market = (ticker: string, category: string, expiry: string, outcomes: [string, number | null, number | null][], volume = 1000): EventMarket => ({
  kind: "event",
  eventTicker: ticker,
  title: `${ticker}?`,
  category,
  expiry,
  volume,
  outcomes: outcomes.map(([label, bid, ask]) => ({ label, contract: contract(`${ticker}-${label}`, bid, ask, label) })),
});

const NOW = Date.parse("2026-11-20T12:00:00Z");
const HOUR = 3_600_000;

const fed = market("FED", "Economics", "2026-12-11T05:00:00Z", [["Cut 25bps", 0.02, 0.04], ["Hold", 0.89, 0.93], ["Hike", 0.03, 0.05]]);
const recession = market("REC", "Economics", "2027-02-01T05:00:00Z", [["Yes", null, 0.04]]);

describe("event items", () => {
  it("leads with the most likely outcome and says it is one of several", () => {
    expect(leadingOutcome(fed)?.label).toBe("Hold");
    const item = eventItem(fed)!;
    expect(item.question).toBe("Leading outcome of 3: Hold");
    expect(item.label).toBe("Hold");
    expect(item.contract.symbol).toBe("FED-Hold");
    expect(item.eyebrow).toBe("Economy");
  });

  it("does not dress a single yes/no market up as a choice", () => {
    const item = eventItem(recession)!;
    expect(item.question).toBeNull();
    expect(item.label).toBeNull();
  });

  it("skips categories it has no filter for", () => {
    expect(eventItem(market("X", "Weather", "2026-12-01T00:00:00Z", [["Yes", 0.4, 0.5]]))).toBeNull();
  });

  it("prices each side at what it costs to buy", () => {
    expect(sidePrices(contract("A", 0.89, 0.93))).toEqual({ yes: 0.93, no: expect.closeTo(0.11) });
    expect(sidePrices(contract("A", null, 0.04))).toEqual({ yes: 0.04, no: null });
  });
});

describe("the cushion behind Yes and No", () => {
  it("is a fixed payout of contracts on the pressed side of the shown outcome", () => {
    const item = eventItem(fed)!;
    expect(tradeCushion(item, "no")).toEqual({ legs: [{ symbol: "FED-Hold", side: "no", quantity: PAYOUT, label: "Hold" }], payoutMode: "sum" });
    const copy = tradeCopy(item, "yes");
    expect(copy.title).toBe("FED? · Hold · Yes");
    expect(copy.detail).toBe('Pays $20 if "Hold" resolves Yes on "FED?".');
    expect(tradeCopy(eventItem(recession)!, "no").detail).toBe('Pays $20 if "REC?" resolves No.');
  });

  it("is booked under the games section for a game and portfolio for news", () => {
    expect(eventItem(fed)!.section).toBe("portfolio");
  });
});

const candles = (closes: number[], endsAt: number): Candle[] => closes.map((close, i) => ({ time: endsAt - (closes.length - 1 - i) * HOUR, close, volume: 0 }));

describe("dayMove", () => {
  it("measures the last price against the one a day ago", () => {
    const move = dayMove(candles([0.4, ...Array(23).fill(0.45), 0.5], NOW), NOW)!;
    expect(move.from).toBe(0.4);
    expect(move.to).toBe(0.5);
    expect(move.change).toBe(10);
    expect(move.points[0].t).toBe(NOW - 24 * HOUR);
    expect(hasShape(move)).toBe(true);
  });

  it("has no move for a market too young to have a price from a day ago, or with no candles", () => {
    expect(dayMove(candles([0.4, 0.5], NOW), NOW)).toBeNull();
    expect(dayMove([], NOW)).toBeNull();
  });

  it("is flat, and not worth drawing, when the price never moved", () => {
    const move = dayMove(candles(Array(30).fill(0.04), NOW), NOW)!;
    expect(move.change).toBe(0);
    expect(hasShape(move)).toBe(false);
  });
});

describe("pickHero", () => {
  const items = [eventItem(fed)!, eventItem(recession)!];
  const move = (change: number) => ({ from: 0.5, to: 0.5 + change / 100, change, points: [] });

  it("takes the biggest mover, up or down", () => {
    const hero = pickHero(items, { "FED-Hold": move(3), "REC-Yes": move(-9) })!;
    expect(hero.item.id).toBe("event-REC");
    expect(hero.moving).toBe(true);
  });

  it("falls back to the most traded when nothing moved, and says so", () => {
    const hero = pickHero(items, { "FED-Hold": move(0), "REC-Yes": null })!;
    expect(hero.item.id).toBe("event-FED");
    expect(hero.moving).toBe(false);
    expect(hero.move?.change).toBe(0);
  });

  it("has no hero without markets", () => {
    expect(pickHero([], {})).toBeNull();
  });
});

const game = (id: string, start: string, volume: number, isLive = false): Game => ({
  kind: "game",
  gameId: id,
  eventTicker: `NFL-${id}`,
  league: "NFL",
  title: "Chicago at Detroit",
  startTime: start,
  expiry: "2026-11-22T00:00:00Z",
  isLive,
  hasDraw: false,
  volume,
  teams: [
    { abbr: "CHI", name: "Chicago Bears", side: "away", contract: contract("CHI", 0.3, 0.32, "Chicago") },
    { abbr: "DET", name: "Detroit Lions", side: "home", contract: contract("DET", 0.66, 0.68, "Detroit") },
  ],
});

describe("game items", () => {
  it("speaks about the favorite and links to the game", () => {
    const item = gameItem(game("g1", "2026-11-20T18:00:00Z", 500))!;
    expect(item.headline).toBe("Chicago Bears at Detroit Lions");
    expect(item.question).toBe("Will the Lions win?");
    expect(item.contract.symbol).toBe("DET");
    expect(item.href).toBe("/games/g1");
    expect(item.section).toBe("games");
  });
});

describe("upcoming", () => {
  const rows = upcoming(
    [fed, recession, market("MN", "Politics", "2026-11-21T05:00:00Z", [["Yes", 0.4, 0.5]])],
    [game("late", "2026-11-23T18:00:00Z", 900), game("soon", "2026-11-20T18:00:00Z", 500), game("quiet", "2026-11-20T15:00:00Z", 0), game("live", "2026-11-20T10:00:00Z", 100, true)],
    NOW,
  );

  it("lists real dated things soonest first, from games and from markets about to resolve", () => {
    expect(rows.map((r) => r.id)).toEqual(["game-live", "game-soon", "event-MN", "event-FED"]);
    expect(rows.map((r) => r.at)).toEqual([...rows.map((r) => r.at)].sort((a, b) => a - b));
  });

  it("leaves out games with no trading, games too far off, and markets resolving beyond the window", () => {
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain("game-quiet");
    expect(ids).not.toContain("game-late");
    expect(ids).not.toContain("event-REC");
  });

  it("describes a game and a multi-outcome market honestly", () => {
    expect(rows[0].detail).toBe("Lions to win · Yes 68¢ · watch live");
    expect(rows[3].detail).toBe("Leading: Hold · Yes 93¢");
    expect(rows[0].href).toBe("/games/live");
    expect(rows[3].href).toBeNull();
  });
});

describe("relatedLink", () => {
  it("points an economy market at the portfolio, and nothing else", () => {
    expect(relatedLink(eventItem(fed)!, 0)).toEqual({ href: "/portfolio", text: "Add what you hold" });
    expect(relatedLink(eventItem(fed)!, 2)?.text).toBe("See what this means for your holdings");
    expect(relatedLink(eventItem(market("P", "Politics", "2026-12-01T00:00:00Z", [["Yes", 0.1, 0.2]]))!, 2)).toBeNull();
  });
});
