"use client";

import { Card, inputClass, Notice, Tag } from "@/components/ui";
import { chanceOf } from "@/domains/cushion/probability";
import {
  bustWording,
  hasOpenLine,
  MAX_PAYOUT,
  MIN_PAYOUT,
  PAYOUT_PRESETS,
  parsePayout,
  type GameStatus,
  type PlayerEntry,
  type StatLines,
} from "@/domains/exposure/fantasy";
import { formatChance, formatUsdWhole, formatWhen } from "@/lib/format";

/** The stat and bust line the person is looking at in this card. */
export interface PickedStat {
  metric: string;
  line: number | null;
}

interface Props {
  entry: PlayerEntry;
  status: GameStatus;
  picked: PickedStat | null;
  amount: string;
  onPickStat: (metric: string) => void;
  onPickLine: (line: number) => void;
  onAmount: (text: string) => void;
  onRemove: () => void;
}

const choice = (active: boolean) =>
  `press rounded-xl border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
    active ? "border-cushion bg-cushion-soft text-cushion" : "border-line bg-card text-ink hover:border-faint"
  }`;

export function PlayerCard({ entry, status, picked, amount, onPickStat, onPickLine, onAmount, onRemove }: Props) {
  const anyOpen = entry.stats.some(hasOpenLine);
  return (
    <Card className="arrive">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold">{entry.player}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <Tag tone="plain">{entry.league}</Tag>
            <span>{entry.gameTitle}</span>
            <span className="text-faint">
              {status === "upcoming" ? "Starts" : "Started"} {formatWhen(entry.startTime)}
            </span>
            {status === "live" ? <Tag tone="note">In progress</Tag> : null}
            {status === "over" ? <Tag tone="plain">Probably finished</Tag> : null}
          </p>
        </div>
        <RemoveButton name={entry.player} onClick={onRemove} />
      </div>

      <div className="mt-4">
        {status === "over" ? (
          <Notice>This game has probably finished, so there is nothing left to cover. The next one shows up here once it is listed.</Notice>
        ) : !anyOpen ? (
          <Notice>Markets for this game are closed right now. Check back later.</Notice>
        ) : (
          <ul className="space-y-2">
            {entry.stats.map((stat) => {
              const selected = picked?.metric === stat.metric;
              return (
                <li key={stat.metric}>
                  <StatRow stat={stat} selected={selected} onClick={() => onPickStat(stat.metric)} />
                  {selected && picked ? (
                    <Picker stat={stat} line={picked.line} amount={amount} onPickLine={onPickLine} onAmount={onAmount} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${name}`} className="press shrink-0 text-[13px] text-muted hover:text-ink">
      Remove
    </button>
  );
}

function StatRow({ stat, selected, onClick }: { stat: StatLines; selected: boolean; onClick: () => void }) {
  const open = hasOpenLine(stat);
  return (
    <button
      type="button"
      disabled={!open}
      aria-pressed={selected}
      onClick={onClick}
      className={`${choice(selected)} flex w-full items-center justify-between gap-4`}
    >
      <span className="text-[14px] font-medium">{stat.label}</span>
      <span className={`text-[13px] ${selected ? "" : "text-muted"}`}>{!open ? "Closed right now" : selected ? "Covering" : "Cover this"}</span>
    </button>
  );
}

function Picker({
  stat,
  line,
  amount,
  onPickLine,
  onAmount,
}: {
  stat: StatLines;
  line: number | null;
  amount: string;
  onPickLine: (line: number) => void;
  onAmount: (text: string) => void;
}) {
  return (
    <div className="arrive mt-2 space-y-5 rounded-xl bg-paper p-4">
      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">When should it pay you back?</p>
        <div className="flex flex-wrap gap-2">
          {stat.lines.map((l) => {
            const chance = chanceOf(l.contract.quote, "no");
            return (
              <button
                key={l.contract.symbol}
                type="button"
                disabled={!l.contract.open}
                aria-pressed={line === l.line}
                onClick={() => onPickLine(l.line)}
                className={choice(line === l.line)}
              >
                <span className="block text-[14px] font-medium">{bustWording(stat.metric, l.line).chip}</span>
                <span className={`tabular block text-[12px] ${line === l.line ? "" : "text-faint"}`}>
                  {!l.contract.open ? "Closed" : chance.p == null ? "No quotes" : `${chance.uncertain ? "~" : ""}${formatChance(chance.p)}`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-faint">Each percentage is the market&rsquo;s chance of that happening, which is your chance of being paid.</p>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">How much should it pay?</p>
        <div className="flex flex-wrap items-center gap-2">
          {PAYOUT_PRESETS.map((n) => (
            <button key={n} type="button" aria-pressed={amount === String(n)} onClick={() => onAmount(String(n))} className={`${choice(amount === String(n))} tabular text-[14px] font-medium`}>
              {formatUsdWhole(n)}
            </button>
          ))}
          <div className="relative w-28">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-faint" aria-hidden>
              $
            </span>
            <input
              inputMode="decimal"
              aria-label="Other amount in dollars"
              placeholder="Other"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              className={`${inputClass} tabular pl-6`}
            />
          </div>
        </div>
        {parsePayout(amount) == null ? (
          <p className="mt-2 text-[12px] text-loss">
            Choose an amount from {formatUsdWhole(MIN_PAYOUT)} to {formatUsdWhole(MAX_PAYOUT)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
