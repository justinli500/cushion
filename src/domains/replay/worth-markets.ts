import { bustWording, defaultBustLine, metricLabel } from "@/domains/exposure/fantasy";
import { chanceOf, yesChance } from "@/domains/cushion/probability";
import type { Chance, Cushion } from "@/domains/cushion/types";
import type { Contract, Game, PlayerProp, Quote, Side } from "@/domains/markets/types";
import { teamLabel, teamNickname } from "@/domains/scores/names";
import { formatUsdWhole } from "@/lib/format";
import type { HeldLeg } from "./worth";

/** One yes/no market of a game, with the words for each side. */
export interface Market {
  key: string;
  kind: "team" | "player";
  symbol: string;
  /** "Houston Texans to win?" */
  question: string;
  /** Completes "Pays $20 if ...": what Yes means. */
  yes: string;
  /** What No means. */
  no: string;
  contract: Contract;
  eventTicker: string;
  expiry: string;
}

/** A Yes or No pressed on a market. */
export interface MarketPick {
  market: Market;
  side: Side;
}

const isCollege = (game: Game) => game.league.startsWith("NCAA");

/** How many player lines the trade card offers. */
const PLAYER_LINES = 4;

/** The line of a prop whose chance is closest to even, among lines with a price. */
function closestCall(prop: PlayerProp) {
  const priced = prop.lines.filter((line) => line.contract.open && yesChance(line.contract.quote).p != null);
  let best: (typeof priced)[number] | undefined;
  for (const line of priced) {
    if (!best || Math.abs(yesChance(line.contract.quote).p! - 0.5) < Math.abs(yesChance(best.contract.quote).p! - 0.5)) best = line;
  }
  return best;
}

/** The player market for one line: Yes means the stat reaches the next whole number. */
function playerMarket(prop: PlayerProp, line: PlayerProp["lines"][number]): Market {
  const reaches = Math.floor(line.line) + 1;
  const unit = metricLabel(prop.metric).toLowerCase();
  return {
    key: line.contract.symbol,
    kind: "player",
    symbol: line.contract.symbol,
    question: `${prop.player}: ${reaches}+ ${unit}?`,
    yes: `${prop.player} gets ${reaches}+ ${unit}`,
    no: `${prop.player} ${bustWording(prop.metric, line.line).clause}`,
    contract: line.contract,
    eventTicker: prop.eventTicker,
    expiry: prop.expiry,
  };
}

/** The markets the trade card lists: each team's win contract, then the player lines that are closest to a coin flip. */
export function gameMarkets(game: Game, props: PlayerProp[]): Market[] {
  const teams: Market[] = [...game.teams]
    .sort((a, b) => (a.side === b.side ? 0 : a.side === "away" ? -1 : 1))
    .map((team) => {
      const nick = teamNickname(game, team);
      const college = isCollege(game);
      return {
        key: team.contract.symbol,
        kind: "team" as const,
        symbol: team.contract.symbol,
        question: `${teamLabel(game, team)} to win?`,
        yes: college ? `${nick} wins` : `the ${nick} win`,
        no: college ? `${nick} does not win` : `the ${nick} do not win`,
        contract: team.contract,
        eventTicker: game.eventTicker,
        expiry: game.expiry,
      };
    });
  const players = props
    .flatMap((prop) => {
      const line = closestCall(prop);
      return line ? [{ prop, line, gap: Math.abs(yesChance(line.contract.quote).p! - 0.5) }] : [];
    })
    .sort((a, b) => a.gap - b.gap)
    .slice(0, PLAYER_LINES)
    .map(({ prop, line }) => playerMarket(prop, line));
  return [...teams, ...players];
}

/** Every player's "quiet game": the No side of the line the fantasy page would suggest first. */
export function quietGames(props: PlayerProp[]): MarketPick[] {
  return props.flatMap((prop) => {
    const line = defaultBustLine(prop.lines);
    return line ? [{ market: playerMarket(prop, line), side: "no" as const }] : [];
  });
}

/** The ticket's words for a pressed Yes or No. */
export function pickCopy({ market, side }: MarketPick, payout: number): { title: string; detail: string } {
  const clause = side === "yes" ? market.yes : market.no;
  return { title: `${market.question.replace(/\?$/, "")}: ${side === "yes" ? "Yes" : "No"}`, detail: `Pays ${formatUsdWhole(payout)} if ${clause}.` };
}

/** One contract on one side, for `payout` dollars. */
export function pickCushion({ market, side }: MarketPick, payout: number): Cushion {
  return { legs: market.contract.open ? [{ symbol: market.symbol, side, quantity: payout, label: market.contract.label }] : [], payoutMode: "sum" };
}

/** Quotes by contract symbol, for the game's two teams and the markets it lists. */
export function quoteIndex(game: Game, props: PlayerProp[]): Map<string, Quote> {
  const quotes = new Map<string, Quote>();
  for (const team of game.teams) quotes.set(team.contract.symbol, team.contract.quote);
  for (const prop of props) for (const line of prop.lines) quotes.set(line.contract.symbol, line.contract.quote);
  return quotes;
}

/** The chance the legs pay, when they rest on one contract. A cushion spread over several has no single chance. */
export function cushionChance(legs: HeldLeg[], quotes: Map<string, Quote>): Chance | null {
  const symbols = new Set(legs.map((leg) => leg.symbol));
  const quote = symbols.size === 1 ? quotes.get(legs[0].symbol) : undefined;
  const sides = new Set(legs.map((leg) => leg.side));
  return quote && sides.size === 1 ? chanceOf(quote, legs[0].side) : null;
}

/** "Pays $20 if the Texans lose to the Colts." as "If the Texans lose to the Colts, you get". */
export function youGet(detail: string): string {
  const match = /^Pays \S+ (if .+?)\.?$/.exec(detail.trim());
  return match ? `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)}, you get` : "If it goes against you, you get";
}
