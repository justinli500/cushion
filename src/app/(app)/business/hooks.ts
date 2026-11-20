"use client";

import { useEffect, useState } from "react";
import type { Book } from "@/domains/markets/types";

// /api/book refuses more than this many symbols in one request.
const MAX_SYMBOLS = 40;

interface BooksState {
  books: Record<string, Book>;
  /** The symbols the books were fetched for, or null before the first fetch lands. */
  key: string | null;
  error: string | null;
}

/**
 * Live YES books for every symbol, refreshed while the tab is visible. One request, or one per
 * 40 symbols when a business needs more. `loading` is true until the current symbols have loaded.
 */
export function useBooks(symbols: string[], intervalMs = 10_000) {
  const key = symbols.join(",");
  const [state, setState] = useState<BooksState>({ books: {}, key: null, error: null });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const all = key.split(",");
    const chunks = Array.from({ length: Math.ceil(all.length / MAX_SYMBOLS) }, (_, i) => all.slice(i * MAX_SYMBOLS, (i + 1) * MAX_SYMBOLS));
    const load = async () => {
      if (document.hidden) return;
      try {
        const bodies = await Promise.all(
          chunks.map(async (chunk) => {
            const res = await fetch(`/api/book?symbols=${chunk.join(",")}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? "Gemini's order books are unavailable right now.");
            return body.books as Record<string, Book>;
          }),
        );
        if (!cancelled) setState({ books: Object.assign({}, ...bodies), key, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gemini's order books are unavailable right now.";
        if (!cancelled) setState((previous) => ({ ...previous, key, error: message }));
      }
    };
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, intervalMs]);

  return { books: state.books, error: state.error, loading: key !== "" && state.key !== key };
}

/** The current time, refreshed so that a market expiring while the page is open drops out. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
