"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ComingUp } from "@/components/feed/coming-up";
import { FeedCardView } from "@/components/feed/feed-card";
import { HeroArticle } from "@/components/feed/hero";
import { NewsCard } from "@/components/feed/news-card";
import { useDayMoves } from "@/components/feed/use-moves";
import { Button, Chip, Notice, Skeleton } from "@/components/kit";
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
import { KINDS, eventItem, gameItem, pickHero, relatedLink, soonGames, upcoming, type Kind, type TradeItem } from "@/domains/feed/news";
import { UNDERLYINGS, type BucketMarket, type EventMarket, type Game, type Ladder, type UnderlyingId } from "@/domains/markets/types";
import { useProfile } from "@/domains/profile/profile";
import { usePoll } from "@/lib/use-poll";

const FACTORS = Object.keys(UNDERLYINGS) as UnderlyingId[];

/** The lead story is chosen from this many of the most traded news markets. */
const HERO_POOL = 10;
const GRID_LIMIT = 12;
const GAME_HOURS = 48;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4";

const STARTERS = [
  { href: "/portfolio", title: "What you hold", body: "Coins and stocks, and what they are really riding on." },
  { href: "/games", title: "Your team", body: "A consolation when the game goes the wrong way." },
  { href: "/bills", title: "Your bills", body: "Gas and heating, covered against a jump in prices." },
  { href: "/fantasy", title: "Your lineup", body: "Paid back when a player has a bad night." },
  { href: "/business", title: "Your business", body: "Cold days, home losses, and rising costs." },
];

const notNull = <T,>(value: T | null): value is T => value !== null;

export default function TodayPage() {
  const profile = useProfile();
  const ladders = usePoll<{ ladders: Ladder[] }>("/api/markets/ladders", 30_000);
  const games = usePoll<{ games: Game[] }>("/api/markets/games", 30_000);
  const events = usePoll<{ markets: EventMarket[] }>("/api/markets/events", 60_000);
  const weather = usePoll<{ markets: BucketMarket[] }>(profile.business.city ? "/api/markets/weather" : null, 120_000);
  const props = usePoll<{ players: FantasyPlayer[] }>(profile.fantasy.players.length > 0 ? "/api/markets/props" : null, 120_000);
  const held = profile.holdings.map((h) => h.symbol);
  const prices = usePoll<{ history: History }>(held.length > 0 ? `/api/prices?symbols=${[...new Set([...FACTORS, ...held])].join(",")}` : null);
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [showAll, setShowAll] = useState(false);
  // The clock the day's games and dates are measured against; it moves on while the page stays open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

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

  const eventItems = useMemo(() => (events.data?.markets ?? []).map(eventItem).filter(notNull).sort((a, b) => b.volume - a.volume), [events.data]);
  const trade = useMemo(() => {
    // A game the person already has a card for would appear twice.
    const mine = new Set(cards.map((c) => c.topic));
    const gameItems = soonGames(games.data?.games ?? [], now, GAME_HOURS)
      .slice(0, 4)
      .map(gameItem)
      .filter(notNull)
      .filter((item) => !mine.has(item.headline));
    return [...eventItems, ...gameItems].sort((a, b) => b.volume - a.volume);
  }, [eventItems, games.data, cards, now]);

  const kinds = KINDS.filter((k) => (k.id === "foryou" ? cards.length > 0 : trade.some((item) => item.kind === k.id)));
  const active = filter === "all" || kinds.some((k) => k.id === filter) ? filter : "all";
  const matching = active === "foryou" ? [] : trade.filter((item) => active === "all" || item.kind === active);
  const visible: TradeItem[] = showAll ? matching : matching.slice(0, GRID_LIMIT);

  // Price lines come only from real candles: the lead story's pool and every news card on screen.
  const pool = eventItems.slice(0, HERO_POOL);
  const moves = useDayMoves([...new Set([...pool, ...visible].filter((item) => item.kind !== "sports").map((item) => item.contract.symbol))]);
  const heroReady = pool.every((item) => item.contract.symbol in moves);
  const hero = heroReady ? pickHero(pool, moves) : null;
  const rows = upcoming(events.data?.markets ?? [], games.data?.games ?? [], now);

  const today = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const missing = STARTERS.filter(({ href }) => !isSet(href, profile));
  const personalLoading = ladders.loading || games.loading;
  const showPersonal = active === "all" || active === "foryou";

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span suppressHydrationWarning className="text-[14px] font-semibold text-muted-foreground">
            {today}
          </span>
          <h1 className="display text-[clamp(36px,4.4vw,60px)] font-bold leading-none tracking-[-0.03em]">Today</h1>
        </div>
        {kinds.length > 0 ? (
          <div role="group" aria-label="Filter the feed" className="flex flex-wrap gap-2">
            <Chip small pressed={active === "all"} onClick={() => setFilter("all")}>
              Everything
            </Chip>
            {kinds.map((k) => (
              <Chip key={k.id} small pressed={active === k.id} onClick={() => setFilter(k.id)}>
                {k.label}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-stretch gap-6">
        {hero ? (
          <HeroArticle hero={hero} link={relatedLink(hero.item, profile.holdings.length)} />
        ) : events.loading || (pool.length > 0 && !heroReady) ? (
          <Skeleton className="min-h-[380px] min-w-0 flex-[999_1_560px] rounded-[32px]" />
        ) : (
          <div className="min-w-0 flex-[999_1_560px]">
            <Notice>{events.error ?? "Gemini has no news markets open right now."}</Notice>
          </div>
        )}
        <ComingUp rows={rows} loading={events.loading || games.loading} />
      </div>

      {showPersonal && (cards.length > 0 || personalLoading) ? (
        <section className="flex flex-col gap-4">
          <h2 className="display text-[24px] font-semibold tracking-[-0.01em]">For you</h2>
          {cards.length === 0 ? (
            <div className={GRID}>
              <Skeleton className="h-56 w-full rounded-[28px]" />
              <Skeleton className="h-56 w-full rounded-[28px]" />
            </div>
          ) : (
            <div className={GRID}>
              {cards.map((card) => (
                <FeedCardView key={card.id} card={card} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {active !== "foryou" ? (
        <section className="flex flex-col gap-4">
          <h2 className="display text-[24px] font-semibold tracking-[-0.01em]">In the news, and tradable</h2>
          {visible.length > 0 ? (
            <div className={GRID}>
              {visible.map((item) => (
                <NewsCard key={item.id} item={item} move={moves[item.contract.symbol]} />
              ))}
            </div>
          ) : events.loading ? (
            <div className={GRID}>
              <Skeleton className="h-64 w-full rounded-[28px]" />
              <Skeleton className="h-64 w-full rounded-[28px]" />
            </div>
          ) : (
            <Notice>{events.error ?? "Nothing tradable here right now."}</Notice>
          )}
          {matching.length > GRID_LIMIT ? (
            <div>
              <Button variant="quiet" onClick={() => setShowAll((all) => !all)}>
                {showAll ? "Show fewer" : `Show ${matching.length - GRID_LIMIT} more`}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {showPersonal && missing.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="display text-[24px] font-semibold tracking-[-0.01em]">Make this yours</h2>
            <p className="text-[15px] text-body">Tell Cushion what you have riding on tomorrow. Each one adds a card here.</p>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3">
            {missing.map((starter) => (
              <li key={starter.href}>
                <Link href={starter.href} className="press flex h-full min-h-11 flex-col gap-1 rounded-[24px] bg-card p-5 hover:bg-secondary">
                  <span className="text-[15px] font-semibold">{starter.title}</span>
                  <span className="text-[13px] leading-snug text-muted-foreground">{starter.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function isSet(href: string, profile: ReturnType<typeof useProfile>) {
  if (href === "/portfolio") return profile.holdings.length > 0;
  if (href === "/games") return profile.team != null;
  if (href === "/bills") return profile.bills.gasGallonsPerMonth != null || profile.bills.heatingBillPerMonth != null;
  if (href === "/fantasy") return profile.fantasy.players.length > 0;
  return profile.business.type != null;
}
