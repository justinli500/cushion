import type { BucketMarket, Contract, Game, Ladder, PropLine, Rung, Side } from "@/domains/markets/types";
import type { Cushion, Leg } from "./types";

// Gemini's quantityIncrement for prediction contracts.
const roundQuantity = (quantity: number) => Math.round(quantity * 100) / 100;

function leg(contract: Contract, side: Side, quantity: number, strike?: number): Leg {
  return { symbol: contract.symbol, side, quantity: roundQuantity(quantity), label: contract.label, strike };
}

const keepFillable = (legs: Leg[]) => legs.filter((l) => l.quantity >= 0.01);

export interface StripInput {
  ladder: Ladder;
  /** "fall" protects something you own; "rise" protects something you have to buy. */
  direction: "fall" | "rise";
  /** Cover starts once the price is past this level. */
  startLevel: number;
  /** Dollars lost for each 1.00 the price moves against you. */
  dollarsPerPoint: number;
}

/**
 * A strip of binaries that pays in steps as the price moves past `startLevel`.
 *
 * Each rung is sized to the gap to the next rung further out, so between two rungs the payout
 * already covers the whole gap: the staircase sits at or just above the loss measured from the
 * first rung. The last rung has no next rung and reuses the previous gap. Cover stops there.
 */
export function stripLegs({ ladder, direction, startLevel, dollarsPerPoint }: StripInput): Cushion {
  const falling = direction === "fall";
  const open = ladder.rungs.filter((r) => r.contract.open);
  const ordered: Rung[] = falling
    ? open.filter((r) => r.strike <= startLevel).reverse()
    : open.filter((r) => r.strike >= startLevel);

  const legs = ordered.map((rung, i) => {
    const next = ordered[i + 1];
    const previous = ordered[i - 1];
    const gap = next
      ? Math.abs(next.strike - rung.strike)
      : previous
        ? Math.abs(rung.strike - previous.strike)
        : Math.abs(startLevel - rung.strike);
    return leg(rung.contract, falling ? "no" : "yes", dollarsPerPoint * gap, rung.strike);
  });
  return { legs: keepFillable(legs), payoutMode: "sum" };
}

/** What a strip pays if the underlying settles at `settle`. */
export function stripPayoutAt(legs: Pick<Leg, "side" | "strike" | "quantity">[], settle: number): number {
  return legs.reduce((total, l) => {
    if (l.strike == null) return total;
    const yesWins = settle >= l.strike;
    return total + ((l.side === "yes") === yesWins ? l.quantity : 0);
  }, 0);
}

export interface TemperatureInput {
  market: BucketMarket;
  /** "below": the day's high finishes under `threshold`. "above": it finishes over it. */
  direction: "below" | "above";
  threshold: number;
  payout: number;
}

/** YES on every bucket that lies wholly past the threshold. Exactly one bucket wins, so one leg pays. */
export function temperatureLegs({ market, direction, threshold, payout }: TemperatureInput): Cushion {
  const past = market.buckets.filter((b) =>
    direction === "below" ? b.hi != null && b.hi < threshold : b.lo != null && b.lo > threshold,
  );
  const legs = past.filter((b) => b.contract.open).map((b) => leg(b.contract, "yes", payout));
  return { legs: keepFillable(legs), payoutMode: "one" };
}

const askFor = (contract: Contract, side: Side): number | null =>
  side === "yes" ? contract.quote.ask : contract.quote.bid == null ? null : 1 - contract.quote.bid;

/**
 * Pays if `teamAbbr` loses. Without draws, "opponent wins" and "team does not win" are the same
 * event, so the cheaper contract is used. With draws only "opponent wins" means a loss.
 */
export function teamLossLegs(game: Game, teamAbbr: string, payout: number): Cushion {
  const team = game.teams.find((t) => t.abbr === teamAbbr);
  const opponent = game.teams.find((t) => t.abbr !== teamAbbr);
  if (!team || !opponent) return { legs: [], payoutMode: "sum" };

  const viaOpponent = { contract: opponent.contract, side: "yes" as const };
  const viaTeam = { contract: team.contract, side: "no" as const };
  const options = (game.hasDraw ? [viaOpponent] : [viaOpponent, viaTeam]).filter((o) => o.contract.open);
  const priced = options
    .map((o) => ({ ...o, ask: askFor(o.contract, o.side) }))
    .sort((a, b) => (a.ask ?? Infinity) - (b.ask ?? Infinity));
  const best = priced[0];
  return { legs: best ? keepFillable([leg(best.contract, best.side, payout)]) : [], payoutMode: "sum" };
}

/** Pays if the player finishes under the line: NO on the "N+" contract. */
export function playerUnderLegs(line: PropLine, payout: number): Cushion {
  const legs = line.contract.open ? [leg(line.contract, "no", payout, line.line)] : [];
  return { legs: keepFillable(legs), payoutMode: "sum" };
}
