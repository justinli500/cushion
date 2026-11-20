"use client";

import { toast } from "sonner";
import { Button, CushionMeter, Panel, Tile } from "@/components/kit";
import { cashOut } from "@/domains/account/buy";
import type { Position } from "@/domains/account/ledger";
import type { Chance } from "@/domains/cushion/types";
import { youGet } from "@/domains/replay/worth-markets";
import { formatChance, formatUsd } from "@/lib/format";
import { whole } from "./view";

/** The handoff's smaller tile: 12px caption over a 24px number. */
export const MINI = "gap-0.5 rounded-2xl p-3.5 [&>span:first-child]:text-[12px] [&>span:last-child]:text-[24px]";

export function chanceText(chance: Chance | null): string {
  if (!chance || chance.p == null) return "n/a";
  return chance.uncertain && chance.low != null && chance.high != null ? `${formatChance(chance.low)}–${formatChance(chance.high)}` : formatChance(chance.p);
}

interface Props {
  position: Position;
  /** Every open cushion on this game, newest first. */
  open: Position[];
  onPick(id: string): void;
  /** What the shown cushion would sell for right now. */
  worth: number;
  chance: Chance | null;
  recorded: boolean;
  onAdd(): void;
}

/** The person's own cushion on this game: what it pays, what it is worth now, and the buttons to cash out or add more. */
export function CushionPanel({ position, open, onPick, worth, chance, recorded, onAdd }: Props) {
  const nothingBid = worth <= 0;

  const cash = () => {
    cashOut(position.id, worth);
    toast.success(`${position.title} cashed out`, { description: `${formatUsd(worth)} is back in your play money. You paid ${formatUsd(position.cost)}.` });
  };

  return (
    <Panel label="Your cushion" className="gap-[18px]">
      {open.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Your cushions on this game">
          {open.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === position.id}
              onClick={() => onPick(p.id)}
              className={`press min-h-9 max-w-full truncate rounded-full px-3.5 text-[13px] font-semibold ${p.id === position.id ? "bg-card text-foreground" : "bg-panel-tile text-white hover:bg-panel-track"}`}
            >
              {p.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] text-panel-foreground">{youGet(position.detail)}</span>
        <span className="display tabular text-[52px] font-bold leading-none tracking-[-0.03em]">{formatUsd(position.maxPayout)}</span>
      </div>

      <CushionMeter
        onDark
        label="Worth now, of the full payout"
        value={`${whole(worth)} of ${whole(position.maxPayout)}`}
        fraction={position.maxPayout > 0 ? worth / position.maxPayout : 0}
      />

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Worth right now" value={formatUsd(worth)} tone="panel" className={MINI} />
        <Tile label={/ lose/.test(position.detail) ? "Chance they lose" : "Chance it pays"} value={chanceText(chance)} tone="panel" className={MINI} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="light" wide onClick={cash} disabled={nothingBid}>
          Cash out {formatUsd(worth)}
        </Button>
        <button
          type="button"
          onClick={onAdd}
          className="press h-[52px] rounded-full border-[1.5px] border-covered-on-dark bg-transparent text-[16px] font-semibold text-white hover:bg-panel-tile"
        >
          Add cushion
        </button>
      </div>

      {nothingBid ? (
        <p className="rounded-[18px] bg-panel-tile px-4 py-3 text-[13px] leading-relaxed text-white">
          Nobody is bidding for this cover right now, so it would cash out at nothing. It is still yours, and the market may bid again.
        </p>
      ) : null}

      <p className="text-[13px] text-panel-foreground">You paid {formatUsd(position.cost)}. Play money: no real funds move.</p>

      <details className="text-[13px] text-panel-foreground">
        <summary className="press cursor-pointer select-none hover:text-white">Under the hood</summary>
        <ul className="mt-3 space-y-1.5">
          {position.legs.map((leg) => (
            <li key={leg.symbol} className="tabular flex justify-between gap-3">
              <span className="truncate">{leg.label}</span>
              <span className="shrink-0 font-semibold text-white">
                {leg.filled} × {leg.side === "yes" ? "Yes" : "No"} at {leg.filled > 0 ? Math.round((leg.cost / leg.filled) * 100) : 0}¢
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px]">
          {recorded
            ? "Worth is what each side would sell for at the last price that really traded at this point in the game, less 1 cent."
            : "Worth is what each side would sell for into Gemini’s live order book now: the best bid for Yes, one minus the best ask for No."}{" "}
          Exchange fees are not included.
        </p>
      </details>
    </Panel>
  );
}
