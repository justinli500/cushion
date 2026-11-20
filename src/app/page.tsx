"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DropLanding } from "@/app/lab/_components/drop-landing";
import { Disclaimer } from "@/components/brand";
import { Chip, CushionMeter, QuotePair } from "@/components/kit";
import { teamLossLegs } from "@/domains/cushion/legs";
import { filledLegs, priceCushion } from "@/domains/cushion/price";
import type { StakeQuote } from "@/domains/landing/quotes";
import { cleaned, frameAt, moments, replayBooks, replaySchema, valueNow } from "@/domains/replay/replay";
import { teamNickname } from "@/domains/scores/names";
import { formatUsd } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";

const REPLAY = "/replays/nfl-ind-hou-2026-11-19.json";
const whole = (dollars: number) => formatUsd(dollars).replace(/\.00$/, "");

const Arrow = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandingPage() {
  const { data, error } = usePoll<{ quotes: StakeQuote[] }>("/api/landing", 30_000);
  const quotes = data?.quotes ?? [];
  const [picked, setPicked] = useState<StakeQuote["id"] | null>(null);
  const quote = quotes.find((q) => q.id === picked) ?? quotes[0] ?? null;
  const story = useGameStory();

  return (
    <DropLanding overlay={false}>
    <div className="bg-background text-foreground">
      <section className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-center gap-14 px-8 py-24">
        <div className="flex flex-col gap-6">
          <div className="inline-flex items-center gap-2 self-start rounded-2xl bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-foreground">
            Built on Gemini prediction markets
          </div>
          <h2 className="display text-balance text-[clamp(40px,5.2vw,68px)] font-bold leading-[1.02] tracking-[-0.03em]">Whatever you have riding on it, cushion it.</h2>
          <p className="max-w-[520px] text-pretty text-[19px] text-body">
            Say what you have at stake. Cushion finds the market that pays when it goes against you and prices the protection as one number.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#price" className="press inline-flex min-h-[52px] items-center rounded-full bg-primary px-7 text-[17px] font-semibold text-primary-foreground">
              Price my cushion
            </a>
            <span className="text-[14px] text-muted-foreground">Try it on the right. Tap a stake.</span>
          </div>
        </div>

        <div id="price" className="flex scroll-mt-6 flex-col gap-[22px] rounded-[32px] bg-card p-7 shadow-[0_30px_70px_rgba(15,27,45,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">I have this riding on it</span>
            <span className="rounded-[10px] bg-secondary px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">Live quote</span>
          </div>

          {!quote ? (
            <p className="rounded-3xl bg-muted p-[22px] text-[15px] text-body">
              {error ? "Gemini's markets are not answering right now. This will try again in a moment." : "Fetching live prices from Gemini…"}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {quotes.map((q) => (
                  <Chip key={q.id} pressed={q.id === quote.id} onClick={() => setPicked(q.id)}>
                    {q.label}
                  </Chip>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="display text-[26px] font-semibold leading-[1.15]">{quote.stake}</div>
                <div className="text-[15px] text-body">{quote.risk}</div>
              </div>

              <div className="flex flex-col gap-[18px] rounded-3xl bg-muted p-[22px]">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold text-risk">Pays if</span>
                  <span className="text-[17px] font-semibold">{quote.trigger}</span>
                </div>
                <QuotePair pay={<span className="text-[34px]">{formatUsd(quote.cost)}</span>} pays={<span className="text-[34px]">{whole(quote.payout)}</span>} />
                <CushionMeter value={`${whole(quote.payout)} of ${quote.coveredLabel}`} fraction={quote.payout / quote.coveredOf} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 text-[13px] text-muted-foreground">
                <span>
                  Under the hood: <strong className="text-foreground">{quote.market}</strong>
                </span>
                <span className="tabular font-semibold text-foreground">{quote.fill}</span>
              </div>

              <Link href={quote.href} className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-background">
                Cushion this in the app <Arrow />
              </Link>
            </>
          )}
        </div>
      </section>

      <section id="live" className="scroll-mt-0 bg-panel text-white">
        <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-center gap-14 px-8 py-[88px]">
          <div className="flex flex-col gap-5">
            <h2 className="display text-balance text-[clamp(30px,3.6vw,46px)] font-bold leading-[1.06] tracking-[-0.025em]">Watch the game. Watch your cushion move with it.</h2>
            <p className="max-w-[480px] text-pretty text-[18px] text-panel-foreground">
              The broadcast and your protection share one screen. When the other team scores, you see what your cushion is worth right then, and
              you can add to it or cash out.
            </p>
            <Link href="/games/live" className="inline-flex min-h-11 items-center gap-2 self-start text-[16px] font-semibold text-white underline underline-offset-4">
              See the live view <Arrow />
            </Link>
          </div>

          <div className="flex flex-col gap-3 rounded-[28px] bg-panel-tile p-4">
            <Link href="/games/live" className="relative flex min-h-[220px] items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-[#3A4B68] bg-[#0A1220]">
              <span className="text-[14px] text-[#A9B6CB]">Play the broadcast</span>
              {story ? (
                <div className="tabular absolute left-3 top-3 flex items-center gap-2.5 rounded-xl bg-card px-3 py-1.5 text-[13px] font-bold text-foreground">
                  <span>{story.away}</span>
                  <span className="font-medium text-muted-foreground">{story.clock}</span>
                  <span>{story.home}</span>
                </div>
              ) : null}
            </Link>
            {story ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
                <div className="flex flex-col gap-2 rounded-[18px] bg-card p-4 text-foreground">
                  <span className="text-[13px] text-muted-foreground">{story.headline}</span>
                  <div className="flex items-baseline gap-2.5">
                    <span className="display tabular text-[30px] font-bold">{formatUsd(story.worth)}</span>
                    <span className={`tabular text-[14px] font-semibold ${story.change >= 0 ? "text-covered" : "text-risk"}`}>
                      {story.change >= 0 ? "+" : "−"}
                      {formatUsd(Math.abs(story.change))}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 rounded-[18px] bg-primary p-4 text-white">
                  <span className="text-[13px] text-yes">If the {story.team} lose</span>
                  <span className="display tabular text-[30px] font-bold">You get {whole(story.payout)}</span>
                </div>
              </div>
            ) : null}
            <p className="px-1 text-[12px] text-panel-foreground">
              {story ? `From the ${story.title} game played Nov 19, run as live. Real plays and real Gemini prices.` : "A real game, run as live with its real plays and prices."}
            </p>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto flex max-w-[1200px] scroll-mt-0 flex-col gap-10 px-8 pb-[72px] pt-24">
        <h2 className="display text-[clamp(30px,3.6vw,46px)] font-bold leading-[1.06] tracking-[-0.025em]">Three moves, no order book.</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
          <Step n={1} title="Say what's at stake" body="In plain words. No tickers, no contract names.">
            <div className="flex min-h-[148px] flex-wrap content-center gap-2 rounded-[20px] bg-muted p-[18px]">
              {(quotes.length > 0 ? quotes.map((q) => q.label) : ["My team", "Heating bill", "Portfolio", "Fantasy lineup"]).slice(0, 4).map((label, i) => (
                <span key={label} className={`rounded-[18px] px-3.5 py-2 text-[14px] font-semibold ${i === 0 ? "bg-foreground text-background" : "bg-card"}`}>
                  {label}
                </span>
              ))}
            </div>
          </Step>

          <Step n={2} title="Cushion finds the market" body="It picks the side that pays when your thing goes wrong.">
            <div className="flex min-h-[148px] flex-col justify-center gap-2 rounded-[20px] bg-muted p-[18px]">
              {quotes.slice(0, 2).map((q) => {
                const [, side, price] = /× (Yes|No).* at (\d+¢)/.exec(q.fill) ?? [];
                return (
                  <div key={q.id} className="flex items-center justify-between gap-2.5 rounded-[14px] bg-card px-3.5 py-2.5 text-[14px] font-semibold">
                    <span className="min-w-0 truncate">{q.market}</span>
                    <span className={`tabular shrink-0 ${side === "No" ? "text-risk" : "text-covered"}`}>
                      {side} {price}
                    </span>
                  </div>
                );
              })}
              {quotes.length === 0 ? <span className="text-[14px] text-muted-foreground">Live markets load here.</span> : null}
            </div>
          </Step>

          <Step n={3} title="It pays when it stings" body="If things go fine, you're out the price of the cushion and nothing more.">
            <div className="flex min-h-[148px] flex-col justify-center gap-1 rounded-[20px] bg-panel p-[18px] text-white">
              <span className="text-[13px] text-panel-foreground">{story ? story.final : "Your team lost"}</span>
              <span className="display tabular text-[34px] font-bold">+{formatUsd(story?.payout ?? 40)}</span>
              <span className="text-[13px] text-panel-foreground">Paid to your play-money account</span>
            </div>
          </Step>
        </div>
      </section>

      <footer className="mx-auto max-w-[1200px] px-8 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[32px] bg-primary px-10 py-12 text-white">
          <h2 className="display text-[clamp(26px,3vw,38px)] font-bold leading-[1.1]">What do you have riding on this week?</h2>
          <Link href="/today" className="press inline-flex min-h-[52px] items-center rounded-full bg-card px-7 text-[17px] font-semibold text-foreground">
            Price my cushion
          </Link>
        </div>
        <div className="mt-6">
          <Disclaimer />
        </div>
      </footer>
    </div>
    </DropLanding>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-[28px] bg-card p-6">
      {children}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-covered">{n}</span>
        <h3 className="display text-[22px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="text-[15px] text-body">{body}</p>
      </div>
    </div>
  );
}

/**
 * The live-view teaser, told with the saved game's real numbers: a cushion against a loss by the
 * team that scored second, bought at kickoff, and what it was worth after the other team scored first.
 */
function useGameStory() {
  const file = usePoll<unknown>(REPLAY);
  return useMemo(() => {
    const parsed = replaySchema.safeParse(file.data);
    if (!parsed.success) return null;
    const replay = cleaned(parsed.data);
    const [kickoff, firstScore] = moments(replay);
    if (!firstScore) return null;
    const before = frameAt(replay, kickoff.t).game;
    const after = frameAt(replay, firstScore.t + 60_000);
    // Whoever conceded first is the team being rooted for: their cushion gained when the other side scored.
    const scored = after.score.home.score > after.score.away.score ? "home" : "away";
    const mine = before.teams.find((t) => t.side !== scored);
    const rival = before.teams.find((t) => t.side === scored);
    if (!mine || !rival) return null;
    const payout = 40;
    const bought = priceCushion(teamLossLegs(before, mine.abbr, payout), replayBooks(before));
    if (bought.maxPayout === 0) return null;
    const worth = valueNow(filledLegs(bought), after.game);
    // The payout example is the cushion that did pay: one against the team that went on to lose.
    const loser = replay.final && replay.home.score !== replay.away.score ? before.teams.find((t) => (t.side === "home") === replay.home.score < replay.away.score) : null;
    return {
      title: `${teamNickname(before, replay.away.abbr === mine.abbr ? mine : rival)} at ${teamNickname(before, replay.home.abbr === mine.abbr ? mine : rival)}`,
      team: teamNickname(before, mine),
      away: `${replay.away.abbr} ${after.score.away.score}`,
      home: `${replay.home.abbr} ${after.score.home.score}`,
      clock: `${after.score.period} · ${after.score.clock}`,
      headline: `The ${teamNickname(before, rival)} scored. Your cushion is now worth`,
      worth,
      change: Math.round((worth - bought.cost) * 100) / 100,
      payout: bought.maxPayout,
      final: loser
        ? `${teamNickname(before, loser)} lost ${Math.min(replay.home.score, replay.away.score)}–${Math.max(replay.home.score, replay.away.score)}`
        : "Your team lost",
    };
  }, [file.data]);
}
