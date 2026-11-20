import { describe, expect, it } from "vitest";
import { billsCard, fantasyCard, gameCard, likeliestBucket, marketCard, pickGame, portfolioCard, weatherCard } from "@/domains/feed/cards";
import type { BucketMarket, Contract, Game, Ladder } from "@/domains/markets/types";

const contract = (symbol: string, bid: number | null, ask: number | null): Contract => ({ symbol, label: symbol, quote: { bid, ask, last: null }, open: true });

const ladder = (underlying: Ladder["underlying"], expiry: string, rungs: [number, number][]): Ladder => ({
  kind: "ladder",
  eventTicker: `${underlying}-${expiry}`,
  title: `${underlying} price on a day`,
  underlying,
  expiry,
  horizon: "dated",
  rungs: rungs.map(([strike, p]) => ({ strike, contract: contract(`K${strike}`, p - 0.01, p + 0.01) })),
});

// Even chance at 100, 80% at 98, 20% at 102, 10% at 103.
const today = ladder("BTC", "2026-11-20T22:00:00.000Z", [[98, 0.8], [100, 0.5], [102, 0.2], [103, 0.1]]);
const monthEnd = ladder("BTC", "2026-11-30T22:00:00.000Z", [[90, 0.9], [110, 0.1]]);
const oil = ladder("BRENT", "2026-11-20T22:00:00.000Z", [[98, 0.8], [100, 0.5], [102, 0.2], [103, 0.1]]);

describe("portfolioCard", () => {
  it("uses today's ladder and prices a 2% move against the holding", () => {
    const card = portfolioCard({ underlying: "BTC", dollars: 5000, holdings: [] }, [monthEnd, today])!;
    expect(card.headline).toBe("$5,000 riding on Bitcoin");
    expect(card.stat?.value).toBe("20%");
    expect(card.facts).toContain("about $100");
    expect(card.href).toBe("/portfolio");
  });

  it("looks at a jump for something that is hurt when the price rises", () => {
    const card = portfolioCard({ underlying: "BTC", dollars: -5000, holdings: [] }, [today])!;
    expect(card.stat).toEqual({ value: "20%", label: expect.stringContaining("2% jump") });
  });

  it("has nothing to say without an open ladder", () => {
    expect(portfolioCard({ underlying: "ETH", dollars: 5000, holdings: [] }, [today])).toBeNull();
  });
});

describe("marketCard and billsCard", () => {
  it("states the expected close for anyone", () => {
    expect(marketCard([today], "BTC")!.headline).toBe("Bitcoin is expected to close near $100.00");
  });

  it("turns a 3% oil jump into dollars at the pump", () => {
    const card = billsCard(60, [oil])!;
    expect(card.stat?.value).toBe("10%");
    // 60 gallons x $0.024 per $1 a barrel x a $3 move is about $4.
    expect(card.facts).toContain("roughly $4 more");
  });
});

const game = (id: string, volume: number, isLive: boolean, homeBid: number): Game => ({
  kind: "game",
  gameId: id,
  eventTicker: `NFL-${id}`,
  league: "NFL",
  title: "Indianapolis vs Houston",
  startTime: "2026-11-20T01:15:00.000Z",
  expiry: "2026-11-21T13:15:00.000Z",
  isLive,
  hasDraw: false,
  volume,
  teams: [
    { abbr: "HOU", name: "Houston Texans", side: "home", contract: contract("HOU", homeBid, homeBid + 0.02) },
    { abbr: "IND", name: "Indianapolis Colts", side: "away", contract: contract("IND", 1 - homeBid - 0.03, 1 - homeBid) },
  ],
});

describe("games", () => {
  const quiet = game("quiet", 100, true, 0.6);
  const busy = game("busy", 900, true, 0.6);
  const later = game("later", 5000, false, 0.6);

  it("prefers the person's team, then the most-traded live game", () => {
    expect(pickGame([quiet, busy, later], null)?.gameId).toBe("busy");
    expect(pickGame([later], null)?.gameId).toBe("later");
    expect(pickGame([busy, quiet], { league: "NFL", abbr: "IND", name: "Indianapolis Colts" })?.gameId).toBe("busy");
    expect(pickGame([], null)).toBeNull();
  });

  it("speaks about the favorite unless the person has a team in the game", () => {
    const neutral = gameCard(busy, null)!;
    expect(neutral.headline).toBe("Indianapolis Colts at Houston Texans");
    expect(neutral.stat).toEqual({ value: "61%", label: "chance the Texans win" });

    const fan = gameCard(busy, { league: "NFL", abbr: "IND", name: "Indianapolis Colts" })!;
    expect(fan.stat?.label).toBe("chance the Colts win");
    expect(fan.action).toBe("Cushion a loss");
    expect(fan.href).toBe("/games/busy");
  });
});

describe("weatherCard", () => {
  const market: BucketMarket = {
    kind: "buckets",
    eventTicker: "WX",
    title: "Highest temperature in Austin on a day",
    city: "Austin",
    expiry: "2026-11-21T04:59:59.000Z",
    buckets: [
      { lo: null, hi: 73, contract: contract("LO73", 0.02, 0.04) },
      { lo: 74, hi: 75, contract: contract("74TO75", 0.34, 0.38) },
      { lo: 76, hi: 77, contract: contract("76TO77", 0.5, 0.56) },
      { lo: 78, hi: null, contract: contract("HI78", 0.06, 0.08) },
    ],
  };

  it("names the likeliest high and the chance of a colder day", () => {
    expect(likeliestBucket(market)?.bucket.lo).toBe(76);
    const card = weatherCard("Austin", [market])!;
    expect(card.headline).toBe("Austin's high is most likely 76 to 77°F");
    expect(card.stat).toEqual({ value: "39%", label: "chance it stays under 76°F" });
  });

  it("has nothing for a city without a market", () => {
    expect(weatherCard("Reno", [market])).toBeNull();
  });
});

describe("fantasyCard", () => {
  it("picks the line the market thinks is about one in three to miss", () => {
    const card = fantasyCard({
      player: "Jonathan Taylor",
      gameTitle: "Indianapolis vs Houston",
      startTime: "2026-11-20T01:15:00.000Z",
      stats: [
        {
          label: "Rushing yards",
          lines: [
            { line: 39.5, contract: contract("T40", 0.84, 0.86) },
            { line: 59.5, contract: contract("T60", 0.63, 0.65) },
            { line: 79.5, contract: contract("T80", 0.38, 0.4) },
          ],
        },
      ],
    })!;
    expect(card.stat).toEqual({ value: "36%", label: "chance of under 60 rushing yards" });
  });
});
