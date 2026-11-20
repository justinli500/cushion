"use client";

import Link from "next/link";
import { useState } from "react";
import { YesNoPair } from "@/components/kit";
import { hasShape, sidePrices, type Hero } from "@/domains/feed/news";
import type { Side } from "@/domains/markets/types";
import { formatVolume } from "@/lib/format";
import { BuyStrip } from "./buy-strip";
import { MoveLine } from "./news-card";
import { Sparkline } from "./sparkline";

const resolves = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const Mark = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 32 32" fill="none">
    <path d="M6 9c6-3 14-3 20 0 2 5 2 9 0 14-6 3-14 3-20 0-2-5-2-9 0-14z" fill="currentColor" />
  </svg>
);

/** The dark lead story: a real market that moved most today (or the most traded), with its price line when there are candles for one. */
export function HeroArticle({ hero, link }: { hero: Hero; link: { href: string; text: string } | null }) {
  const { item, move, moving } = hero;
  const [side, setSide] = useState<Side | null>(null);
  const { yes, no } = sidePrices(item.contract);
  const toggle = (next: Side) => setSide((current) => (current === next ? null : next));

  return (
    <article className="flex min-w-0 flex-[999_1_560px] flex-col gap-[22px] rounded-[32px] bg-panel p-8 text-white">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={
            moving
              ? "rounded-xl bg-risk-fill px-3 py-[5px] text-[12px] font-bold uppercase tracking-[0.04em] text-foreground"
              : "rounded-xl bg-panel-tile px-3 py-[5px] text-[12px] font-bold uppercase tracking-[0.04em] text-white"
          }
        >
          {moving ? "Moving now" : "Most traded"}
        </span>
        <span className="text-[13px] text-panel-foreground">
          {item.eyebrow} · {formatVolume(item.volume)} · resolves {resolves(item.expiry)}
        </span>
        <MoveLine move={move} onDark />
      </div>

      <h2 className="display max-w-[640px] text-balance text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.05] tracking-[-0.025em]">{item.headline}</h2>

      {move && hasShape(move) ? <Sparkline move={move} /> : null}

      <div className="mt-auto flex flex-col gap-2.5">
        {item.question ? <span className="text-[16px] font-semibold">{item.question}</span> : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-full max-w-[320px]">
            <YesNoPair tall yes={yes} no={no} onYes={() => toggle("yes")} onNo={() => toggle("no")} />
          </div>
          {link ? (
            <Link href={link.href} className="press inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-[22px] text-[16px] font-semibold text-primary-foreground">
              <Mark />
              {link.text}
            </Link>
          ) : null}
        </div>
        {side ? (
          <div className="max-w-[420px]">
            <BuyStrip key={side} item={item} side={side} onClose={() => setSide(null)} onDark />
          </div>
        ) : null}
      </div>
    </article>
  );
}
