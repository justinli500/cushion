"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { Card, CardTitle, Notice, Skeleton, Tag } from "@/components/kit";
import { BILLS, COVER_LEVELS, dayLabel, type BillKind, type CoverLevel } from "@/domains/exposure/bills";
import type { Replay as ReplayData, ReplayDay } from "@/domains/exposure/bills-replay";
import { formatLevel, formatUsd } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { COPY, LEVEL_NAMES } from "./copy";

// Spikes only is the accent; Full is the quiet gray. The two keep their colors whichever is selected.
const STROKE: Record<CoverLevel, string> = { spike: "var(--primary)", full: "var(--muted-foreground)" };

const signed = (dollars: number) => `${dollars < 0 ? "-" : dollars > 0 ? "+" : ""}${formatUsd(Math.abs(dollars))}`;

interface Point {
  label: string;
  spike?: number;
  full?: number;
}

/** Running net (paid minus cost) after each day, one point per date either level has. */
function runningNet(replay: ReplayData): Point[] {
  const dates = [...new Set(COVER_LEVELS.flatMap((l) => replay[l].days.map((d) => d.date)))].sort();
  const sum = { spike: 0, full: 0 };
  return dates.map((date) => {
    const point: Point = { label: dayLabel(date) };
    for (const level of COVER_LEVELS) {
      const day = replay[level].days.find((d) => d.date === date);
      if (day) {
        sum[level] = Math.round((sum[level] + day.payout - day.cost) * 100) / 100;
        point[level] = sum[level];
      }
    }
    return point;
  });
}

function Key({ level }: { level: CoverLevel }) {
  return <span className="inline-block h-0.5 w-4 rounded-full align-middle" style={{ background: STROKE[level] }} aria-hidden />;
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-[12px] shadow-sm">
      <p className="mb-1 text-muted-foreground">After {label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="tabular flex items-center gap-2">
          <Key level={entry.dataKey as CoverLevel} />
          <span className="font-semibold text-foreground">{signed(Number(entry.value))}</span>
          <span className="text-muted-foreground">{LEVEL_NAMES[entry.dataKey as CoverLevel]}</span>
        </p>
      ))}
    </div>
  );
}

function NetChart({ points }: { points: Point[] }) {
  const axis = { fontSize: 12, fill: "var(--muted-foreground)" };
  return (
    <div className="h-[200px]" role="img" aria-label="Running net result for each cover level over the replayed days. The table below has the same numbers.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => signed(v)} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" />
          <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
          {COVER_LEVELS.map((level) => (
            <Line
              key={level}
              type="linear"
              dataKey={level}
              stroke={STROKE[level]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: STROKE[level], stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: STROKE[level], stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const th = "pb-2 text-right text-[12px] font-medium text-muted-foreground";
const td = "py-2 text-right text-[13px]";

function Cost({ day }: { day: ReplayDay | undefined }) {
  if (!day) return <span className="text-muted-foreground/70">n/a</span>;
  return (
    <>
      {day.estimated ? (
        <span className="mr-2 align-middle">
          <Tag>Estimate</Tag>
        </span>
      ) : null}
      {formatUsd(day.cost)}
    </>
  );
}

function ReplayTable({ bill, replay }: { bill: BillKind; replay: ReplayData }) {
  const dates = [...new Set(COVER_LEVELS.flatMap((l) => replay[l].days.map((d) => d.date)))].sort();
  const find = (level: CoverLevel, date: string) => replay[level].days.find((d) => d.date === date);
  const settle = (date: string) => (find("spike", date) ?? find("full", date))!.settle;
  return (
    <table className="tabular w-full">
      <thead>
        <tr className="border-b border-border">
          <th className={`${th} text-left`} rowSpan={2}>
            Day
          </th>
          <th className={th} rowSpan={2}>
            {COPY[bill].commodity.replace(/^./, (c) => c.toUpperCase())} at close
          </th>
          {COVER_LEVELS.map((level) => (
            <th key={level} className={`${th} border-l border-border pl-4`} colSpan={2}>
              <Key level={level} /> <span className="ml-1">{LEVEL_NAMES[level]}</span>
            </th>
          ))}
        </tr>
        <tr className="border-b border-border">
          {COVER_LEVELS.flatMap((level) => [
            <th key={`${level}-cost`} className={`${th} border-l border-border pl-4`}>
              Cost
            </th>,
            <th key={`${level}-paid`} className={th}>
              Paid
            </th>,
          ])}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {dates.map((date) => (
          <tr key={date}>
            <td className={`${td} text-left`}>{dayLabel(date)}</td>
            <td className={td}>${formatLevel(settle(date))}</td>
            {COVER_LEVELS.flatMap((level) => {
              const day = find(level, date);
              return [
                <td key={`${level}-cost`} className={`${td} border-l border-border pl-4`}>
                  <Cost day={day} />
                </td>,
                <td key={`${level}-paid`} className={td}>
                  {day ? formatUsd(day.payout) : <span className="text-muted-foreground/70">n/a</span>}
                </td>,
              ];
            })}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-border font-medium">
          <td className={`${td} text-left`}>Total</td>
          <td />
          {COVER_LEVELS.flatMap((level) => [
            <td key={`${level}-cost`} className={`${td} border-l border-border pl-4`}>
              {formatUsd(replay[level].totals.cost)}
            </td>,
            <td key={`${level}-paid`} className={td}>
              {formatUsd(replay[level].totals.payout)}
            </td>,
          ])}
        </tr>
        <tr className="font-medium">
          <td className={`${td} text-left`}>Net</td>
          <td />
          {COVER_LEVELS.map((level) => (
            <td key={level} className={`${td} border-l border-border pl-4`} colSpan={2}>
              {signed(replay[level].totals.net)}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

interface Props {
  bill: BillKind;
  /** Dollars added to the monthly bill per $1 on the commodity, or null when it cannot be sized yet. */
  exposure: number | null;
}

/** What each cover level would have cost and paid over the last settled days. */
export function Replay({ bill, exposure }: Props) {
  const url = exposure ? `/api/bills/replay?underlying=${BILLS[bill].underlying}&dollarsPerPoint=${exposure.toFixed(4)}` : null;
  const { data, error, loading } = usePoll<ReplayData>(url);
  const points = data ? runningNet(data) : [];
  const hasDays = points.length > 0;

  return (
    <Card>
      <CardTitle hint={hasDays ? `Last ${points.length} days` : undefined}>How it would have done</CardTitle>
      <p className="mb-5 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Each day&rsquo;s cover is bought at that day&rsquo;s opening price and held until it closes at 22:00 UTC.
      </p>
      {!url || loading ? (
        <div className="space-y-3">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : error ? (
        <Notice>{error} Reload the page to try again.</Notice>
      ) : !data || !hasDays ? (
        <Notice>There are no settled days to replay yet. Check back after tonight&rsquo;s close.</Notice>
      ) : (
        <div className="arrive space-y-5">
          <p className="text-[14px] leading-relaxed">
            {COVER_LEVELS.map((level) => (
              <span key={level} className="mr-1">
                {LEVEL_NAMES[level]} would have cost {formatUsd(data[level].totals.cost)} and paid {formatUsd(data[level].totals.payout)}.
              </span>
            ))}
          </p>
          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="text-[13px] font-medium text-muted-foreground">Net after each day</p>
              <p className="flex gap-4 text-[12px] text-muted-foreground">
                {COVER_LEVELS.map((level) => (
                  <span key={level}>
                    <Key level={level} /> <span className="ml-1">{LEVEL_NAMES[level]}</span>
                  </span>
                ))}
              </p>
            </div>
            <NetChart points={points} />
          </div>
          <ReplayTable bill={bill} replay={data} />
          <p className="text-[12px] leading-relaxed text-muted-foreground/70">
            Costs come from traded prices where a trade happened and from an estimate elsewhere. Payouts are Gemini&rsquo;s real results.
          </p>
        </div>
      )}
    </Card>
  );
}
