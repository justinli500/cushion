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
      const due = positions.filter((p) => p.payout == null && Date.parse(p.expiry) <= Date.now());
      for (const position of due) {
        try {
          const res = await fetch(`/api/resolutions?events=${position.eventTickers.join(",")}`);
          if (!res.ok) continue;
          const { resolutions } = (await res.json()) as { resolutions: Record<string, "yes" | "no"> };
          const payout = settleLegs(position.legs, resolutions);
          if (payout != null) record({ type: "CushionSettled", at: new Date().toISOString(), id: position.id, payout });
        } catch {
          // Try again on the next pass.
        }
      }
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [positions]);

  return null;
}
