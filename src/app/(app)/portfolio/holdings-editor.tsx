"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/kit";
import { cleanSymbol, type Holding } from "@/domains/exposure/portfolio";
import { updateProfile } from "@/domains/profile/profile";

const SUGGESTIONS = ["BTC", "ETH", "SOL", "SPY", "NVDA", "MSTR", "XOM"];
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
/** /api/prices reads at most 30 symbols, and 13 of them are the markets a holding is compared with. */
const MAX_HOLDINGS = 15;

export function saveHoldings(next: Holding[]) {
  updateProfile("holdings", next);
}

/** The outlined "Add a holding" control. It opens a small form, and is already open while there is nothing held. */
export function HoldingsEditor({ holdings }: { holdings: Holding[] }) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const showing = open || holdings.length === 0;

  const close = () => {
    setOpen(false);
    setSymbol("");
    setValue("");
    setProblem(null);
  };

  const add = () => {
    const cleaned = cleanSymbol(symbol);
    const dollars = Number(value.replace(/[$,\s]/g, ""));
    if (!TICKER.test(cleaned)) return setProblem("Enter a ticker, like BTC or XOM.");
    if (!Number.isFinite(dollars) || dollars <= 0) return setProblem("Enter how many dollars of it you hold.");
    if (dollars > 10_000_000) return setProblem("That is more than this demo can cushion. Try a smaller amount.");
    const others = holdings.filter((h) => h.symbol !== cleaned);
    if (others.length >= MAX_HOLDINGS) return setProblem(`This demo reads up to ${MAX_HOLDINGS} holdings. Remove one to add another.`);
    // Adding a ticker twice updates the amount instead of listing it twice.
    saveHoldings([...others, { symbol: cleaned, value: dollars }]);
    close();
  };

  if (!showing) {
    return (
      <Button variant="quiet" wide onClick={() => setOpen(true)}>
        Add a holding
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticker">
            <input className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC" autoCapitalize="characters" maxLength={10} />
          </Field>
          <Field label="Dollars held">
            <input className={`${inputClass} tabular`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="2,000" inputMode="decimal" />
          </Field>
        </div>
        {problem ? <p className="text-[13px] text-risk">{problem}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="dark">
            Add holding
          </Button>
          {holdings.length > 0 ? (
            <button type="button" onClick={close} className="press min-h-11 rounded-full px-4 text-[15px] font-semibold text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span>Try</span>
        {SUGGESTIONS.filter((s) => !holdings.some((h) => h.symbol === s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSymbol(s)}
            className="press min-h-8 rounded-full border border-border px-3 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
