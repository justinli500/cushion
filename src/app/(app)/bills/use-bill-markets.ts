"use client";

import { useMemo, useSyncExternalStore } from "react";
import { priceCushion } from "@/domains/cushion/price";
import type { Cushion, CushionQuote } from "@/domains/cushion/types";
import {
  BILLS,
  COVER_LEVELS,
  coverFor,
  dollarsPerPoint,
  pickLadders,
  spotOf,
  type BillKind,
  type BillLadders,
  type CoverLevel,
} from "@/domains/exposure/bills";
import type { Book, Ladder } from "@/domains/markets/types";
import { usePoll } from "@/lib/use-poll";

export type Horizon = "daily" | "monthEnd";
const HORIZONS: Horizon[] = ["daily", "monthEnd"];
type ByLevel<T> = Record<CoverLevel, T>;

export interface BillMarkets {
  ladders: BillLadders;
  covers: Record<Horizon, ByLevel<Cushion | null>>;
  /** Priced against the live book. Null while the book loads or when there is nothing to price. */
  quotes: Record<Horizon, ByLevel<CushionQuote | null>>;
  loading: boolean;
  error: string | null;
  booksLoading: boolean;
  booksError: string | null;
  /** Dollars added to the monthly bill per $1 on the commodity, for the replay. Null with no price to size it from. */
  exposure: number | null;
}

const LADDER_REFRESH_MS = 20_000;
const BOOK_REFRESH_MS = 5_000;
const MINUTE_MS = 60_000;

// Which ladder is "today's" changes when one expires, so the picker needs a clock that ticks even when no poll lands.
const subscribeToClock = (onChange: () => void) => {
  const timer = setInterval(onChange, MINUTE_MS);
  return () => clearInterval(timer);
};
const minuteNow = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
const useClock = () => useSyncExternalStore(subscribeToClock, minuteNow, () => 0);

/** The ladders for one bill and the day and month-end covers on them, priced live at both levels. */
export function useBillMarkets(bill: BillKind, amount: number): BillMarkets {
  const ladderPoll = usePoll<{ ladders: Ladder[] }>("/api/markets/ladders", LADDER_REFRESH_MS);
  const now = useClock();
  const ladders = useMemo(
    () => pickLadders(ladderPoll.data?.ladders ?? [], BILLS[bill].underlying, now),
    [ladderPoll.data, bill, now],
  );

  const covers = useMemo(() => {
    const build = (ladder: Ladder | null) =>
      Object.fromEntries(COVER_LEVELS.map((level) => [level, coverFor(bill, amount, ladder, level)])) as ByLevel<Cushion | null>;
    return { daily: build(ladders.daily), monthEnd: build(ladders.monthEnd) };
  }, [bill, amount, ladders]);

  const symbols = [...new Set(HORIZONS.flatMap((h) => COVER_LEVELS.flatMap((l) => covers[h][l]?.legs.map((leg) => leg.symbol) ?? [])))];
  const bookPoll = usePoll<{ books: Record<string, Book> }>(
    symbols.length > 0 ? `/api/book?symbols=${symbols.join(",")}` : null,
    BOOK_REFRESH_MS,
  );

  const quotes = useMemo(() => {
    const price = (cover: Cushion | null) => (cover && bookPoll.data ? priceCushion(cover, bookPoll.data.books) : null);
    const build = (horizon: Horizon) =>
      Object.fromEntries(COVER_LEVELS.map((level) => [level, price(covers[horizon][level])])) as ByLevel<CushionQuote | null>;
    return { daily: build("daily"), monthEnd: build("monthEnd") };
  }, [covers, bookPoll.data]);

  const spot = spotOf(ladders.daily) ?? spotOf(ladders.monthEnd);
  const exposure = bill === "gas" || spot ? dollarsPerPoint(bill, amount, spot ?? 1) : null;

  return {
    ladders,
    covers,
    quotes,
    loading: ladderPoll.loading,
    error: ladderPoll.error,
    booksLoading: symbols.length > 0 && bookPoll.loading,
    booksError: bookPoll.error,
    exposure,
  };
}
