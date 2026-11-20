import Link from "next/link";
import type { FeedCard } from "@/domains/feed/cards";
import type { NewsLine } from "./use-news";

export function FeedCardView({ card, news }: { card: FeedCard; news?: NewsLine }) {
  const written = news?.source === "ai" ? news.text : null;
  return (
    <article className="arrive flex flex-col rounded-2xl border border-line bg-card p-6">
      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint">{card.eyebrow}</p>
      <h2 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight">{card.headline}</h2>

      {card.stat ? (
        <p className="mt-4 flex items-baseline gap-2.5">
          <span className="tabular text-[34px] font-semibold leading-none tracking-tight text-cushion">{card.stat.value}</span>
          <span className="text-[13px] leading-snug text-muted">{card.stat.label}</span>
        </p>
      ) : null}

      {/* The written line leads when there is one; the numbers always stay on the card. */}
      {written ? <p className="mt-4 text-[15px] leading-relaxed">{written}</p> : null}
      <p className={`leading-relaxed text-muted ${written ? "mt-2 text-[13px]" : "mt-4 text-[14px]"}`}>{card.facts}</p>

      <div className="mt-auto pt-5">
        <Link
          href={card.href}
          className="press inline-flex rounded-xl border border-line px-3.5 py-2 text-[13px] font-medium hover:border-cushion hover:text-cushion"
        >
          {card.action}
        </Link>
      </div>
    </article>
  );
}
