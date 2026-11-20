import { yesChance } from "@/domains/cushion/probability";
import type { Chance } from "@/domains/cushion/types";
import type { Quote } from "@/domains/markets/types";

/**
 * A team's chance of winning. Same as `yesChance`, except that a book with a wide gap between bid
 * and ask (a 0.16 bid against a 0.98 ask) has a midpoint that says nothing, so the last trade stands in.
 */
export function winChance(quote: Quote): Chance {
  const mid = yesChance(quote);
  if (mid.uncertain && quote.bid != null && quote.ask != null && quote.last != null) return { ...mid, p: quote.last };
  return mid;
}
