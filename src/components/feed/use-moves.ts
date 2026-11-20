"use client";

import { useEffect, useRef, useState } from "react";
import { dayMove, type Move } from "@/domains/feed/news";

/**
 * Each contract's price move over the last day, from its hourly candles, keyed by symbol. A symbol
 * appears once its request has finished; null means Gemini had no usable candles for it.
 */
export function useDayMoves(symbols: string[]): Record<string, Move | null> {
  const [moves, setMoves] = useState<Record<string, Move | null>>({});
  const asked = useRef(new Set<string>());
  const key = symbols.join(",");

  useEffect(() => {
    for (const symbol of key ? key.split(",") : []) {
      if (asked.current.has(symbol)) continue;
      asked.current.add(symbol);
      fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&tf=1hr`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => (body?.candles ? dayMove(body.candles, Date.now()) : null))
        .catch(() => null)
        .then((move) => setMoves((previous) => ({ ...previous, [symbol]: move })));
    }
  }, [key]);

  return moves;
}
