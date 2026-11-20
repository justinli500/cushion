import { cents, type Move } from "@/domains/feed/news";

const W = 640;
const TOP = 34;
const BOTTOM = 92;

/** The day's traded prices as one line on the dark hero. Drawn only from real candles. */
export function Sparkline({ move }: { move: Move }) {
  const { points } = move;
  const t0 = points[0].t;
  const span = points[points.length - 1].t - t0 || 1;
  const prices = points.map((p) => p.p);
  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  const x = (t: number) => ((t - t0) / span) * W;
  const y = (p: number) => BOTTOM - ((BOTTOM - TOP) * (p - low)) / (high - low || 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.p).toFixed(1)}`).join(" ");
  const endY = y(move.to);

  return (
    <svg
      role="img"
      aria-label={`Yes price went from ${cents(move.from)} cents to ${cents(move.to)} cents over the last day`}
      viewBox={`0 0 ${W} 110`}
      className="block h-auto w-full max-w-[640px]"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" className="text-covered-on-dark" />
      <circle cx={W} cy={endY} r={6} className="fill-covered-on-dark" />
      <text x={0} y={108} fontSize={12} className="fill-panel-foreground">
        {cents(move.from)}¢ a day ago
      </text>
      <text x={W} y={Math.max(14, endY - 12)} textAnchor="end" fontSize={12} className="fill-white">
        {cents(move.to)}¢ now
      </text>
    </svg>
  );
}
