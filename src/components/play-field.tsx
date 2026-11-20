import { firstDownLine, scoreWord, type FieldNow } from "@/domains/scores/field";

interface Side {
  abbr: string;
  logo?: string | null;
}

// The drawing, in SVG units. The field is a trapezoid, wider toward the viewer, with a 10-yard end zone at each end.
const W = 720;
const H = 196;
const TOP = 40;
const DEPTH = 136;
const HALF_TOP = 250;
const HALF_BOTTOM = 352;
/** How far down the field's depth the play is drawn. */
const LANE = 0.62;

/** A point on the field: `yard` from -10 to 110 along its length, `depth` from 0 (far side) to 1 (near side). */
const x = (yard: number, depth: number) => W / 2 + ((yard + 10) / 120 - 0.5) * 2 * (HALF_TOP + (HALF_BOTTOM - HALF_TOP) * depth);
const y = (depth: number) => TOP + depth * DEPTH;
const band = (from: number, to: number) => `${x(from, 0)},${y(0)} ${x(to, 0)},${y(0)} ${x(to, 1)},${y(1)} ${x(from, 1)},${y(1)}`;

const GAINS = /rush|reception|sack|scramble|touchdown/i;
const KICKS = /punt|kickoff/i;
const CONFETTI = ["fill-white", "fill-covered-on-dark", "fill-risk-fill"];

/**
 * Not on any page right now: it was taken off the game screen and is kept for later. To bring it
 * back, render `<PlayField field={fieldNow(plays)} home={...} away={...} />` where plays are shown;
 * the saved game and ESPN's live football feed already carry the field position it needs.
 *
 * The playing field for a football game: where the ball is, the line to gain, and the last play
 * drawn from where it started to where it ended. The home team defends the left end zone.
 */
export function PlayField({ field, home, away }: { field: FieldNow; home: Side; away: Side }) {
  const scored = field.scoring ? scoreWord(field.kind) : null;
  const firstDown = firstDownLine(field, home.abbr);
  const withBall = field.possession === away.abbr ? away : field.possession === home.abbr ? home : null;
  // A score ends on a goal line: carry the marker into that end zone.
  const end = scored && field.to >= 100 ? 105 : scored && field.to <= 0 ? -5 : Math.max(-9, Math.min(109, field.to));
  const start = Math.max(-9, Math.min(109, field.from));
  const moved = Math.abs(end - start) >= 1;
  const toward = end >= start ? 1 : -1;
  const [down, spot] = field.situation?.split(" at ") ?? [];
  const gain = GAINS.test(field.kind) && field.yards !== 0 ? `${field.yards > 0 ? "+" : "−"}${Math.abs(field.yards)} ${Math.abs(field.yards) === 1 ? "yard" : "yards"}` : null;
  const lane = y(LANE);
  const tip = x(end, LANE);
  // A gain of a yard or two leaves no room for a shaft between the start dot and the arrowhead.
  const shaft = Math.abs(tip - x(start, LANE)) > 24;

  return (
    <figure className="flex flex-col gap-3 rounded-[28px] bg-panel p-5 text-white">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="display flex flex-wrap items-baseline gap-x-2.5 text-[26px] font-bold leading-none tracking-[-0.02em]">
          {down ? (
            <>
              <span>{down}</span>
              <span className="text-[17px] font-semibold text-panel-foreground">at {spot}</span>
            </>
          ) : (
            <span>{scored ?? field.kind}</span>
          )}
        </p>
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          {scored ? (
            <span className="arrive rounded-full bg-risk-fill px-3 py-1 text-panel">{withBall ? `${withBall.abbr} score` : scored}</span>
          ) : (
            <span className="text-panel-foreground">{[field.kind, gain].filter(Boolean).join(" · ")}</span>
          )}
        </p>
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${field.situation ?? scored ?? field.kind}. Last play: ${field.text}`} className="w-full">
        <polygon points={band(-10, 110)} className="fill-panel-tile" />
        {[10, 30, 50, 70, 90].map((yard) => (
          <polygon key={yard} points={band(yard, yard + 10)} className="fill-white/[0.035]" />
        ))}
        <polygon points={band(-10, 0)} className={scored && end < 0 ? "fill-primary" : "fill-panel-track"} />
        <polygon points={band(100, 110)} className={scored && end > 100 ? "fill-primary" : "fill-panel-track"} />
        <EndZoneName abbr={home.abbr} yard={-5} turn={-90} />
        <EndZoneName abbr={away.abbr} yard={105} turn={90} />

        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((yard) => (
          <line key={yard} x1={x(yard, 0)} y1={y(0)} x2={x(yard, 1)} y2={y(1)} className={yard % 100 === 0 ? "stroke-panel-foreground" : "stroke-white/15"} strokeWidth={yard % 100 === 0 ? 2 : 1} />
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yard) => (
          <text key={yard} x={x(yard, 0.17)} y={y(0.17) + 4} textAnchor="middle" className="fill-white/40 text-[11px] font-semibold">
            {Math.min(yard, 100 - yard)}
          </text>
        ))}
        <Goalpost yard={-10} />
        <Goalpost yard={110} />

        {firstDown != null ? <line x1={x(firstDown, 0)} y1={y(0)} x2={x(firstDown, 1)} y2={y(1)} className="stroke-risk-fill" strokeWidth="3" /> : null}
        {field.down != null ? <line x1={x(end, 0)} y1={y(0)} x2={x(end, 1)} y2={y(1)} className="stroke-white" strokeWidth="3" /> : null}

        {/* Keyed by the play, so each new one draws itself in. */}
        <g key={`${field.from}-${field.to}-${field.text}`} className="arrive">
          {scored
            ? Array.from({ length: 22 }, (_, i) => {
                // Scattered by a fixed rule so the same play always looks the same.
                const cx = tip + (((i * 53) % 150) - 75);
                const cy = y(0) + ((i * 37) % DEPTH);
                return <rect key={i} x={cx} y={cy} width="7" height="3.5" rx="1" transform={`rotate(${(i * 47) % 180} ${cx} ${cy})`} className={CONFETTI[i % 3]} />;
              })
            : null}
          {moved ? (
            <>
              {shaft ? <line x1={x(start, LANE)} y1={lane} x2={tip - toward * 9} y2={lane} className="stroke-covered-on-dark" strokeWidth="4" strokeLinecap="round" strokeDasharray={KICKS.test(field.kind) ? "3 9" : undefined} /> : null}
              <polygon points={`${tip},${lane} ${tip - toward * 12},${lane - 7} ${tip - toward * 12},${lane + 7}`} className="fill-covered-on-dark" />
              {shaft ? <circle cx={x(start, LANE)} cy={lane} r="5.5" className="fill-white" /> : null}
            </>
          ) : (
            <circle cx={tip} cy={lane} r="5.5" className="fill-white" />
          )}
          <path d={`M${tip} ${lane - 9} l-8 -12 h16 z`} className="fill-white" />
          <circle cx={tip} cy={lane - 36} r="17" className="fill-white" />
          {withBall?.logo ? (
            <image href={withBall.logo} x={tip - 12} y={lane - 48} width="24" height="24" />
          ) : (
            <text x={tip} y={lane - 32} textAnchor="middle" className="fill-panel text-[10px] font-bold">
              {withBall?.abbr ?? ""}
            </text>
          )}
        </g>
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[13px] text-panel-foreground">
        <p className="min-w-0 flex-[1_1_320px] truncate" title={field.text}>
          {field.text}
        </p>
        <p className="flex shrink-0 items-center gap-4">
          <Key className="bg-white">Ball</Key>
          <Key className="bg-risk-fill">First down</Key>
          <Key className="bg-covered-on-dark">Last play</Key>
        </p>
      </div>
    </figure>
  );
}

function Key({ className, children }: { className: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`h-[3px] w-4 rounded-full ${className}`} />
      {children}
    </span>
  );
}

function EndZoneName({ abbr, yard, turn }: { abbr: string; yard: number; turn: number }) {
  const cx = x(yard, 0.5);
  const cy = y(0.5);
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" transform={`rotate(${turn} ${cx} ${cy})`} className="display fill-white/70 text-[15px] font-bold tracking-[0.12em]">
      {abbr}
    </text>
  );
}

/** A goalpost standing on the back line of an end zone. */
function Goalpost({ yard }: { yard: number }) {
  const px = x(yard, 0.5);
  const base = y(0.5);
  return <path d={`M${px} ${base} v-34 M${px - 11} ${base - 34} h22 M${px - 11} ${base - 34} v-20 M${px + 11} ${base - 34} v-20`} fill="none" className="stroke-risk-fill" strokeWidth="2.5" strokeLinecap="round" />;
}
