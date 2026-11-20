import { Card, CardTitle, Tag } from "@/components/kit";
import type { Holding, HoldingRead } from "@/domains/exposure/portfolio";
import { UNDERLYINGS } from "@/domains/markets/types";
import { formatUsdWhole } from "@/lib/format";
import { HoldingsEditor, saveHoldings } from "./holdings-editor";

// The handoff's allocation colours: ink, slate, accent, soft accent.
const SEGMENTS = ["bg-chart-3", "bg-chart-4", "bg-chart-1", "bg-chart-5"];

function caption(read: HoldingRead | undefined, reading: boolean) {
  if (!read) return reading ? "Reading price history…" : null;
  if (read.status === "direct") return null;
  if (read.status === "none") return "Nothing Gemini lists moves with this, so it cannot be cushioned here.";
  if (read.status === "unknown") return "No price history found for this ticker.";
  const like = formatUsdWhole(Math.abs(read.value * read.fit.beta));
  const name = read.status === "index" ? "the S&P 500" : UNDERLYINGS[read.underlying].name;
  return (
    <>
      Behaves like {like} {read.fit.beta > 0 ? "of" : "against"} {name} <Tag>Estimate</Tag>
    </>
  );
}

/** "What you hold": the total, how it splits, one tile per holding, and a way to add another. */
export function HoldingsCard({ holdings, reads, reading, example = false }: { holdings: Holding[]; reads: HoldingRead[]; reading: boolean; example?: boolean }) {
  const total = holdings.reduce((sum, h) => sum + h.value, 0);

  return (
    <Card className="min-w-0 flex-[1_1_300px]">
      <CardTitle hint={example ? <Tag>Example</Tag> : "Saved on this device"}>{example ? "An example portfolio" : "What you hold"}</CardTitle>
      <div className="flex flex-col gap-4">
        {example ? <p className="-mt-2 text-[14px] leading-relaxed text-body">Try the chart with these. Add what you hold below and it replaces them.</p> : null}
        {holdings.length === 0 ? (
          <p className="text-[15px] text-body">You have not added anything yet. Add what you hold and Cushion will work out what each holding is riding on.</p>
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-muted-foreground">Total</span>
              <span className="display tabular text-[40px] font-bold leading-[1.1] tracking-[-0.02em]">{formatUsdWhole(total)}</span>
            </div>

            <div
              role="img"
              aria-label={`How it splits: ${holdings.map((h) => `${h.symbol} ${Math.round((h.value / total) * 100)}%`).join(", ")}`}
              className="flex h-3.5 gap-[3px] overflow-hidden rounded-[7px]"
            >
              {holdings.map((h, i) => (
                <div key={h.symbol} title={h.symbol} className={`min-w-0 basis-0 ${SEGMENTS[i % SEGMENTS.length]}`} style={{ flexGrow: h.value }} />
              ))}
            </div>

            <ul className="flex flex-col gap-2">
              {holdings.map((h) => {
                const note = caption(reads.find((r) => r.symbol === h.symbol), reading);
                return (
                  <li key={h.symbol} className="arrive flex items-center gap-2 rounded-[14px] bg-muted py-3 pl-3.5 pr-2 text-[15px]">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex justify-between gap-3">
                        <span className="font-semibold">{h.symbol}</span>
                        <span className="tabular">{formatUsdWhole(h.value)}</span>
                      </div>
                      {note ? <span className="text-[13px] leading-snug text-muted-foreground">{note}</span> : null}
                    </div>
                    {example ? (
                      <span className="w-2" />
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${h.symbol}`}
                        onClick={() => saveHoldings(holdings.filter((other) => other.symbol !== h.symbol))}
                        className="press -my-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        &times;
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {/* The editor is given the person's own holdings, so the first one they add starts their portfolio in place of the example. */}
        <HoldingsEditor holdings={example ? [] : holdings} />
      </div>
    </Card>
  );
}
