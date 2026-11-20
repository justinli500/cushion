import { useId } from "react";

type Box = [x: number, y: number, w: number, h: number];

/** One kind of home, seen from the front in a 400 by 250 box with the ground at y = 215. */
interface Shape {
  walls: Box[];
  /** Roofs and parapets, as polygon points. */
  roofs: string[];
  chimneys: Box[];
  windows: Box[];
  door: Box;
  /** Neighbouring buildings, drawn faintly behind. */
  beside?: Box[];
}

const rows = (xs: number[], ys: number[], w: number, h: number): Box[] => ys.flatMap((y) => xs.map((x): Box => [x, y, w, h]));

const SHAPES: Record<string, Shape> = {
  apartment: {
    walls: [[140, 44, 120, 171]],
    roofs: ["134,36 266,36 266,46 134,46"],
    chimneys: [],
    windows: [...rows([154, 188, 222], [58, 83, 108, 133, 158], 24, 16), [154, 183, 24, 16], [222, 183, 24, 16]],
    door: [190, 181, 20, 34],
  },
  townhouse: {
    walls: [[158, 72, 84, 143]],
    roofs: ["150,74 200,36 250,74"],
    chimneys: [[222, 44, 12, 26]],
    windows: [...rows([172, 206], [88, 128], 22, 26), [206, 172, 22, 26]],
    door: [172, 175, 22, 40],
    beside: [[90, 92, 68, 123], [242, 92, 68, 123]],
  },
  house: {
    walls: [[112, 122, 176, 93]],
    roofs: ["96,124 200,60 304,124"],
    chimneys: [[244, 70, 16, 36]],
    windows: [[132, 150, 38, 32], [230, 150, 38, 32], [188, 94, 24, 20]],
    door: [189, 173, 22, 42],
  },
  large: {
    walls: [[72, 112, 256, 103]],
    roofs: ["58,114 200,50 342,114"],
    chimneys: [[104, 62, 16, 40], [280, 62, 16, 40]],
    windows: [...rows([90, 138, 236, 284], [126], 26, 26), [187, 124, 26, 28], ...rows([90, 138, 236, 284], [170], 26, 30)],
    door: [188, 168, 24, 47],
  },
};

const GROUND = 215;
const COLD = [42, 58, 86];
const WARM = [255, 198, 92];

/**
 * A home at dusk whose windows show how warm it is kept: dark and blue when the heating is low,
 * glowing amber when it is high. Snow falls harder in a harder winter. Decorative: the kind of
 * home and the thermostat setting are always written beside it.
 */
export function HomeRender({ kind, warmth, snow = 0, className }: { kind: string; warmth: number; snow?: number; className?: string }) {
  const id = useId();
  const shape = SHAPES[kind] ?? SHAPES.house;
  const heat = Math.min(1, Math.max(0, warmth));
  const glass = `rgb(${COLD.map((c, i) => Math.round(c + (WARM[i] - c) * heat)).join(",")})`;
  const rect = ([x, y, w, h]: Box, key: string, props: object) => <rect key={key} x={x} y={y} width={w} height={h} {...props} />;
  // Scattered by a fixed rule, so the same winter always looks the same.
  const flakes = Array.from({ length: Math.round(snow * 18) }, (_, i) => [(i * 97) % 400, (i * 53) % 205, 1.2 + (i % 3) * 0.6] as const);

  return (
    <svg viewBox="0 0 400 250" aria-hidden className={className}>
      <defs>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D9DFEA" />
          <stop offset="1" stopColor="#B4BECF" />
        </linearGradient>
      </defs>

      {/* The ground under the home, then the light its windows throw on it. */}
      <ellipse cx="200" cy={GROUND + 4} rx="170" ry="16" fill="#18263D" />
      <ellipse cx="200" cy={GROUND + 6} rx="150" ry="14" fill="#FFC65C" opacity={heat * 0.16} />

      {shape.beside?.map((box, i) => rect(box, `beside-${i}`, { fill: "#2A3A56", opacity: 0.6 }))}
      {shape.chimneys.map((box, i) => rect(box, `chimney-${i}`, { fill: "#8E9AB0" }))}
      {shape.walls.map((box, i) => rect(box, `wall-${i}`, { fill: `url(#${id}-wall)` }))}
      {shape.roofs.map((points) => (
        <polygon key={points} points={points} fill="#4A5B79" />
      ))}

      <g filter={`url(#${id}-glow)`} opacity={heat * 0.95}>
        {shape.windows.map((box, i) => rect(box, `glow-${i}`, { fill: "#FFB347" }))}
      </g>
      {shape.windows.map((box, i) => rect(box, `window-${i}`, { fill: glass, rx: 2, stroke: "#8E9AB0", strokeWidth: 1.5 }))}
      {rect(shape.door, "door", { fill: "#18263D", rx: 2 })}

      {flakes.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="#FFFFFF" opacity="0.75" />
      ))}
    </svg>
  );
}
