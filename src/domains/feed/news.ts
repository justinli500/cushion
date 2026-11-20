import type { Section } from "@/domains/account/ledger";
import { yesChance } from "@/domains/cushion/probability";
import type { Cushion } from "@/domains/cushion/types";
import type { Candle, Contract, EventMarket, Game, Side, TeamSide } from "@/domains/markets/types";
import { teamNickname } from "@/domains/scores/names";
import { formatUsdWhole, formatWhen } from "@/lib/format";

/** What a Yes or No on the Today screen pays if it lands, in play dollars. Small on purpose. */
export const PAYOUT = 20;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type Kind = "foryou" | "economy" | "politics" | "business" | "tech" | "culture" | "sports";

/** The order the filter chips appear in. */
export const KINDS: { id: Kind; label: string }[] = [
  { id: "foryou", label: "For you" },
  { id: "economy", label: "Economy" },
  { id: "politics", label: "Politics" },
  { id: "business", label: "Business" },
  { id: "tech", label: "Tech" },
  { id: "culture", label: "Culture" },
  { id: "sports", label: "Sports" },
];

const KIND_BY_CATEGORY: Record<string, Kind> = { Economics: "economy", Politics: "politics", Business: "business", Tech: "tech", Culture: "culture" };
const labelOf = (kind: Kind) => KINDS.find((k) => k.id === kind)!.label;

/** One thing on the screen that can be traded: a news market's leading outcome, or a game's favorite. */
export interface TradeItem {
  id: string;
  kind: Kind;
  eyebrow: string;
  headline: string;
  /** Set when the Yes/No pair is about one outcome of several, so the card says which. */
  question: string | null;
  /** The outcome Yes and No refer to, or null when the headline is itself the question. */
  label: string | null;
  contract: Contract;
  section: Section;
  eventTicker: string;
  expiry: string;
  volume: number;
  /** Where to read more, for a game. */
  href: string | null;
  /** A game's clock: "Live now" or when it starts. */
  status: string | null;
}

export const cents = (price: number) => Math.round(price * 100);

/** What Yes and No cost to buy right now, from 0 to 1; null when nobody is offering that side. */
export const sidePrices = (contract: Contract) => ({
  yes: contract.quote.ask,
  no: contract.quote.bid == null ? null : 1 - contract.quote.bid,
});

/** The outcome the market thinks most likely. */
export function leadingOutcome(market: EventMarket) {
  const scored = market.outcomes.map((outcome) => ({ outcome, p: yesChance(outcome.contract.quote).p })).filter((s) => s.p != null);
  return scored.sort((a, b) => b.p! - a.p!)[0]?.outcome ?? null;
}

export function eventItem(market: EventMarket): TradeItem | null {
  const lead = leadingOutcome(market);
  const kind = KIND_BY_CATEGORY[market.category];
  if (!lead || !kind) return null;
  const several = market.outcomes.length > 1;
  return {
    id: `event-${market.eventTicker}`,
    kind,
    eyebrow: labelOf(kind),
    headline: market.title,
    question: several ? `Leading outcome of ${market.outcomes.length}: ${lead.label}` : null,
    label: several ? lead.label : null,
    contract: lead.contract,
    section: "portfolio",
    eventTicker: market.eventTicker,
    expiry: market.expiry,
    volume: market.volume,
    href: null,
    status: null,
  };
}

/** "the Texans", or "Notre Dame" for a college side. */
const who = (game: Game, team: TeamSide) => (game.league.startsWith("NCAA") ? teamNickname(game, team) : `the ${teamNickname(game, team)}`);

/** The side the market favors, or null when neither side has a price. */
export function favorite(game: Game): TeamSide | null {
  const home = game.teams.find((t) => t.side === "home");
  const away = game.teams.find((t) => t.side === "away");
  if (!home || !away) return null;
  const [h, a] = [yesChance(home.contract.quote).p, yesChance(away.contract.quote).p];
  if (h == null && a == null) return null;
  return (h ?? -1) >= (a ?? -1) ? home : away;
}

export function gameItem(game: Game): TradeItem | null {
  const away = game.teams.find((t) => t.side === "away");
  const home = game.teams.find((t) => t.side === "home");
  const pick = favorite(game);
  if (!away || !home || !pick || !pick.contract.open) return null;
  return {
    id: `game-${game.gameId}`,
    kind: "sports",
    eyebrow: `Sports · ${game.league}`,
    headline: `${away.name} at ${home.name}`,
    question: `Will ${who(game, pick)} win?`,
    label: `${teamNickname(game, pick)} win`,
    contract: pick.contract,
    section: "games",
    eventTicker: game.eventTicker,
    expiry: game.expiry,
    volume: game.volume,
    href: `/games/${game.gameId}`,
    status: game.isLive ? "Live now" : formatWhen(game.startTime),
  };
}

/** A game that is on or starts within `hours`, most traded first. */
export function soonGames(games: Game[], now: number, hours: number): Game[] {
  return games
    .filter((g) => (g.isLive || (Date.parse(g.startTime) >= now && Date.parse(g.startTime) <= now + hours * HOUR_MS)) && g.volume > 0)
    .sort((a, b) => b.volume - a.volume);
}

/** The cushion bought by pressing Yes or No: `PAYOUT` contracts on that side of the item's contract. */
export function tradeCushion(item: TradeItem, side: Side): Cushion {
  return { legs: [{ symbol: item.contract.symbol, side, quantity: PAYOUT, label: item.contract.label }], payoutMode: "sum" };
}

export function tradeCopy(item: TradeItem, side: Side): { title: string; detail: string } {
  const answer = side === "yes" ? "Yes" : "No";
  const title = [item.headline, item.label, answer].filter(Boolean).join(" · ");
  const subject = item.label ? `"${item.label}" resolves ${answer} on "${item.headline}"` : `"${item.headline}" resolves ${answer}`;
  return { title, detail: `Pays ${formatUsdWhole(PAYOUT)} if ${subject}.` };
}

/** How far a contract's price travelled over the last day, from real traded candles. */
export interface Move {
  /** Price a day ago and now, from 0 to 1. */
  from: number;
  to: number;
  /** Whole cents, negative when it fell. */
  change: number;
  points: { t: number; p: number }[];
}

/** Needs a candle from at least a day ago to measure against; a younger market has no day move. */
export function dayMove(candles: Candle[], now: number): Move | null {
  const start = now - DAY_MS;
  const before = candles.filter((c) => c.time <= start).at(-1);
  const inside = candles.filter((c) => c.time > start);
  if (!before || inside.length === 0) return null;
  const points = [{ t: start, p: before.close }, ...inside.map((c) => ({ t: c.time, p: c.close }))];
  const to = points[points.length - 1].p;
  return { from: before.close, to, change: cents(to) - cents(before.close), points };
}

/** True when the line is worth drawing: it went somewhere. */
export const hasShape = (move: Move) => move.points.some((p) => p.p !== move.points[0].p);

export interface Hero {
  item: TradeItem;
  move: Move | null;
  /** True when the pick is here because it moved, not just because it is the most traded. */
  moving: boolean;
}

/** The biggest mover of the day among `pool` (most traded first), or the most traded when nothing has moved. */
export function pickHero(pool: TradeItem[], moves: Record<string, Move | null | undefined>): Hero | null {
  const scored = pool.map((item) => ({ item, move: moves[item.contract.symbol] ?? null }));
  const moved = scored.filter((s) => s.move && Math.abs(s.move.change) >= 1).sort((a, b) => Math.abs(b.move!.change) - Math.abs(a.move!.change));
  if (moved[0]) return { ...moved[0], moving: true };
  return scored[0] ? { ...scored[0], moving: false } : null;
}

export interface UpcomingRow {
  id: string;
  /** When, in ms. For a live game, when it started. */
  at: number;
  kind: "game" | "event";
  live: boolean;
  title: string;
  detail: string;
  href: string | null;
}

const EVENT_WINDOW_DAYS = 45;
const GAME_WINDOW_HOURS = 36;
// Two of each keeps the aside about as tall as the hero beside it.
const PER_KIND = 2;

const priced = (contract: Contract) => {
  const { yes } = sidePrices(contract);
  return yes == null ? "" : `Yes ${cents(yes)}¢`;
};

/** Real dated things, soonest first: the busiest games about to start and the markets about to resolve. */
export function upcoming(markets: EventMarket[], games: Game[], now: number): UpcomingRow[] {
  const gameRows = soonGames(games, now, GAME_WINDOW_HOURS)
    .slice(0, PER_KIND)
    .flatMap((game): UpcomingRow[] => {
      const item = gameItem(game);
      if (!item) return [];
      const pick = favorite(game)!;
      return [
        {
          id: item.id,
          at: Date.parse(game.startTime),
          kind: "game",
          live: game.isLive,
          title: item.headline,
          detail: [`${teamNickname(game, pick)} to win`, priced(pick.contract), game.isLive ? "watch live" : ""].filter(Boolean).join(" · "),
          href: item.href,
        },
      ];
    });

  const eventRows = markets
    .filter((m) => Date.parse(m.expiry) > now && Date.parse(m.expiry) <= now + EVENT_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => Date.parse(a.expiry) - Date.parse(b.expiry))
    .slice(0, PER_KIND)
    .flatMap((market): UpcomingRow[] => {
      const lead = leadingOutcome(market);
      if (!lead) return [];
      const price = priced(lead.contract);
      const detail = market.outcomes.length > 1 ? `Leading: ${lead.label}${price ? ` · ${price}` : ""}` : price;
      return [{ id: `event-${market.eventTicker}`, at: Date.parse(market.expiry), kind: "event", live: false, title: market.title, detail, href: null }];
    });

  return [...gameRows, ...eventRows].sort((a, b) => a.at - b.at).slice(0, PER_KIND * 2);
}

/** A section of the app this market bears on, when the person can cushion something against it. */
export function relatedLink(item: TradeItem, holdingCount: number): { href: string; text: string } | null {
  if (item.kind !== "economy") return null;
  return { href: "/portfolio", text: holdingCount > 0 ? "See what this means for your holdings" : "Add what you hold" };
}
