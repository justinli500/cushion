import type { ReactNode } from "react";
import { Card, CardTitle, Notice, Tag } from "@/components/kit";
import { BOX, layoutWorth } from "@/domains/replay/worth-chart";
import { formatUsd } from "@/lib/format";
import type { WorthData, WorthTile } from "./use-worth";

const signed = (change: number) => `${change < 0 ? "−" : "+"}${formatUsd(Math.abs(change))}`;

interface Props {
  data: WorthData;
  /** What the person paid, drawn as the dashed line. Null for a cushion that is not bought yet. */
  paid: number | null;
  /** True when the chart shows a cushion the person has not bought. */
  example: boolean;
  /** A line under the title saying what is charted. */
  caption: string | null;
  /** Shown instead of the chart when there is nothing to chart. */
  empty?: string;
}

/** "What your cushion is worth, play by play": the worth over time, the paid line, and what each score did to it. */
export function WorthCard({ data, paid, example, caption, empty }: Props) {
  const layout = empty ? null : layoutWorth({ points: data.points, paid, dotTimes: data.dotTimes, ticks: data.ticks });
  const first = data.points[0];
  const last = data.points[data.points.length - 1];

  return (
    <Card>
      <CardTitle hint={example ? <Tag tone="note">Not bought yet</Tag> : paid != null ? `You paid ${formatUsd(paid)}` : undefined}>
        What your cushion is worth, play by play
      </CardTitle>
      {caption ? <p className="-mt-2 mb-4 text-[14px] leading-relaxed text-muted-foreground">{caption}</p> : null}

      {layout ? (
        <svg
          role="img"
          aria-label={`Cushion worth went from ${formatUsd(first.worth)} to ${formatUsd(last.worth)} over the game so far.`}
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          className="block h-auto w-full overflow-visible"
        >
          <line x1="0" y1={BOX.base} x2={BOX.width} y2={BOX.base} className="stroke-track" strokeWidth="1.5" />
          {layout.paidY != null ? <line x1="0" y1={layout.paidY} x2={BOX.width} y2={layout.paidY} className="stroke-border" strokeWidth="1.5" strokeDasharray="4 6" /> : null}
          <path d={layout.path} fill="none" className="stroke-primary" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          {layout.dots.map((dot) => (
            <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r="6" className="fill-card stroke-foreground" strokeWidth="2.5" />
          ))}
          <circle cx={layout.end.x} cy={layout.end.y} r="7" className="fill-primary" />
          {layout.ticks.map((tick) => (
            <text key={`${tick.x}-${tick.text}`} x={tick.x} y={BOX.labelY} textAnchor={tick.x > 760 ? "end" : "start"} fontSize="12" className="fill-muted-foreground">
              {tick.text}
            </text>
          ))}
          {layout.paidY != null && paid != null ? (
            <text x="8" y={layout.paidY - 8} fontSize="12" className="fill-muted-foreground">
              Paid {formatUsd(paid)}
            </text>
          ) : null}
        </svg>
      ) : (
        <Notice>{empty ?? data.note}</Notice>
      )}

      {data.tiles.length > 0 ? (
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
          {data.tiles.map((tile) => (
            <Event key={tile.id} tile={tile} held={!example} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Event({ tile, held }: { tile: WorthTile; held: boolean }) {
  const { change } = tile;
  let line: ReactNode;
  if (change == null) line = <span className="text-muted-foreground">Change in worth not tracked</span>;
  else if (change === 0) line = <span className="text-muted-foreground">{held ? "Cushion unchanged" : "Would be unchanged"}</span>;
  else line = <span className={change > 0 ? "text-covered" : "text-risk"}>{held ? "Cushion" : "Would be"} {signed(change)}</span>;

  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-muted px-3.5 py-3">
      <span className="text-[12px] text-muted-foreground">{tile.when}</span>
      <span className="line-clamp-2 text-[14px] font-semibold">{tile.text}</span>
      <span className="tabular text-[13px] font-semibold">{line}</span>
    </div>
  );
}
