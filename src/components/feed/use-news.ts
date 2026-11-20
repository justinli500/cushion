"use client";

import { useEffect, useState } from "react";
import type { FeedCard } from "@/domains/feed/cards";

export interface NewsLine {
  text: string;
  /** "ai": written from today's news. "numbers": restated from the card's own figures. */
  source: "ai" | "numbers";
}

/**
 * Asks the server for one line per card on why today matters. Lines are requested once per set of
 * topics, not on every price tick, since the news does not change as fast as the quotes do.
 */
export function useNews(cards: FeedCard[]): Record<string, NewsLine> {
  const [lines, setLines] = useState<Record<string, NewsLine>>({});
  const key = cards.map((c) => c.id).join("|");

  useEffect(() => {
    if (cards.length === 0) return;
    let cancelled = false;
    fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: cards.slice(0, 8).map(({ id, topic, facts }) => ({ id, topic: topic.slice(0, 60), facts: facts.slice(0, 300) })) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { lines?: Record<string, NewsLine> } | null) => {
        if (!cancelled && body?.lines) setLines((previous) => ({ ...previous, ...body.lines }));
      })
      .catch(() => {
        // The cards stand on their own numbers when the news line is unavailable.
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the set of cards; their figures refresh constantly and must not re-ask for news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return lines;
}
