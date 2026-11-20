import type { Book, Level } from "@/domains/markets/types";
import type { Cushion, CushionQuote, Leg, PricedLeg } from "./types";

const cents = (dollars: number) => Math.round(dollars * 100) / 100;

/**
 * Fills a leg against the YES book, best price first.
 * YES is bought from the asks. NO is bought by selling YES into the bids, at 1 minus each bid.
 */
export function priceLeg(leg: Leg, book: Book | undefined): PricedLeg {
  const levels: Level[] =
    leg.side === "yes"
      ? [...(book?.asks ?? [])].sort((a, b) => a.price - b.price)
      : [...(book?.bids ?? [])].sort((a, b) => b.price - a.price).map((l) => ({ price: 1 - l.price, size: l.size }));

  let remaining = leg.quantity;
  let cost = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    // A level priced at 1.00 or more can never pay more than it costs.
    if (level.price >= 1 || level.price <= 0) continue;
    const take = Math.min(remaining, level.size);
    cost += take * level.price;
    remaining -= take;
  }
  return { ...leg, filled: cents(leg.quantity - remaining), cost: cents(cost) };
}

const payoutOf = (quantities: number[], mode: Cushion["payoutMode"]) =>
  quantities.length === 0 ? 0 : mode === "sum" ? quantities.reduce((a, b) => a + b, 0) : Math.max(...quantities);

/** Prices every leg against its book. Legs with no book fill nothing. */
export function priceCushion(cushion: Cushion, books: Record<string, Book | undefined>): CushionQuote {
  const legs = cushion.legs.map((leg) => priceLeg(leg, books[leg.symbol]));
  return {
    legs,
    payoutMode: cushion.payoutMode,
    cost: cents(legs.reduce((total, l) => total + l.cost, 0)),
    maxPayout: cents(payoutOf(legs.map((l) => l.filled), cushion.payoutMode)),
    requestedPayout: cents(payoutOf(legs.map((l) => l.quantity), cushion.payoutMode)),
    partial: legs.some((l) => l.filled < l.quantity),
  };
}

/** Drops what did not fill, leaving the position that was actually bought. */
export function filledLegs(quote: CushionQuote): PricedLeg[] {
  return quote.legs.filter((l) => l.filled > 0).map((l) => ({ ...l, quantity: l.filled }));
}

/** Payout once every leg has resolved, or null while any leg is still open. */
export function settleLegs(legs: PricedLeg[], resolutions: Record<string, "yes" | "no" | undefined>): number | null {
  if (legs.some((l) => resolutions[l.symbol] == null)) return null;
  return cents(legs.reduce((total, l) => total + (resolutions[l.symbol] === l.side ? l.filled : 0), 0));
}
