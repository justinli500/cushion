"use client";

import { useState, type ReactNode } from "react";
import { Card, Chip, ToggleCard, ToggleTag } from "@/components/kit";
import { chanceOf } from "@/domains/cushion/probability";
import type { CushionQuote } from "@/domains/cushion/types";
import { bustWording, type PlayerEntry } from "@/domains/exposure/fantasy";
import { initials, pickableLines, shortUsd, type Choice, type Selection, type Slot } from "@/domains/exposure/fantasy-cushion";
import { formatChance, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  slot: Slot;
  /** What the card covers, or null when the game is over or no market is open. */
  selection: Selection | null;
  /** The covered line priced for this card's share of the stake. Null until the books load. */
  quote: CushionQuote | null;
  booksFailed: boolean;
  on: boolean;
  onToggle: () => void;
  onChoose: (choice: Choice) => void;
  onRemove: () => void;
}

export function PlayerCard({ slot, selection, quote, booksFailed, on, onToggle, onChoose, onRemove }: Props) {
  const { entry, name, status } = slot;
  const [adjusting, setAdjusting] = useState(false);

  if (!entry) {
    return (
      <Card className="arrive flex flex-wrap items-center justify-between gap-x-4 rounded-[24px] px-5 py-[18px]">
        <p className="min-w-0 flex-1 basis-60 text-[14px] text-body">
          <strong className="font-semibold text-foreground">{name}</strong> has no markets today. They will show up here when their game is listed.
        </p>
        <RemoveButton name={name} onClick={onRemove} />
      </Card>
    );
  }

  const wording = selection && bustWording(selection.stat.metric, selection.line.line);
  const offTag = status === "over" ? "Finished" : "Closed";
  const filled = quote?.legs[0]?.filled ?? 0;
  const noPrice = filled > 0 && quote ? Math.round((quote.cost / filled) * 100) : null;
  const chance = selection ? chanceOf(selection.line.contract.quote, "no") : null;

  return (
    <div className={cn("arrive rounded-[24px] border-2 bg-card", on ? "border-primary" : "border-card")}>
      <ToggleCard pressed={on} onToggle={onToggle} disabled={!selection} className="flex-row flex-wrap items-center gap-4 rounded-[22px] border-0 px-5 py-[18px]">
        <span className="display grid size-[52px] flex-none place-items-center rounded-[18px] bg-foreground text-[16px] font-bold text-background" aria-hidden>
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
          <span className="text-[17px] font-semibold">{name}</span>
          {wording ? <span className="text-[14px] font-semibold text-risk">Risk: {wording.clause}</span> : null}
          <span className="text-[13px] text-muted-foreground">
            {entry.gameTitle} · {status === "upcoming" ? "starts" : "started"} {formatWhen(entry.startTime)}
            {status === "live" ? " · in progress" : ""}
          </span>
        </span>
        <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
          <span className="text-[13px] text-muted-foreground">Cushion market</span>
          {selection ? (
            <>
              <span className="text-[15px] font-semibold">
                {selection.line.contract.label}: No{noPrice != null ? ` at ${noPrice}¢` : ""}
              </span>
              {chance?.p != null ? (
                <span className="text-[13px] text-muted-foreground">
                  {chance.uncertain ? "About " : ""}
                  {formatChance(chance.p)} chance it pays
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[15px] font-semibold">
              {status === "over" ? "Game probably finished, nothing left to cover" : "No market is open right now"}
            </span>
          )}
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          {selection ? <Price quote={quote} failed={booksFailed} /> : null}
          <ToggleTag pressed={on} off={selection ? "Add" : offTag} />
        </span>
      </ToggleCard>

      <div className="flex flex-wrap items-center justify-between gap-x-4 px-5 pb-1">
        {selection ? (
          <button
            type="button"
            aria-expanded={adjusting}
            onClick={() => setAdjusting(!adjusting)}
            className="press inline-flex min-h-11 items-center text-[14px] font-semibold text-covered"
          >
            {adjusting ? "Done" : "Change when it pays"}
          </button>
        ) : (
          <span />
        )}
        <RemoveButton name={name} onClick={onRemove} />
      </div>

      {adjusting && selection ? <Picker entry={entry} selection={selection} onChoose={onChoose} /> : null}
    </div>
  );
}

function Price({ quote, failed }: { quote: CushionQuote | null; failed: boolean }) {
  if (!quote) return failed ? <span className="text-[14px] text-muted-foreground">Price unavailable</span> : <span aria-hidden className="block h-5 w-24 animate-pulse rounded-md bg-track" />;
  if (quote.maxPayout === 0) return <span className="text-[14px] font-semibold text-muted-foreground">Nobody is selling this</span>;
  return (
    <span className="tabular text-[15px] font-semibold">
      {shortUsd(quote.cost)} pays {shortUsd(quote.maxPayout)}
    </span>
  );
}

export function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${name} from your lineup`} className="press inline-flex min-h-11 items-center text-[13px] font-semibold text-muted-foreground hover:text-foreground">
      Remove
    </button>
  );
}

/** One level down: which stat to cover, and the line it has to miss for the cushion to pay. */
function Picker({ entry, selection, onChoose }: { entry: PlayerEntry; selection: Selection; onChoose: (choice: Choice) => void }) {
  const { metric } = selection.stat;
  const stats = entry.stats.filter((s) => pickableLines(s).length > 0);
  return (
    <div className="arrive mx-5 mb-5 flex flex-col gap-4 rounded-[18px] bg-muted p-4">
      {stats.length > 1 ? (
        <ChipRow label="What to cover">
          {stats.map((s) => (
            <Chip key={s.metric} pressed={s.metric === metric} onClick={() => onChoose({ metric: s.metric })}>
              {s.label}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      <div>
        <ChipRow label="When should it pay you back?">
          {pickableLines(selection.stat).map((l) => {
            const chance = chanceOf(l.contract.quote, "no");
            return (
              <Chip key={l.contract.symbol} pressed={l.line === selection.line.line} onClick={() => onChoose({ metric, line: l.line })}>
                {bustWording(metric, l.line).chip} · {chance.uncertain ? "~" : ""}
                {formatChance(chance.p)}
              </Chip>
            );
          })}
        </ChipRow>
        <p className="mt-2 text-[12px] text-muted-foreground">Each percentage is the market&rsquo;s chance of that happening, which is your chance of being paid.</p>
      </div>
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
