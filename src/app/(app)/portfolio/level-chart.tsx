"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
  /** The level cover should start at, and whether it then pays on a fall. */
  onStart: (level: number, falling: boolean) => void;
}

// Where the cushion pays: green for a rise, red for a fall. Drawn as a light wash at the same strength as the
// beige band, not as solid blocks, so the price line and the levels stay readable through it.
// From the theme: green and red in both modes, a little brighter in the dark.
const RISE = "var(--rise)";
const FALL = "var(--fall)";
const WASH = 0.15;
// Red is a darker colour than green and sits beside the warm beige band, so the same wash reads fainter. It gets more, to look as strong as the green.
const FALL_WASH = 0.26;

/** Two presses this close together count as a double-click. */
const DOUBLE_MS = 350;

/**
 * The price of what a holding moves with, and every level the market lets a cushion start at as a
 * line across it. The line snaps to the market's own levels because those are the only ones that
 * can be bought.
 *
 * The side of the price the line is on decides whether the cushion pays on a fall or a rise, and
 * that side is locked: a drag or the arrow keys only move the line nearer to or further from the
 * price. A double-click unlocks it. The line then follows the pointer across the price, and the
 * next release or click sets the side again.
 */
export function LevelChart({ history, chart, until, onStart }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastDown = useRef(0);
  // True between a double-click and the release or click that sets the side.
  const [unlocked, setUnlocked] = useState(false);
  const moved = useRef(false);
  const format = chart.unit === "index" ? formatLevel : formatPrice;
  const { falling, spot, start, end } = chart;

  const recent = (history ?? []).slice(-DAYS);
  const last = recent.at(-1)?.close;
  // History and levels can be quoted differently (a futures contract against a spot price). Far apart, the line would mislead.
  const closes = last != null && Math.abs(last / spot - 1) < 0.2 ? recent.map((p) => p.close) : [];
  const from = closes.length > 0 ? last! : spot;

  // Only levels within about a quarter of the price are drawn: a ladder can list ones so far out that the chart would flatten.
  const levels = chart.levels.filter((level) => level >= Math.min(end, spot * 0.75) && level <= Math.max(end, spot * 1.25));
  // The furthest level the cover reaches is not one the line can sit on, but the blue band runs to it.
  const low = Math.min(...closes, spot, ...levels, end);
  const high = Math.max(...closes, spot, ...levels, end);
  const pad = (high - low || 1) * 0.06;
  const y = (price: number) => BOTTOM - ((price - (low - pad)) / (high - low + 2 * pad)) * (BOTTOM - TOP);
  const x = (i: number) => LEFT + (closes.length > 1 ? i / (closes.length - 1) : 1) * (NOW - LEFT);

  const spacing = levels.length > 1 ? Math.abs(y(levels[0]) - y(levels[1])) : LABEL_GAP;
  const every = Math.max(1, Math.ceil(LABEL_GAP / Math.max(spacing, 1)));
  const covered = (level: number) => (falling ? level <= start && level >= end : level >= start && level <= end);

  // The levels a cover paying each way can start at, among those drawn. Past the last of them a drag simply stops there.
  const side = (fall: boolean) => (fall ? chart.fall : chart.rise).filter((level) => levels.includes(level));
  const sameSide = side(falling);

  const move = (event: PointerEvent, free: boolean) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const py = ((event.clientY - box.top) / box.height) * H;
    // Unlocked, the pointer picks the side by being above or below the price. Locked, the side stays as it is.
    const fall = free ? py > y(from) : falling;
    const among = side(fall).length > 0 ? side(fall) : sameSide;
    if (among.length === 0) return;
    const level = among.reduce((best, candidate) => (Math.abs(y(candidate) - py) < Math.abs(y(best) - py) ? candidate : best));
    const way = side(fall).length > 0 ? fall : falling;
    if (level !== start || way !== falling) onStart(level, way);
  };
  const keys = (event: KeyboardEvent) => {
    // Levels run from the highest down, so up the screen is one earlier in the list.
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const next = sameSide[sameSide.indexOf(start) + step];
    if (step === 0 || next == null) return;
    event.preventDefault();
    onStart(next, falling);
  };
  const down = (event: PointerEvent<SVGSVGElement>) => {
    const double = event.timeStamp - lastDown.current < DOUBLE_MS;
    lastDown.current = event.timeStamp;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (double && !unlocked) {
      moved.current = false;
      setUnlocked(true);
      return;
    }
    // A press while unlocked places the line on either side, and its release sets that side.
    if (unlocked) moved.current = true;
    move(event, unlocked);
  };
  const drag = (event: PointerEvent) => {
    if (unlocked) {
      // Unlocked, the line follows the pointer whether or not a button is held.
      moved.current = true;
      move(event, true);
    } else if (dragging.current) move(event, false);
  };
  const up = () => {
    dragging.current = false;
    // Releasing after choosing a side sets it. A double-click released without moving stays unlocked until the next click.
    if (unlocked && moved.current) setUnlocked(false);
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
      onPointerDown={down}
      onPointerMove={drag}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {/* The move before it starts paying, then the stretch it pays for. */}
      {gapHeight > 0 ? <rect x={LEFT} y={gapTop} width={RIGHT - LEFT} height={gapHeight} className="fill-risk-fill/15" /> : null}
      <rect x={LEFT} y={bandTop} width={RIGHT - LEFT} height={Math.max(bandHeight, 2)} fill={falling ? FALL : RISE} fillOpacity={falling ? FALL_WASH : WASH} />

      <line x1={NOW} y1={TOP} x2={NOW} y2={BOTTOM} className="stroke-border" strokeDasharray="2 5" />
      <text x={NOW - 6} y={H - 9} textAnchor="end" fontSize="12" className="fill-muted-foreground">
        {closes.length > 0 ? `Last ${closes.length} days` : "Now"}
      </text>
      <text x={RIGHT} y={H - 9} textAnchor="end" fontSize="12" className="fill-muted-foreground">
        to {until}
      </text>

      {unlocked ? (
        <text x={LEFT + 6} y={TOP - 4} fontSize="12" fontWeight="600" className="fill-covered">
          Move above or below the price to pick a side, then click to set it.
        </text>
      ) : null}

      {levels.map((level, i) =>
        level === start ? null : (
          <g key={level}>
            <line x1={LEFT} y1={y(level)} x2={RIGHT} y2={y(level)} className={covered(level) ? undefined : "stroke-border"} stroke={covered(level) ? (falling ? FALL : RISE) : undefined} strokeOpacity={covered(level) ? 0.45 : undefined} strokeWidth="1.5" strokeDasharray="5 5" />
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
          {/* The price itself, so the distance to the nearest level reads as a real one. */}
          <text x={NOW + 10} y={y(from) - 7} fontSize="12" fontWeight="600" className="tabular fill-foreground">
            {format(from)} now
          </text>
        </>
      ) : (
        <text x={LEFT + 8} y={TOP + 14} fontSize="13" className="fill-muted-foreground">
          {history ? "No price history to draw, so only the market's levels are shown." : "Loading price history…"}
        </text>
      )}

      <g role="slider" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={Math.min(...levels)} aria-valuemax={Math.max(...levels)} aria-valuenow={start} aria-valuetext={format(start)} onKeyDown={keys} className="outline-none [&:focus-visible>rect]:stroke-foreground">
        <line x1={LEFT} y1={y(start)} x2={RIGHT} y2={y(start)} className="stroke-primary" strokeWidth="3" strokeDasharray={unlocked ? "10 6" : undefined} />
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
