"use client";

import { Button, CushionMeter, Panel, QuotePair } from "@/components/kit";
import { useCushionPurchase } from "@/components/cushion-ticket";
import type { Cushion } from "@/domains/cushion/types";
import { outOfPocket, type Scenario } from "@/domains/exposure/portfolio-scenarios";
import { formatUsd, formatUsdWhole } from "@/lib/format";

const whole = (dollars: number) => formatUsd(dollars).replace(/\.00$/, "");
const lost = (dollars: number) => (dollars >= 0.5 ? `−${formatUsdWhole(dollars)}` : "$0");

const tile = "rounded-[18px] bg-panel-tile px-4 py-3 text-[14px] leading-relaxed text-white";

/**
 * The dark panel for the scenario on the chart: what it would cost without a cushion and with one,
 * in two bars, and the button that buys it. `message` stands in for everything else while there is
 * nothing to choose from.
 */
export function CushionAside({ chosen, label, message }: { chosen: Scenario[]; label: string; message: string | null }) {
  const cushion: Cushion | null = chosen.length > 0 ? { legs: chosen.flatMap((s) => s.cushion.legs), payoutMode: "sum" } : null;
  const { quote, loading, error, nothingToBuy, canBuy, justBought, tooDear, buy } = useCushionPurchase({
    section: "portfolio",
    title: chosen.length === 1 ? chosen[0].title : "Portfolio cushion",
    detail: `Pays if ${chosen.map((s) => s.trigger).join(", or if ")}.`,
    cushion,
    eventTickers: chosen.map((s) => s.eventTicker),
    expiry: chosen.map((s) => s.expiry).sort().at(-1) ?? "",
  });

  const loss = chosen.reduce((sum, s) => sum + s.loss, 0);
  const unsold = quote != null && quote.maxPayout === 0;
  const priced = quote != null && !unsold;
  const net = priced ? outOfPocket(loss, quote.cost, quote.maxPayout) : 0;

  return (
    <aside className="min-w-0 flex-[1_1_320px]">
      <Panel label={label}>
        {message ? (
          <p className={tile}>{message}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3.5">
              <CushionMeter onDark tone="risk" label="Without a cushion" value={lost(loss)} fraction={loss > 0 ? 1 : 0} />
              <CushionMeter
                onDark
                label="With your cushion"
                value={nothingToBuy ? "$0" : priced ? lost(net) : unsold ? "n/a" : "…"}
                fraction={priced && loss > 0 ? net / loss : 0}
              />
            </div>

            {unsold ? (
              <p className={tile}>Nobody is selling this cover on Gemini right now. Thin markets fill and empty through the day, so it may be back soon.</p>
            ) : !nothingToBuy && !quote && !loading ? (
              <p className={tile}>{error ?? "Gemini's order book is unavailable right now."}</p>
            ) : (
              <QuotePair
                onDark
                pay={nothingToBuy ? "$0" : priced ? whole(quote.cost) : "…"}
                pays={nothingToBuy ? "$0" : priced ? whole(quote.maxPayout) : "…"}
                paysLabel="Cushion pays up to"
              />
            )}

            {priced && quote.partial ? (
              <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[13px] leading-relaxed text-white">
                Only {formatUsd(quote.maxPayout)} of the {formatUsd(quote.requestedPayout)} you asked for is on offer. The market for this is thin.
              </p>
            ) : null}

            {justBought ? (
              <p className="arrive rounded-full bg-covered-on-dark px-5 py-3.5 text-center text-[15px] font-semibold text-panel">Cushion added. A receipt is being written on-chain.</p>
            ) : (
              <Button onClick={buy} disabled={!canBuy} variant="light" wide>
                {nothingToBuy ? "Choose what to cushion" : tooDear ? "Not enough play money" : "Buy this cushion"}
              </Button>
            )}

            <p className="text-[13px] text-panel-foreground">
              {priced
                ? `If none of it happens, you’re out ${whole(quote.cost)} and keep your gains. Play money: no real funds move.`
                : "Play money: no real funds move."}
              {chosen.some((s) => s.estimate)
                ? " Losses marked Estimate come from how your holdings have moved with each market before, so they are a guide, not a promise."
                : ""}
            </p>

            {priced ? (
              <details className="text-[13px] text-panel-foreground">
                <summary className="press cursor-pointer select-none hover:text-white">Under the hood</summary>
                <div className="mt-3 flex flex-col gap-3">
                  {chosen.map((s) => {
                    const mine = new Set(s.cushion.legs.map((l) => l.symbol));
                    const rows = quote.legs.filter((l) => mine.has(l.symbol) && l.filled > 0);
                    return rows.length === 0 ? null : (
                      <div key={s.id}>
                        <p className="font-semibold text-white">{s.title}</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {rows.map((leg) => (
                            <li key={leg.symbol} className="tabular flex justify-between gap-3">
                              <span className="truncate">{leg.label}</span>
                              <span className="shrink-0 font-semibold text-white">
                                {leg.filled} &times; {leg.side === "yes" ? "Yes" : "No"} at {Math.round((leg.cost / leg.filled) * 100)}&cent;
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[12px]">Filled against Gemini&rsquo;s live order book. Exchange fees are not included.</p>
              </details>
            ) : null}
          </>
        )}
      </Panel>
    </aside>
  );
}
