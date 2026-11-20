"use client";

import { useEffect } from "react";
import { record, useAccount } from "@/domains/account/store";
import { settleLegs } from "@/domains/cushion/price";

const CHECK_EVERY_MS = 60_000;

/** Settles open cushions once Gemini has resolved their contracts. Renders nothing. */
export function SettlementWatcher() {
  const { positions } = useAccount();

  useEffect(() => {
    const check = async () => {
      // A game or prop can resolve long before its listed expiry, so every open cushion is checked.
      // Replay cushions are settled by the replay screen: Gemini resolved that game long ago.
      const open = positions.filter((p) => p.payout == null && !p.replay);
      const tickers = [...new Set(open.flatMap((p) => p.eventTickers))].slice(0, 20);
      if (tickers.length === 0) return;
      try {
        const res = await fetch(`/api/resolutions?events=${tickers.join(",")}`);
        if (!res.ok) return;
        const { resolutions } = (await res.json()) as { resolutions: Record<string, "yes" | "no"> };
        for (const position of open) {
          const payout = settleLegs(position.legs, resolutions);
          if (payout != null) record({ type: "CushionSettled", at: new Date().toISOString(), id: position.id, payout });
        }
      } catch {
        // Try again on the next pass.
      }
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [positions]);

  return null;
}
