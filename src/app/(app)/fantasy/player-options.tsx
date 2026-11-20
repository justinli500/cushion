"use client";

import { Card, Chip, Notice, ToggleCard, ToggleTag } from "@/components/kit";
import { chanceOf } from "@/domains/cushion/probability";
import type { CushionQuote } from "@/domains/cushion/types";
import { bustWording, type StatLines } from "@/domains/exposure/fantasy";
import { pickableLines, shortUsd, type Slot } from "@/domains/exposure/fantasy-cushion";
import type { PropLine } from "@/domains/markets/types";
import { formatChance, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Face } from "./roster";

/** One way to cushion a player: a stat, and the line he has to finish under for it to pay. */
export interface Option {
  stat: StatLines;
  line: PropLine;
  /** Priced for this player's share of the stake. Null until the books load. */
  quote: CushionQuote | null;
  on: boolean;
}

interface Props {
  slot: Slot;
  /** "RB · ATL", or empty when neither is known. */
  role: string;
  options: Option[];
  booksFailed: boolean;
  onPress: (metric: string) => void;
  onLine: (metric: string, line: number) => void;
  onRemove: () => void;
}

/** The chosen player and every way to cushion him. One can be on at a time; pressing it again takes it off. */
export function PlayerOptions({ slot, role, options, booksFailed, onPress, onLine, onRemove }: Props) {
  const { entry, name, status } = slot;
  const first = name.split(" ")[0];

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-row flex-wrap items-center gap-4 rounded-[24px] px-5 py-[18px]">
        <Face name={name} src={entry?.headshot} className="size-[72px]" covered={options.some((o) => o.on)} />
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
          <h2 className="display text-[24px] font-bold leading-tight tracking-[-0.02em]">{name}</h2>
          {role ? <span className="text-[14px] font-semibold text-body">{role}</span> : null}
          {entry ? (
            <span className="text-[13px] text-muted-foreground">
              {entry.gameTitle} · {status === "upcoming" ? "starts" : "started"} {formatWhen(entry.startTime)}
              {status === "live" ? " · in progress" : ""}
            </span>
          ) : null}
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${name} from the lineup`} className="press inline-flex min-h-11 items-center text-[13px] font-semibold text-muted-foreground hover:text-foreground">
          Remove
        </button>
      </Card>

      {!entry ? (
        <Notice>{name} has no markets right now. They will show up here when his game is listed.</Notice>
      ) : status === "over" ? (
        <Notice>This game has probably finished, so there is nothing left to cover.</Notice>
      ) : options.length === 0 ? (
        <Notice>No market is open for {name} right now.</Notice>
      ) : (
        <>
          <h3 className="display px-1 pt-1 text-[20px] font-semibold tracking-[-0.01em]">Ways to cushion {first}</h3>
          {options.map((option) => (
            <OptionCard key={option.stat.metric} option={option} booksFailed={booksFailed} onPress={() => onPress(option.stat.metric)} onLine={(line) => onLine(option.stat.metric, line)} />
          ))}
          <p className="px-1 text-[12px] text-muted-foreground">One cushion per player. Each percentage is the market&rsquo;s chance of that happening, which is your chance of being paid.</p>
        </>
      )}
    </div>
  );
}

function OptionCard({ option, booksFailed, onPress, onLine }: { option: Option; booksFailed: boolean; onPress: () => void; onLine: (line: number) => void }) {
  const { stat, line, quote, on } = option;
  const wording = bustWording(stat.metric, line.line);
  const chance = chanceOf(line.contract.quote, "no");
  const filled = quote?.legs[0]?.filled ?? 0;
  const noPrice = filled > 0 && quote ? Math.round((quote.cost / filled) * 100) : null;
  const lines = pickableLines(stat);

  return (
    // The line chips sit beside the toggle, not inside it: a button cannot hold other buttons.
    <div className={cn("arrive rounded-[24px] border-2 bg-card", on ? "border-primary" : "border-card")}>
      <ToggleCard pressed={on} onToggle={onPress} className="rounded-[22px] border-0">
        <span className="flex items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-risk">Pays if he</span>
            <span className="display text-[18px] font-semibold">{wording.clause}</span>
          </span>
          <ToggleTag pressed={on} />
        </span>
        <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[14px] text-body">
          {!quote ? (
            <span>{booksFailed ? "Price unavailable" : "Pricing…"}</span>
          ) : quote.maxPayout === 0 ? (
            <span className="font-semibold">Nobody is selling this right now</span>
          ) : (
            <>
              <span>
                Cushion costs <strong className="tabular font-semibold text-foreground">{shortUsd(quote.cost)}</strong>
              </span>
              <span>
                Pays <strong className="tabular font-semibold text-covered">{shortUsd(quote.maxPayout)}</strong>
              </span>
            </>
          )}
          {chance.p != null ? (
            <span>
              {chance.uncertain ? "About " : ""}
              {formatChance(chance.p)} chance it pays
            </span>
          ) : null}
        </span>
        <span className="text-[13px] text-muted-foreground">
          Market: {line.contract.label} · No{noPrice != null ? ` at ${noPrice}¢` : ""}
        </span>
      </ToggleCard>

      {on && lines.length > 1 ? (
        <div className="arrive mx-5 mb-5 rounded-[18px] bg-muted p-4">
          <p className="mb-2 text-[13px] font-semibold text-muted-foreground">When should it pay you back?</p>
          <div className="flex flex-wrap gap-2">
            {lines.map((l) => {
              const p = chanceOf(l.contract.quote, "no");
              return (
                <Chip key={l.contract.symbol} small pressed={l.line === line.line} onClick={() => onLine(l.line)}>
                  {bustWording(stat.metric, l.line).chip} · {p.uncertain ? "~" : ""}
                  {formatChance(p.p)}
                </Chip>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
