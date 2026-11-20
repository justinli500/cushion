import { teamLossLegs } from "@/domains/cushion/legs";
import { chanceOf, impliedSpot, yesChance } from "@/domains/cushion/probability";
import type { BucketMarket, Contract, Game, Ladder, PlayerProp, Side } from "@/domains/markets/types";
import { lossCopy, teamNickname } from "@/domains/scores/names";
import { formatPrice, formatWhen } from "@/lib/format";

/** One priced example for the landing page: a stake in plain words and what cushioning it costs right now. */
export interface StakeQuote {
  id: "team" | "portfolio" | "heat" | "fantasy" | "biz";
  label: string;
  stake: string;
  risk: string;
  trigger: string;
  cost: number;
  payout: number;
  /** What the payout is measured against: "$40 of a $40 night out". */
  coveredLabel: string;
  coveredOf: number;
  /** The market behind it, as a question. */
  market: string;
  /** The position behind it: "40 × No at 30¢". */
  fill: string;
  /** Where in the app this stake is cushioned for real. */
  href: string;
}

/** What one contract of a side costs at the top of the book, or null when nobody is offering it. */
const askFor = (contract: Contract, side: Side): number | null => (side === "yes" ? contract.quote.ask : contract.quote.bid == null ? null : 1 - contract.quote.bid);
const cents = (price: number) => `${Math.round(price * 100)}¢`;
const dollars = (amount: number) => Math.round(amount * 100) / 100;
const usable = (price: number | null): price is number => price != null && price > 0.02 && price < 0.98;

const PRO = new Set(["NFL", "NBA", "NHL"]);

/**
 * A loss by the home team of a game worth quoting: one still to come, in a league people follow,
 * that the market thinks could go either way. Failing that, the most-traded game quoted on both sides.
 */
export function teamQuote(games: Game[]): StakeQuote | null {
  const quoted = [...games].sort((a, b) => b.volume - a.volume).filter((g) => g.teams.every((t) => usable(yesChance(t.contract.quote).p)));
  const close = (g: Game) => {
    const home = yesChance(g.teams.find((t) => t.side === "home")!.contract.quote).p ?? 0;
    return !g.isLive && PRO.has(g.league) && home >= 0.35 && home <= 0.8;
  };
  const game = quoted.find(close) ?? quoted[0];
  const team = game?.teams.find((t) => t.side === "home");
  if (!game || !team) return null;
  const payout = 40;
  const [leg] = teamLossLegs(game, team.abbr, payout).legs;
  const contract = game.teams.find((t) => t.contract.symbol === leg?.symbol)?.contract;
  const price = leg && contract ? askFor(contract, leg.side) : null;
  if (!leg || !usable(price)) return null;
  const mine = teamNickname(game, team);
  // "the Texans lose to the Colts" for a pro game, "Kansas loses to Houston" for a college one.
  const when = lossCopy(game, team.abbr, payout).detail.replace(/^Pays \$\d+ if /, "").replace(/\.$/, "");
  return {
    id: "team",
    label: "My team",
    stake: `${mine}, ${game.isLive ? "playing now" : formatWhen(game.startTime)}`,
    risk: "A loss ruins the evening. Let it at least buy dinner.",
    trigger: when.charAt(0).toUpperCase() + when.slice(1),
    cost: dollars(payout * price),
    payout,
    coveredLabel: "a $40 night out",
    coveredOf: payout,
    market: `${leg.label} win?`,
    fill: `${payout} × ${leg.side === "yes" ? "Yes" : "No"} at ${cents(price)}`,
    href: `/games/${game.gameId}`,
  };
}

const soonest = (ladders: Ladder[], underlying: Ladder["underlying"]) =>
  ladders.filter((l) => l.underlying === underlying && l.horizon === "dated").sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry));

/** A 2% drop in a $3,000 Bitcoin holding by today's close. */
export function portfolioQuote(ladders: Ladder[]): StakeQuote | null {
  const ladder = soonest(ladders, "BTC")[0];
  const spot = ladder ? impliedSpot(ladder) : null;
  if (!ladder || spot == null) return null;
  const holding = 3000;
  const payout = holding * 0.02;
  const rung = [...ladder.rungs].reverse().find((r) => r.strike <= spot * 0.98 && usable(askFor(r.contract, "no")));
  if (!rung) return null;
  const price = askFor(rung.contract, "no")!;
  return {
    id: "portfolio",
    label: "Portfolio",
    stake: "$3,000 of Bitcoin",
    risk: `A 2% drop today would cost you about $${payout}.`,
    trigger: `Bitcoin closes below ${formatPrice(rung.strike)} today`,
    cost: dollars(payout * price),
    payout,
    coveredLabel: `a $${payout} drop`,
    coveredOf: payout,
    market: `Bitcoin at ${formatPrice(rung.strike)} or above today?`,
    fill: `${payout} × No at ${cents(price)}`,
    href: "/portfolio",
  };
}

/** A jump in natural gas, which a heating bill loosely follows, by the end of the listed month. */
export function heatQuote(ladders: Ladder[]): StakeQuote | null {
  const dated = soonest(ladders, "NGAS");
  const ladder = dated[dated.length - 1];
  const spot = ladder ? impliedSpot(ladder) : null;
  if (!ladder || spot == null) return null;
  const payout = 60;
  const rung = ladder.rungs.find((r) => r.strike >= spot * 1.04 && usable(askFor(r.contract, "yes")));
  if (!rung) return null;
  const price = askFor(rung.contract, "yes")!;
  const by = new Date(ladder.expiry).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    id: "heat",
    label: "Heating bill",
    stake: "This month's heating bill",
    risk: "When natural gas jumps, the bill follows. A rough match, not an exact one.",
    trigger: `Natural gas is at ${formatPrice(rung.strike)} or above on ${by}`,
    cost: dollars(payout * price),
    payout,
    coveredLabel: "a $60 jump",
    coveredOf: payout,
    market: `Natural gas at ${formatPrice(rung.strike)} or above on ${by}?`,
    fill: `${payout} × Yes at ${cents(price)}`,
    href: "/bills",
  };
}

const METRICS: Record<string, string> = { rushing_yards: "rushing yards", receiving_yards: "receiving yards", passing_yards: "passing yards", points: "points" };

/** A quiet game from one player: the line the market thinks is about one in three to miss. */
export function fantasyQuote(props: PlayerProp[]): StakeQuote | null {
  const payout = 30;
  let best: { prop: PlayerProp; line: PlayerProp["lines"][number]; price: number; gap: number } | null = null;
  for (const prop of props) {
    if (!METRICS[prop.metric]) continue;
    for (const line of prop.lines) {
      const price = askFor(line.contract, "no");
      const p = chanceOf(line.contract.quote, "no").p;
      if (!line.contract.open || !usable(price) || p == null) continue;
      const gap = Math.abs(p - 0.35);
      if (!best || gap < best.gap) best = { prop, line, price, gap };
    }
  }
  if (!best) return null;
  const under = Math.ceil(best.line.line);
  const what = METRICS[best.prop.metric];
  return {
    id: "fantasy",
    label: "Fantasy lineup",
    stake: "A $30 weekly matchup",
    risk: `If ${best.prop.player} has a quiet game, the matchup goes with him.`,
    trigger: `${best.prop.player} finishes under ${under} ${what}`,
    cost: dollars(payout * best.price),
    payout,
    coveredLabel: "a $30 buy-in",
    coveredOf: payout,
    market: `${best.prop.player} ${under}+ ${what}?`,
    fill: `${payout} × No at ${cents(best.price)}`,
    href: "/fantasy",
  };
}

/** A cooler-than-expected day for a food truck: the buckets below the most likely one. Covers a quarter of the day's sales. */
export function bizQuote(markets: BucketMarket[], city = "Amsterdam"): StakeQuote | null {
  const market = markets.filter((m) => m.city === city).sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry)).find((m) => Date.parse(m.expiry) - Date.now() > 6 * 3_600_000);
  if (!market) return null;
  const likeliest = [...market.buckets].sort((a, b) => (yesChance(b.contract.quote).p ?? 0) - (yesChance(a.contract.quote).p ?? 0))[0];
  const threshold = likeliest?.lo;
  if (threshold == null) return null;
  const below = market.buckets.filter((b) => b.hi != null && b.hi < threshold);
  const prices = below.map((b) => b.contract.quote.ask);
  if (below.length === 0 || prices.some((p) => p == null)) return null;
  const price = prices.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  if (!usable(price)) return null;
  const payout = 100;
  const day = new Date(Date.parse(market.expiry) - 6 * 3_600_000).toLocaleDateString("en-US", { weekday: "long" });
  return {
    id: "biz",
    label: "Small business",
    stake: `A food truck in ${city}`,
    risk: "A cool, grey day costs about $400 in sales.",
    trigger: `${city}'s high stays under ${threshold}°${market.unit} on ${day}`,
    cost: dollars(payout * price),
    payout,
    coveredLabel: "$400 in sales",
    coveredOf: 400,
    market: `${city}'s high under ${threshold}°${market.unit} on ${day}?`,
    fill: `${payout} × Yes across ${below.length} ${below.length === 1 ? "range" : "ranges"} at ${cents(price)}`,
    href: "/business",
  };
}
