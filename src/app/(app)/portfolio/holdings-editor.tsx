"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/kit";
import { cleanSymbol, type Holding } from "@/domains/exposure/portfolio";
import { updateProfile } from "@/domains/profile/profile";
import { formatUsdWhole } from "@/lib/format";

const SUGGESTIONS = ["BTC", "ETH", "SOL", "MSTR", "COIN", "XOM", "NVDA"];
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function HoldingsEditor({ holdings }: { holdings: Holding[] }) {
  const [symbol, setSymbol] = useState("");
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const save = (next: Holding[]) => updateProfile("holdings", next);

  const add = () => {
    const cleaned = cleanSymbol(symbol);
    const dollars = Number(value.replace(/[$,\s]/g, ""));
    if (!TICKER.test(cleaned)) return setProblem("Enter a ticker, like BTC or XOM.");
    if (!Number.isFinite(dollars) || dollars <= 0) return setProblem("Enter how many dollars of it you hold.");
    if (dollars > 10_000_000) return setProblem("That is more than this demo can cushion. Try a smaller amount.");
    // Adding a ticker twice updates the amount instead of listing it twice.
    save([...holdings.filter((h) => h.symbol !== cleaned), { symbol: cleaned, value: dollars }]);
    setSymbol("");
    setValue("");
    setProblem(null);
  };

  return (
    <div>
      {holdings.length > 0 ? (
        <ul className="mb-5 flex flex-wrap gap-2">
          {holdings.map((h) => (
            <li key={h.symbol} className="arrive tabular flex items-center gap-2 rounded-full border border-border bg-muted py-1.5 pl-3.5 pr-1.5 text-[14px]">
              <span className="font-medium">{h.symbol}</span>
              <span className="text-muted-foreground">{formatUsdWhole(h.value)}</span>
              <button
                type="button"
                aria-label={`Remove ${h.symbol}`}
                onClick={() => save(holdings.filter((other) => other.symbol !== h.symbol))}
                className="press grid h-6 w-6 place-items-center rounded-full text-muted-foreground/70 hover:bg-border hover:text-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Field label="Ticker">
          <input className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" autoCapitalize="characters" maxLength={10} />
        </Field>
        <Field label="Dollars held">
          <input className={`${inputClass} tabular`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="2,000" inputMode="decimal" />
        </Field>
        <Button type="submit">Add</Button>
      </form>
      {problem ? <p className="mt-2 text-[13px] text-destructive">{problem}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground/70">
        <span>Try</span>
        {SUGGESTIONS.filter((s) => !holdings.some((h) => h.symbol === s)).map((s) => (
          <button key={s} type="button" onClick={() => setSymbol(s)} className="press rounded-full border border-border px-2.5 py-1 text-muted-foreground hover:border-foreground/30 hover:text-foreground">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
