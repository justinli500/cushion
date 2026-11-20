"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** A team or league as a small round monogram, for when there is no picture. */
export function Monogram({ text, className }: { text: string; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold tracking-tight text-muted-foreground", className)}>
      {text.slice(0, 4)}
    </span>
  );
}

/**
 * A team's logo as Gemini supplies it with the market, falling back to a monogram when there is
 * none or it fails to load. Decorative: the team's name is always written beside it.
 */
export function TeamLogo({ src, fallback, className }: { src: string | null | undefined; fallback: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <Monogram text={fallback} className={className} />;
  return (
    // A plain <img>: these are small logos on Gemini's CDN, and next/image would route each one through this app's optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden loading="lazy" onError={() => setFailed(src)} className={cn("size-7 shrink-0 object-contain", className)} />
  );
}
