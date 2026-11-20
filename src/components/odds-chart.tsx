"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { OddsPoint } from "@/domains/scores/series";
import { CHART } from "@/lib/chart-colors";
import { formatChance } from "@/lib/format";
import { Notice } from "./kit";

// Fixed by side, not by who the person roots for, so a line keeps its color when they switch teams.
const HOME = CHART.first;
const AWAY = CHART.second;

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const formatClock = (t: number) => clock.format(t);
const formatPercent = (p: number) => `${Math.round(p * 100)}%`;

const MINUTE = 60_000;
const STEPS = [5, 10, 15, 30, 60, 120, 180, 360, 720].map((m) => m * MINUTE);

/** Round clock times (7:30, 8:00) instead of whatever the data's first timestamp happens to be. */
function timeTicks(min: number, max: number): number[] {
  const step = STEPS.find((s) => (max - min) / s <= 5) ?? STEPS[STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);
  return ticks;
}

interface Props {
  points: OddsPoint[];
  home: string;
  away: string;
  /** A label saying what kind of numbers these are, such as "Traded prices". */
  tag: ReactNode;
}

/** Each team's chance of winning over time, as two step lines. Used by the live game screen and the replay. */
export function OddsChart({ points, home, away, tag }: Props) {
  const last = points[points.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <LegendItem color={AWAY} name={away} value={last?.away ?? null} />
          <LegendItem color={HOME} name={home} value={last?.home ?? null} />
        </ul>
        {tag}
      </div>

      {points.length < 2 ? (
        <Notice>Nothing has traded yet to draw. The lines appear as the market moves.</Notice>
      ) : (
        <div className="h-[260px]" role="img" aria-label={`${home} and ${away} chance of winning over time`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={timeTicks(points[0].t, last.t)}
                tickFormatter={formatClock}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickMargin={8}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={formatPercent}
                width={44}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={(props) => <Readout {...props} home={home} away={away} />}
              />
              <Line dataKey="home" type="stepAfter" stroke={HOME} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
              <Line dataKey="away" type="stepAfter" stroke={AWAY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
              {last.home != null ? <ReferenceDot x={last.t} y={last.home} r={4} fill={HOME} stroke="var(--card)" strokeWidth={2} ifOverflow="visible" /> : null}
              {last.away != null ? <ReferenceDot x={last.t} y={last.away} r={4} fill={AWAY} stroke="var(--card)" strokeWidth={2} ifOverflow="visible" /> : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {points.length >= 2 ? (
        <details className="mt-3 text-[13px] text-muted-foreground">
          <summary className="press cursor-pointer select-none hover:text-foreground">Show the numbers</summary>
          <table className="tabular mt-2 w-full text-left">
            <thead>
              <tr className="text-muted-foreground/70">
                <th className="py-1 font-normal">Time</th>
                <th className="py-1 font-normal">{away}</th>
                <th className="py-1 font-normal">{home}</th>
              </tr>
            </thead>
            <tbody>
              {points
                .slice(-8)
                .reverse()
                .map((p) => (
                  <tr key={p.t}>
                    <td className="py-0.5">{formatClock(p.t)}</td>
                    <td className="py-0.5">{formatChance(p.away)}</td>
                    <td className="py-0.5">{formatChance(p.home)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

function LegendItem({ color, name, value }: { color: string; name: string; value: number | null }) {
  return (
    <li className="flex items-center gap-2 text-[13px]">
      <span className="h-[2px] w-4 rounded-full" style={{ background: color }} aria-hidden />
      <span className="text-muted-foreground">{name}</span>
      <span className="tabular font-medium text-foreground">{value == null ? "No price" : formatChance(value)}</span>
    </li>
  );
}

function Readout({ active, payload, home, away }: TooltipContentProps & { home: string; away: string }) {
  const point = payload?.[0]?.payload as OddsPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-[13px] shadow-sm">
      <p className="mb-1 text-muted-foreground/70">{formatClock(point.t)}</p>
      <ReadoutRow color={AWAY} name={away} value={point.away} />
      <ReadoutRow color={HOME} name={home} value={point.home} />
    </div>
  );
}

function ReadoutRow({ color, name, value }: { color: string; name: string; value: number | null }) {
  return (
    <p className="flex items-center gap-2">
      <span className="h-[2px] w-3 rounded-full" style={{ background: color }} aria-hidden />
      <span className="tabular font-medium text-foreground">{formatChance(value)}</span>
      <span className="text-muted-foreground">{name}</span>
    </p>
  );
}
