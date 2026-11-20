"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FeedCardView } from "@/components/feed/feed-card";
import { PageHeader, Skeleton } from "@/components/kit";
import { exposures, readHolding, type History } from "@/domains/exposure/portfolio";
import {
  billsCard,
  fantasyCard,
  gameCard,
  marketCard,
  pickGame,
  portfolioCard,
  weatherCard,
  type FantasyPlayer,
  type FeedCard,
} from "@/domains/feed/cards";
import { UNDERLYINGS, type BucketMarket, type Game, type Ladder, type UnderlyingId } from "@/domains/markets/types";
import { useProfile } from "@/domains/profile/profile";
import { usePoll } from "@/lib/use-poll";

const FACTORS = Object.keys(UNDERLYINGS) as UnderlyingId[];

const STARTERS = [
  { href: "/portfolio", title: "What you hold", body: "Coins and stocks, and what they are really riding on." },
  { href: "/games", title: "Your team", body: "A consolation when the game goes the wrong way." },
  { href: "/bills", title: "Your bills", body: "Gas and heating, covered against a jump in prices." },
  { href: "/fantasy", title: "Your lineup", body: "Paid back when a player has a bad night." },
  { href: "/business", title: "Your business", body: "Cold days, home losses, and rising costs." },
];

export default function TodayPage() {
  const profile = useProfile();
  const ladders = usePoll<{ ladders: Ladder[] }>("/api/markets/ladders", 30_000);
  const games = usePoll<{ games: Game[] }>("/api/markets/games", 30_000);
  const weather = usePoll<{ markets: BucketMarket[] }>(profile.business.city ? "/api/markets/weather" : null, 120_000);
  const props = usePoll<{ players: FantasyPlayer[] }>(profile.fantasy.players.length > 0 ? "/api/markets/props" : null, 120_000);
  const held = profile.holdings.map((h) => h.symbol);
  const prices = usePoll<{ history: History }>(held.length > 0 ? `/api/prices?symbols=${[...new Set([...FACTORS, ...held])].join(",")}` : null);

  const cards = useMemo(() => {
    const all: (FeedCard | null)[] = [];
    const listed = ladders.data?.ladders ?? [];

    if (prices.data) {
      const reads = profile.holdings.map((h) => readHolding(h, prices.data!.history, FACTORS));
      all.push(...exposures(reads).slice(0, 2).map((e) => portfolioCard(e, listed)));
    }
    const game = pickGame(games.data?.games ?? [], profile.team);
    if (game) all.push(gameCard(game, profile.team));
    if (profile.bills.gasGallonsPerMonth) all.push(billsCard(profile.bills.gasGallonsPerMonth, listed));
    if (profile.business.city) all.push(weatherCard(profile.business.city, weather.data?.markets ?? []));
    for (const name of profile.fantasy.players.slice(0, 2)) {
      const entry = props.data?.players.find((p) => p.player === name);
      if (entry) all.push(fantasyCard(entry));
    }
    // Someone who has not told the app anything still gets a read on the day.
    if (profile.holdings.length === 0) all.push(marketCard(listed, "BTC"));
    if (!profile.bills.gasGallonsPerMonth) all.push(marketCard(listed, "BRENT"));

    // Two cards about the same thing say the same thing: keep the first, which is the personal one.
    const seen = new Set<string>();
    return all.filter((card): card is FeedCard => card !== null && !seen.has(card.topic) && Boolean(seen.add(card.topic)));
  }, [profile, ladders.data, games.data, weather.data, props.data, prices.data]);

  const loading = ladders.loading || games.loading;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const missing = STARTERS.filter(({ href }) => !isSet(href, profile));

  return (
    <>
      <PageHeader
        title="Today"
        lead={`${today}. What the markets think about the things you have riding on today, and what it would cost to soften a bad one.`}
      />

      {loading && cards.length === 0 ? (
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 xl:grid-cols-3">
          {cards.map((card) => (
            <FeedCardView key={card.id} card={card} />
          ))}
        </div>
      )}

      {missing.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-1 text-[15px] font-semibold">Make this yours</h2>
          <p className="mb-4 text-[14px] text-muted-foreground">Tell Cushion what you have riding on tomorrow. Each one adds a card here.</p>
          <ul className="grid grid-cols-3 gap-3 xl:grid-cols-5">
            {missing.map((starter) => (
              <li key={starter.href}>
                <Link href={starter.href} className="press block h-full rounded-2xl border border-border px-4 py-3.5 hover:border-primary">
                  <span className="block text-[14px] font-medium">{starter.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{starter.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function isSet(href: string, profile: ReturnType<typeof useProfile>) {
  if (href === "/portfolio") return profile.holdings.length > 0;
  if (href === "/games") return profile.team != null;
  if (href === "/bills") return profile.bills.gasGallonsPerMonth != null || profile.bills.heatingBillPerMonth != null;
  if (href === "/fantasy") return profile.fantasy.players.length > 0;
  return profile.business.type != null;
}
