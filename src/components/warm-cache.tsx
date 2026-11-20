"use client";

import { useEffect } from "react";
import { EXAMPLE_HOLDINGS, historyUrl } from "@/domains/exposure/portfolio";
import { UNDERLYINGS } from "@/domains/markets/types";
import { storedProfile } from "@/domains/profile/profile";
import { ageOf, remember } from "@/lib/last-good";

/** The lists nearly every screen is built from. */
const ROUTES = ["/api/markets/ladders", "/api/markets/games", "/api/markets/events", "/api/markets/weather", "/api/markets/props"];
const REFRESH_MS = 60_000;
/** A route a page has just fetched for itself is left alone. */
const FRESH_MS = 20_000;

/**
 * Fetches the market lists ahead of time and keeps them fresh while the tab is visible, so the
 * first visit to a screen has its numbers on arrival instead of an empty panel. Renders nothing.
 */
export function WarmCache() {
  useEffect(() => {
    const warm = () => {
      if (document.hidden) return;
      // The portfolio's price history is its slowest request, and its address depends on what the person holds.
      const held = storedProfile()?.holdings ?? [];
      const history = historyUrl(held.length > 0 ? held : EXAMPLE_HOLDINGS, Object.keys(UNDERLYINGS));
      for (const url of [...ROUTES, history]) {
        if (ageOf(url) < FRESH_MS) continue;
        // A failure is left for the page itself to report when it asks.
        fetch(url)
          .then((res) => (res.ok ? res.json() : null))
          .then((body) => (body ? remember(url, body) : undefined))
          .catch(() => undefined);
      }
    };
    // After the page in front has had its turn at the network.
    const first = setTimeout(warm, 600);
    const timer = setInterval(warm, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return null;
}
