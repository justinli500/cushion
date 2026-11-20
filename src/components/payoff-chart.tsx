"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/lib/chart-colors";
import { formatPrice, formatUsd, formatUsdWhole } from "@/lib/format";

export interface PayoffPoint {
  price: number;
  /** Gain or loss in dollars with no cushion. */
  without: number;
  /** Gain or loss with the cushion, after its cost. Null until there is a live quote. */
  withCushion: number | null;
}

interface Props {
  points: PayoffPoint[];
  /** Where the market expects the price to finish. */
  spot: number;
  /** Plain name of the thing on the x-axis, e.g. "Bitcoin". */
  name: string;
}

/** Round tick values (1, 2, 2.5 or 5 times a power of ten) inside the range. */
function niceTicks(lo: number, hi: number, target = 5): number[] {
  const rough = (hi - lo) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let tick = Math.ceil(lo / step) * step; tick <= hi; tick += step) ticks.push(Number(tick.toPrecision(12)));
  return ticks;
}

const WITH = CHART.first;
const WITHOUT = CHART.second;

/** What the holding gains or loses across closing prices, with and without the cushion. */
export function PayoffChart({ points, spot, name }: Props) {
  const quoted = points.some((p) => p.withCushion != null);
  const ticks = points.length > 1 ? niceTicks(points[0].price, points[points.length - 1].price) : undefined;
  return (
    <figure>
      <figcaption className="mb-3 flex items-center gap-5 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" stroke={WITHOUT} strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          Without a cushion
        </span>
        {quoted ? (
          <span className="flex items-center gap-2">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke={WITH} strokeWidth="2" />
            </svg>
            With the cushion, after its cost
          </span>
        ) : null}
      </figcaption>
      <div className="h-[280px]" role="img" aria-label={`Gain or loss across ${name} closing prices, with and without the cushion`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value: number) => formatPrice(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              ticks={ticks}
            />
            <YAxis
              tickFormatter={(value: number) => formatUsdWhole(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" />
            <ReferenceLine
              x={spot}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 4"
              label={{ value: "Expected close", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)" }}
              contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 13, color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              labelFormatter={(price) => `${name} closes at ${formatPrice(Number(price))}`}
              formatter={(value, key) => [formatUsd(Number(value)), key === "without" ? "Without a cushion" : "With the cushion"]}
            />
            <Line dataKey="without" stroke={WITHOUT} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="withCushion" stroke={WITH} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
