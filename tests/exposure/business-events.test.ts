import { describe, expect, it } from "vitest";
import { priceCushion } from "@/domains/cushion/price";
import { BUSINESS_TYPES, suggest, type Risk, type SuggestInput } from "@/domains/exposure/business";
import { EVENT_TITLES, eventCover, sumChances, type EventKind } from "@/domains/exposure/business-events";
import type { Book, EventMarket } from "@/domains/markets/types";

const outcome = (label: string, bid: number | null, ask: number | null, open = true) => ({
  label,
  contract: { symbol: `SYM-${label}`, label, quote: { bid, ask, last: null }, open },
});

const market = (ticker: string, title: string, outcomes: ReturnType<typeof outcome>[]): EventMarket => ({
  kind: "event",
  eventTicker: ticker,
  title,
  category: "Economics",
  expiry: "2026-12-11T05:00:00.000Z",
  volume: 1000,
  outcomes,
});

// Live December Fed quotes: a 25 point hike is the favourite.
const fed = (favourite = "Hike 25bps") =>
  market("FED261211", "Fed decision in December?", [
    outcome("Hike 25bps", favourite === "Hike 25bps" ? 0.89 : 0.02, favourite === "Hike 25bps" ? 0.93 : 0.04),
    outcome("Hike >25bps", 0.02, 0.07),
    outcome("Fed maintains rate", favourite === "Maintain" ? 0.89 : 0.01, favourite === "Maintain" ? 0.93 : 0.06),
    outcome("Cut 25bps", null, 0.03),
  ]);
const recession = () => market("RECESSION26", "Recession this year?", [outcome("Yes", null, 0.04)]);
const stocks = () =>
  market("SPXLOW26", "How low will the S&P get this year?", [
    outcome("6,200 or below", 0.1, 0.15),
    outcome("6,300 or below", 0.1, 0.11),
    outcome("5,900 or below", 0.03, 0.08),
  ]);
const jobs = () =>
  market("UNEMP2026", "How high will unemployment get in 2026?", [
    outcome("Above 7%", 0.01, 0.03),
    outcome("Above 5%", 0.02, null),
    outcome("Above 6%", null, 0.01),
  ]);

const text = (cover: ReturnType<typeof eventCover>) => (typeof cover === "string" ? cover : null);
const covered = (cover: ReturnType<typeof eventCover>) => {
  if (typeof cover === "string") throw new Error(cover);
  return cover;
};

describe("a Fed cover", () => {
  it("pays only on a bigger hike than the market expects, since the expected one costs nearly the whole payout", () => {
    const c = covered(eventCover("fed-hike", [fed()], 300));
    expect(c.cushion.legs.map((l) => [l.symbol, l.side, l.quantity])).toEqual([["SYM-Hike >25bps", "yes", 300]]);
    expect(c.trigger).toBe("Pays $300 if the Fed's December decision is Hike >25bps (the market expects Hike 25bps).");
    expect(c.when).toBe("December decision");
    expect(c.eventTickers).toEqual(["FED261211"]);
    expect(c.expiry).toBe("2026-12-11T05:00:00.000Z");
    expect(c.roughMatch).toMatch(/not on your own loan/);
  });

  it("pays on every hike when the market expects no change, and treats them as rivals", () => {
    const c = covered(eventCover("fed-hike", [fed("Maintain")], 300));
    expect(c.cushion.legs.map((l) => l.symbol)).toEqual(["SYM-Hike 25bps", "SYM-Hike >25bps"]);
    expect(c.cushion.payoutMode).toBe("one");
    expect(c.trigger).toBe("Pays $300 if the Fed's December decision is Hike 25bps or Hike >25bps.");
    expect(c.chance.p).toBeCloseTo(0.03 + 0.045, 10);
  });

  it("has nothing to sell when no bigger hike is on offer", () => {
    const biggest = market("FED", "Fed decision in December?", [outcome("Hike >25bps", 0.9, 0.93), outcome("Cut 25bps", null, 0.03)]);
    expect(text(eventCover("fed-hike", [biggest], 300))).toBe("Nobody is selling cover against a bigger rate hike on Gemini right now.");
  });
});

describe("the other news-event covers", () => {
  it("covers a recession with YES on the one outcome", () => {
    const c = covered(eventCover("recession", [recession()], 250));
    expect(c.cushion.legs.map((l) => [l.symbol, l.side, l.quantity])).toEqual([["SYM-Yes", "yes", 250]]);
    expect(c.trigger).toBe("Pays $250 if the US is in a recession this year.");
    expect(c.chance.p).toBeCloseTo(0.02, 10);
    expect(c.chance.uncertain).toBe(true);
  });

  it("takes the shallowest stock dip, which is the likeliest to happen", () => {
    const c = covered(eventCover("stocks-fall", [stocks()], 300));
    expect(c.cushion.legs.map((l) => l.symbol)).toEqual(["SYM-6,300 or below"]);
    expect(c.trigger).toBe("Pays $300 if the S&P 500 falls to 6,300 or below at any point this year.");
  });

  it("takes the lowest jobless rate that anyone is selling", () => {
    const c = covered(eventCover("unemployment", [jobs()], 300));
    // Above 5% has no seller, so Above 6% is the lowest on offer.
    expect(c.cushion.legs.map((l) => l.symbol)).toEqual(["SYM-Above 6%"]);
    expect(c.trigger).toBe("Pays $300 if unemployment gets above 6% at any point this year.");
  });

  it("skips outcomes nobody is selling or that are closed", () => {
    const quiet = market("RECESSION26", "Recession this year?", [outcome("Yes", 0.03, null)]);
    expect(text(eventCover("recession", [quiet], 300))).toBe("Nobody is selling cover against a recession on Gemini right now.");
    const shut = market("RECESSION26", "Recession this year?", [outcome("Yes", 0.03, 0.04, false)]);
    expect(text(eventCover("recession", [shut], 300))).toBe("Nobody is selling cover against a recession on Gemini right now.");
  });

  it("says so when Gemini lists no such market", () => {
    for (const kind of Object.keys(EVENT_TITLES) as EventKind[]) {
      expect(text(eventCover(kind, [], 300))).toBe("Gemini has no open market on this right now.");
    }
  });

  it("cannot buy a payout under a cent", () => {
    expect(covered(eventCover("recession", [recession()], 0.001)).cushion.legs).toEqual([]);
  });

  it("prices against the asks in the live book", () => {
    const c = covered(eventCover("recession", [recession()], 100));
    const books: Record<string, Book> = { "SYM-Yes": { bids: [], asks: [{ price: 0.04, size: 250 }] } };
    expect(priceCushion(c.cushion, books)).toMatchObject({ cost: 4, maxPayout: 100, partial: false });
  });
});

describe("the event risks in the business presets", () => {
  const risk = (kind: EventKind): Risk => ({ kind: "event", event: kind, why: "Because." });
  const input: SuggestInput = {
    now: Date.parse("2026-11-20T02:15:00.000Z"),
    city: null,
    weather: null,
    team: null,
    game: null,
    ladders: [],
    events: [recession(), fed(), stocks(), jobs()],
    badDayCost: 300,
    monthlySpend: {},
  };

  it("turn into a titled, ready suggestion paying the bad-day amount", () => {
    const s = suggest(risk("recession"), input);
    expect(s).toMatchObject({ status: "ready", title: "A recession", when: "This year" });
    expect(s.status === "ready" && s.cushion.legs[0].quantity).toBe(300);
  });

  it("are unavailable when the events feed has no such market", () => {
    const s = suggest(risk("fed-hike"), { ...input, events: [] });
    expect(s).toMatchObject({ status: "unavailable", title: "Higher interest rates" });
  });

  it("only appear where they honestly matter, and always say the match is rough", () => {
    const withEvents = BUSINESS_TYPES.filter((b) => b.risks.some((r) => r.kind === "event")).map((b) => b.id);
    expect(withEvents).toEqual(["patio", "sports-bar", "delivery", "landscaping", "jeweler"]);
    for (const kind of Object.keys(EVENT_TITLES) as EventKind[]) {
      expect(covered(eventCover(kind, input.events, 300)).roughMatch).toBeTruthy();
    }
  });
});

describe("sumChances", () => {
  it("is unknown when no outcome has a quote, and capped at certainty", () => {
    expect(sumChances([{ p: null, low: null, high: null, uncertain: true }]).p).toBeNull();
    expect(sumChances([{ p: 0.7, low: 0.6, high: 0.8, uncertain: false }, { p: 0.6, low: 0.5, high: 0.7, uncertain: false }]).p).toBe(1);
  });
});
