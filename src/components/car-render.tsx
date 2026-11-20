import { cn } from "@/lib/utils";

/**
 * The kinds of car there is a render for, each a file in /public/cars. The renders are 3D models
 * from Grab3D (grab3d.com), published under CC0, so they need no permission or credit.
 */
const RENDERS = new Set(["compact", "sedan", "hybrid", "suv", "pickup", "sports"]);

/**
 * A kind of car as a studio render, seen from the front three-quarter with a transparent
 * background. Decorative: the kind of car is always written beside it.
 */
export function CarRender({ kind, className }: { kind: string; className?: string }) {
  const file = RENDERS.has(kind) ? kind : "sedan";
  return (
    // A plain <img>: six small files of this app's own, with fixed proportions so nothing shifts as they load.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/cars/${file}.webp`} alt="" width={800} height={600} className={cn("h-auto select-none", className)} draggable={false} />
  );
}
