import { useId } from "react";

/** One body style, facing left, in a 400 by 150 box with the ground at y = 132. */
interface Shape {
  body: string;
  glass: string;
  /** Where the roof pillars cross the glass. */
  pillars: number[];
  /** Front and rear wheel centres along the car, and the wheel's radius. */
  wheels: [number, number];
  r: number;
  /** The crease along the side, from front to rear. */
  shoulder: string;
  /** Where the door seams run, top to bottom. */
  doors: string[];
  head: string;
  tail: string;
}

const SHAPES: Record<string, Shape> = {
  compact: {
    body: "M54 116 C50 104 54 91 66 87 C92 81 112 79 130 76 C148 58 168 46 194 44 L278 44 C304 46 326 62 338 84 C347 92 350 104 347 116 Z",
    glass: "M140 77 C155 61 172 52 195 50 L277 50 C297 52 314 64 324 78 Z",
    pillars: [214, 272],
    wheels: [114, 290],
    r: 24,
    shoulder: "M66 92 C120 84 250 84 338 90",
    doors: ["M160 79 L158 112", "M218 79 L218 113", "M274 79 L280 112"],
    head: "M58 96 C62 91 72 89 82 88 L78 95 C70 96 64 97 58 96 Z",
    tail: "M342 90 C346 94 348 98 348 103 L340 102 C340 98 340 94 342 90 Z",
  },
  sedan: {
    body: "M32 116 C28 102 34 92 46 88 C74 82 98 79 120 76 C142 58 166 46 196 44 L246 44 C280 46 304 60 322 74 L352 78 C366 80 371 96 368 116 Z",
    glass: "M130 77 C149 61 169 52 197 50 L245 50 C270 52 291 62 307 75 Z",
    pillars: [218, 268],
    wheels: [106, 296],
    r: 25,
    shoulder: "M46 93 C120 83 270 82 356 86",
    doors: ["M152 79 L150 113", "M220 79 L220 114", "M282 79 L288 113"],
    head: "M36 97 C40 92 50 90 60 89 L56 96 C48 97 42 98 36 97 Z",
    tail: "M360 86 C365 90 368 95 368 100 L358 99 C358 94 358 90 360 86 Z",
  },
  hybrid: {
    body: "M34 116 C30 104 36 94 48 90 C80 84 104 80 122 76 C146 54 174 42 206 42 C252 42 302 56 346 76 C362 80 369 96 366 116 Z",
    glass: "M134 77 C154 59 178 48 207 48 C247 48 291 60 328 77 Z",
    pillars: [222, 282],
    wheels: [106, 296],
    r: 24,
    shoulder: "M48 95 C120 84 270 82 352 86",
    doors: ["M156 79 L154 113", "M224 79 L224 114", "M290 79 L296 113"],
    head: "M38 99 C42 94 52 92 62 91 L58 98 C50 99 44 100 38 99 Z",
    tail: "M356 84 C362 88 366 94 366 100 L355 98 C355 93 355 88 356 84 Z",
  },
  suv: {
    body: "M30 116 C26 98 32 84 46 80 C72 74 100 72 120 70 C138 48 158 36 186 34 L300 34 C326 36 346 50 357 72 C367 80 371 98 368 116 Z",
    glass: "M131 71 C147 53 163 42 187 40 L298 40 C318 42 334 54 344 71 Z",
    pillars: [212, 276],
    wheels: [106, 296],
    r: 27,
    shoulder: "M46 86 C120 76 270 76 358 82",
    doors: ["M152 73 L150 112", "M214 73 L214 113", "M280 73 L288 112"],
    head: "M34 91 C38 85 50 83 62 82 L58 90 C50 91 42 92 34 91 Z",
    tail: "M360 80 C366 84 369 90 369 97 L358 95 C358 90 358 85 360 80 Z",
  },
  pickup: {
    body: "M28 118 C24 100 30 86 44 82 C70 77 96 74 118 72 C132 50 150 38 174 36 L232 36 C241 36 245 40 247 48 L251 72 L370 72 C374 72 376 76 376 80 L376 118 Z",
    glass: "M129 73 C141 55 155 44 175 42 L230 42 C236 42 239 45 240 50 L243 73 Z",
    pillars: [196],
    wheels: [102, 304],
    r: 28,
    shoulder: "M44 88 C120 80 240 80 374 82",
    doors: ["M150 75 L148 114", "M198 75 L198 115", "M252 74 L252 115"],
    head: "M32 93 C36 87 48 85 60 84 L56 92 C48 93 40 94 32 93 Z",
    tail: "M370 78 L376 78 L376 96 L370 96 Z",
  },
  sports: {
    body: "M26 118 C22 108 30 100 46 97 C92 91 132 88 162 84 C182 66 206 58 233 58 C263 58 293 66 320 82 C346 84 371 90 374 106 L374 118 Z",
    glass: "M174 85 C190 71 210 64 233 64 C257 64 283 70 303 83 Z",
    pillars: [246],
    wheels: [100, 304],
    r: 25,
    shoulder: "M46 102 C120 92 270 90 368 98",
    doors: ["M196 87 L192 116", "M262 87 L270 116"],
    head: "M30 105 C36 100 48 98 62 97 L56 104 C48 105 38 106 30 105 Z",
    tail: "M366 94 C371 97 374 101 374 106 L364 105 C364 101 364 97 366 94 Z",
  },
};

const GROUND = 132;
const SPOKES = [0, 72, 144, 216, 288];

/**
 * A car drawn from the side as a shaded studio render: paint that catches light along the top, dark
 * glass with a reflection, alloy wheels and a soft shadow on the floor. Decorative: the kind of car
 * is always written beside it.
 */
export function CarRender({ kind, className }: { kind: string; className?: string }) {
  const id = useId();
  const shape = SHAPES[kind] ?? SHAPES.sedan;
  const { r } = shape;
  const cy = GROUND - r;

  return (
    <svg viewBox="0 22 400 126" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}-paint`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.34" stopColor="#E4E9F1" />
          <stop offset="0.7" stopColor="#B4BECF" />
          <stop offset="1" stopColor="#7C89A3" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3A4B68" />
          <stop offset="1" stopColor="#0A1220" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#9AA6BA" />
        </linearGradient>
        <radialGradient id={`${id}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#0F1B2D" stopOpacity="0.28" />
          <stop offset="1" stopColor="#0F1B2D" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-body`}>
          <path d={shape.body} />
        </clipPath>
        <clipPath id={`${id}-pane`}>
          <path d={shape.glass} />
        </clipPath>
      </defs>

      <ellipse cx="200" cy={GROUND + 3} rx="185" ry="10" fill={`url(#${id}-floor)`} />

      <path d={shape.body} fill={`url(#${id}-paint)`} stroke="#8A96AD" strokeWidth="0.8" />
      {/* The wheel wells, cut into the body. */}
      <g clipPath={`url(#${id}-body)`}>
        {shape.wheels.map((cx) => (
          <circle key={cx} cx={cx} cy={cy} r={r + 5} fill="#0A1220" />
        ))}
        {/* The dark sill along the bottom, then the crease that catches the light. */}
        <rect x="0" y={GROUND - 20} width="400" height="20" fill="#0F1B2D" fillOpacity="0.5" />
        <path d={shape.shoulder} fill="none" stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="1.6" strokeLinecap="round" />
        <path d={shape.shoulder} fill="none" stroke="#5F6C85" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" transform="translate(0 2)" />
        {shape.doors.map((d) => (
          <path key={d} d={d} fill="none" stroke="#3A475C" strokeOpacity="0.55" strokeWidth="1" />
        ))}
      </g>

      <path d={shape.glass} fill={`url(#${id}-glass)`} />
      <g clipPath={`url(#${id}-pane)`}>
        <polygon points="150,30 196,30 150,90 104,90" fill="#FFFFFF" fillOpacity="0.2" />
        <polygon points="214,30 228,30 182,90 168,90" fill="#FFFFFF" fillOpacity="0.13" />
        {shape.pillars.map((x) => (
          <rect key={x} x={x - 3} y="20" width="6" height="80" fill="#C9D1DE" />
        ))}
      </g>

      <path d={shape.head} fill="#FFFFFF" stroke="#7D95FF" strokeWidth="1" />
      <path d={shape.tail} fill="#E5484D" />

      {shape.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r={r} fill="#111A2B" />
          <circle cx={cx} cy={cy} r={r - 6} fill={`url(#${id}-rim)`} />
          {SPOKES.map((angle) => (
            <rect key={angle} x={cx - 1.6} y={cy - r + 7} width="3.2" height={r - 9} fill="#3A475C" transform={`rotate(${angle} ${cx} ${cy})`} />
          ))}
          <circle cx={cx} cy={cy} r="4" fill="#3A475C" />
        </g>
      ))}
    </svg>
  );
}
