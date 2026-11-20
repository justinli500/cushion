import { worthAtTime, type WorthPoint } from "./worth";

/** The chart's drawing space, matching the handoff's 800 by 180 box with its baseline at 150. */
export const BOX = { width: 800, height: 180, top: 12, base: 150, labelY: 172 } as const;

export interface WorthLayout {
  /** A step line: each worth holds until the next point, as each trade holds until the next. */
  path: string;
  /** Null when nothing was paid, which is the case for a cushion that has not been bought. */
  paidY: number | null;
  dots: { x: number; y: number }[];
  end: { x: number; y: number };
  ticks: { x: number; text: string }[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Turns worth over time into drawing coordinates. The floor is $0 and the ceiling just clears the
 * highest worth (or the amount paid). Null when there is not yet a stretch of time to draw.
 */
export function layoutWorth(input: {
  points: WorthPoint[];
  paid: number | null;
  /** Times of the plays to mark with a dot. */
  dotTimes: number[];
  ticks: { t: number; text: string }[];
}): WorthLayout | null {
  const { points, paid, dotTimes, ticks } = input;
  if (points.length < 2) return null;
  const from = points[0].t;
  const to = points[points.length - 1].t;
  if (to <= from) return null;

  const peak = Math.max(1, paid ?? 0, ...points.map((p) => p.worth)) * 1.1;
  const x = (t: number) => round(((t - from) / (to - from)) * BOX.width);
  const y = (worth: number) => round(BOX.base - (worth / peak) * (BOX.base - BOX.top));

  let path = `M${x(points[0].t)} ${y(points[0].worth)}`;
  for (let i = 1; i < points.length; i++) path += ` H${x(points[i].t)} V${y(points[i].worth)}`;

  const inside = (t: number) => t >= from && t <= to;
  return {
    path,
    paidY: paid == null ? null : y(paid),
    dots: dotTimes.filter(inside).map((t) => ({ x: x(t), y: y(worthAtTime(points, t) ?? 0) })),
    end: { x: BOX.width, y: y(points[points.length - 1].worth) },
    ticks: ticks.filter((tick) => inside(tick.t)).map((tick) => ({ x: x(tick.t), text: tick.text })),
  };
}
