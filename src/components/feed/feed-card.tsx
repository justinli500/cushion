import Link from "next/link";
import { OutcomeBar } from "@/components/outcome-bar";
import { TeamLogo } from "@/components/team-logo";
import type { FeedCard } from "@/domains/feed/cards";
import { HEADLINES_AS_OF } from "@/domains/feed/headlines";

const writtenOn = new Date(`${HEADLINES_AS_OF}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A card for something the person has at stake: the market's read on it, and the section that cushions it. */
export function FeedCardView({ card }: { card: FeedCard }) {
  return (
    <article className="arrive flex flex-col gap-3.5 rounded-[28px] bg-card p-[22px]">
      <span className="text-[13px] font-semibold text-muted-foreground">{card.eyebrow}</span>
      <h3 className="display text-[21px] font-semibold leading-[1.2]">{card.headline}</h3>

      {card.outcomes ? (
        <div className="flex flex-col gap-1.5">
          {card.outcomes.map((outcome) => (
            <OutcomeBar
              key={outcome.label}
              label={outcome.label}
              chance={outcome.chance}
              emphasis={outcome.mine}
              leading={<TeamLogo src={outcome.image} fallback={outcome.short} />}
            />
          ))}
          {card.footnote ? <p className="tabular pt-1 text-[13px] text-muted-foreground">{card.footnote}</p> : null}
        </div>
      ) : card.stat ? (
        <p className="flex items-baseline gap-2.5">
          <span className="display tabular text-[34px] font-bold leading-none tracking-[-0.02em] text-covered">{card.stat.value}</span>
          <span className="text-[13px] leading-snug text-muted-foreground">{card.stat.label}</span>
        </p>
      ) : null}

      <p className="text-[14px] leading-relaxed text-body">{card.facts}</p>

      {card.news ? (
        <p className="rounded-[14px] bg-muted px-3.5 py-3 text-[13px] leading-relaxed text-body">
          <span className="font-semibold text-foreground">This week.</span> {card.news}{" "}
          <span className="whitespace-nowrap text-muted-foreground">Written {writtenOn}.</span>
        </p>
      ) : null}

      <Link href={card.href} className="press mt-auto inline-flex min-h-11 items-center text-[14px] font-semibold text-covered hover:underline">
        {card.action}
      </Link>
    </article>
  );
}
