"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { PricePoint } from "@/domains/exposure/portfolio";
import type { ScenarioChart } from "@/domains/exposure/portfolio-scenarios";
import { formatLevel, formatPrice } from "@/lib/format";

// The drawing, in SVG units. History fills the left of the plot; the stretch to the right of "now" runs to the market's close.
// Sized near the column it sits in, so its 12px labels are drawn at about 12px.
const W = 580;
const H = 330;
const LEFT = 8;
const RIGHT = W - 88;
const TOP = 18;
const BOTTOM = H - 30;
const NOW = LEFT + (RIGHT - LEFT) * 0.74;
const DAYS = 90;
/** Level labels closer than this would overlap, so only every few are written. */
const LABEL_GAP = 17;

interface Props {
  /** Daily closes, oldest first. Undefined while they load. */
  history: PricePoint[] | undefined;
  chart: ScenarioChart;
  /** "Nov 30": when the market behind the levels closes. */
  until: string;
  onStart: (level: number) => void;
}

/**
 * The price of what a holding moves with, and every level the market lets a cushion start at as a
 * line across it. The chosen line can be dragged, pressed, or moved with the arrow keys; it snaps
 * to the market's own levels because those are the only ones that can be bought.
 */
export function LevelChart({ history, chart, until, onStart }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const format = chart.unit === "index" ? formatLevel : formatPrice;
  const { falling, spot, start, end } = chart;

  const recent = (history ?? []).slice(-DAYS);
  const last = recent.at(-1)?.close;
  // History and levels can be quoted differently (a futures contract against a spot price). Far apart, the line would mislead.
  const closes = last != null && Math.abs(last / spot - 1) < 0.2 ? recent.map((p) => p.close) : [];
  const from = closes.length > 0 ? last! : spot;

  // Only levels within about a quarter of the price are drawn: a ladder can list ones so far out that the chart would flatten.
  const levels = chart.levels.filter((level) => level >= Math.min(end, spot * 0.75) && level <= Math.max(end, spot * 1.25));
  const low = Math.min(...closes, spot, ...levels);
  const high = Math.max(...closes, spot, ...levels);
  const pad = (high - low || 1) * 0.06;
  const y = (price: number) => BOTTOM - ((price - (low - pad)) / (high - low + 2 * pad)) * (BOTTOM - TOP);
  const x = (i: number) => LEFT + (closes.length > 1 ? i / (closes.length - 1) : 1) * (NOW - LEFT);

  const spacing = levels.length > 1 ? Math.abs(y(levels[0]) - y(levels[1])) : LABEL_GAP;
  const every = Math.max(1, Math.ceil(LABEL_GAP / Math.max(spacing, 1)));
  const at = levels.indexOf(start);
  const covered = (level: number) => (falling ? level <= start && level >= end : level >= start && level <= end);

  /** The listed level nearest to where the pointer is. */
  const levelAt = (clientY: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || levels.length === 0) return null;
    const py = ((clientY - box.top) / box.height) * H;
    return levels.reduce((best, level) => (Math.abs(y(level) - py) < Math.abs(y(best) - py) ? level : best));
  };
  const move = (event: PointerEvent) => {
    const level = levelAt(event.clientY);
    if (level != null && level !== start) onStart(level);
  };
  const keys = (event: KeyboardEvent) => {
    // Levels run from the highest down, so up the screen is one earlier in the list.
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const next = levels[at + step];
    if (step === 0 || next == null) return;
    event.preventDefault();
    onStart(next);
  };

  const line = closes.map((close, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(close).toFixed(1)}`).join(" ");
  const bandTop = Math.min(y(start), y(end));
  const bandHeight = Math.abs(y(start) - y(end));
  const gapTop = Math.min(y(from), y(start));
  const gapHeight = Math.abs(y(from) - y(start));
  const label = `Where your cushion starts paying: ${format(start)}`;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-ns-resize touch-none select-none"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={(event) => (dragging.current ? move(event) : undefined)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {/* The move before it starts paying, then the stretch it pays for. */}
      {gapHeight > 0 ? <rect x={LEFT} y={gapTop} width={RIGHT - LEFT} height={gapHeight} className="fill-risk-fill/15" /> : null}
      <rect x={LEFT} y={bandTop} width={RIGHT - LEFT} height={Math.max(bandHeight, 2)} className="fill-primary/12" />

      <line x1={NOW} y1={TOP} x2={NOW} y2={BOTTOM} className="stroke-border" strokeDasharray="2 5" />
      <text x={NOW - 6} y={H - 9} textAnchor="end" fontSize="12" className="fill-muted-foreground">
        {closes.length > 0 ? `Last ${closes.length} days` : "Now"}
      </text>
      <text x={RIGHT} y={H - 9} textAnchor="end" fontSize="12" className="fill-muted-foreground">
        to {until}
      </text>

      {levels.map((level, i) =>
        level === start ? null : (
          <g key={level}>
            <line x1={LEFT} y1={y(level)} x2={RIGHT} y2={y(level)} className={covered(level) ? "stroke-primary/45" : "stroke-border"} strokeWidth="1.5" strokeDasharray="5 5" />
            {i % every === 0 && Math.abs(y(level) - y(start)) >= LABEL_GAP ? (
              <text x={RIGHT + 8} y={y(level) + 4} fontSize="12" className="tabular fill-muted-foreground">
                {format(level)}
              </text>
            ) : null}
          </g>
        ),
      )}

      {closes.length > 1 ? (
        <>
          <path d={line} fill="none" className="stroke-foreground" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={NOW} cy={y(from)} r="5" className="fill-foreground" />
        </>
      ) : (
        <text x={LEFT + 8} y={TOP + 14} fontSize="13" className="fill-muted-foreground">
          {history ? "No price history to draw, so only the market's levels are shown." : "Loading price history…"}
        </text>
      )}

      <g role="slider" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={Math.min(...levels)} aria-valuemax={Math.max(...levels)} aria-valuenow={start} aria-valuetext={format(start)} onKeyDown={keys} className="outline-none [&:focus-visible>rect]:stroke-foreground">
        <line x1={LEFT} y1={y(start)} x2={RIGHT} y2={y(start)} className="stroke-primary" strokeWidth="3" />
        <rect x={RIGHT - 2} y={y(start) - 14} width={88} height={28} rx={14} className="fill-primary" strokeWidth="2.5" />
        <text x={RIGHT + 43} y={y(start) + 4.5} textAnchor="middle" fontSize="13" fontWeight="700" className="tabular fill-primary-foreground">
          {format(start)}
        </text>
        {/* A grip, so the line reads as something to drag. */}
        <rect x={(LEFT + NOW) / 2 - 16} y={y(start) - 7} width={32} height={14} rx={7} className="fill-card stroke-primary" strokeWidth="2.5" />
        <path d={`M${(LEFT + NOW) / 2 - 6} ${y(start) - 2} h12 M${(LEFT + NOW) / 2 - 6} ${y(start) + 2} h12`} className="stroke-primary" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
