"use client";

import Link from "next/link";
import { useState } from "react";
import { YesNoPair } from "@/components/kit";
import { sidePrices, type Move, type TradeItem } from "@/domains/feed/news";
import type { Side } from "@/domains/markets/types";
import { formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BuyStrip } from "./buy-strip";

/** "Yes up 6¢ in 24h", in words as well as colour. Absent when there are no candles to say it from. */
export function MoveLine({ move, onDark = false }: { move: Move | null | undefined; onDark?: boolean }) {
  if (!move || move.change === 0) return null;
  const up = move.change > 0;
  return (
    <span className={cn("tabular text-[13px] font-semibold", up ? (onDark ? "text-covered-on-dark" : "text-covered") : onDark ? "text-risk-fill" : "text-risk")}>
      Yes {up ? "up" : "down"} {Math.abs(move.change)}¢ in 24h
    </span>
  );
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A white card for one tradable market: its question, Yes and No, and a small purchase that opens in place. */
export function NewsCard({ item, move }: { item: TradeItem; move: Move | null | undefined }) {
  const [side, setSide] = useState<Side | null>(null);
  const { yes, no } = sidePrices(item.contract);
  const toggle = (next: Side) => setSide((current) => (current === next ? null : next));

  return (
    <article className="arrive flex flex-col gap-3.5 rounded-[28px] bg-card p-[22px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[13px] font-semibold text-muted-foreground">{item.eyebrow}</span>
        {move && move.change !== 0 ? (
          <MoveLine move={move} />
        ) : item.status ? (
          <span className="text-[13px] font-semibold text-muted-foreground">{item.status}</span>
        ) : null}
      </div>
      <h3 className="display text-[21px] font-semibold leading-[1.2]">{item.headline}</h3>
      {item.question ? <span className="text-[14px] text-body">{item.question}</span> : null}
      <YesNoPair yes={yes} no={no} onYes={() => toggle("yes")} onNo={() => toggle("no")} />
      {side ? <BuyStrip key={side} item={item} side={side} onClose={() => setSide(null)} /> : null}
      {item.href ? (
        <Link href={item.href} className="press inline-flex min-h-11 items-center text-[14px] font-semibold text-covered hover:underline">
          Open the game
        </Link>
      ) : (
        <span className="inline-flex min-h-11 items-center text-[14px] text-muted-foreground">
          Resolves {when(item.expiry)} · {formatVolume(item.volume)}
        </span>
      )}
    </article>
  );
}
