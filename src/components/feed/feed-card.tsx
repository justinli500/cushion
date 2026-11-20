import Link from "next/link";
import type { FeedCard } from "@/domains/feed/cards";
import { HEADLINES_AS_OF } from "@/domains/feed/headlines";

const writtenOn = new Date(`${HEADLINES_AS_OF}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function FeedCardView({ card }: { card: FeedCard }) {
  return (
    <article className="arrive flex flex-col rounded-2xl border border-border bg-card p-6">
      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">{card.eyebrow}</p>
      <h2 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight">{card.headline}</h2>

      {card.stat ? (
        <p className="mt-4 flex items-baseline gap-2.5">
          <span className="tabular text-[34px] font-semibold leading-none tracking-tight text-primary">{card.stat.value}</span>
          <span className="text-[13px] leading-snug text-muted-foreground">{card.stat.label}</span>
        </p>
      ) : null}

      <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">{card.facts}</p>

      {card.news ? (
        <p className="mt-4 border-l-2 border-border pl-3 text-[13px] leading-relaxed">
          <span className="font-medium">This week.</span> {card.news}{" "}
          <span className="whitespace-nowrap text-muted-foreground/70">Written {writtenOn}.</span>
        </p>
      ) : null}

      <div className="mt-auto pt-5">
        <Link
          href={card.href}
          className="press inline-flex rounded-xl border border-border px-3.5 py-2 text-[13px] font-medium hover:border-primary hover:text-primary"
        >
          {card.action}
        </Link>
      </div>
    </article>
  );
}
