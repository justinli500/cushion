"use client";

import { useState } from "react";
import { Card, CardTitle, PageHeader } from "@/components/kit";
import {
  businessType,
  cityOptions,
  guessAmount,
  needsOf,
  pickGame,
  pickWeather,
  suggest,
  teamOptions,
  titleOf,
  type AmountKey,
  type Risk,
  type SuggestInput,
  type Suggestion,
  type Team,
} from "@/domains/exposure/business";
import type { BucketMarket, EventMarket, Game, Ladder } from "@/domains/markets/types";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { usePoll } from "@/lib/use-poll";
import { SuggestionCard, type CardState } from "./cards";
import { useNow } from "./hooks";
import { YouCard } from "./you-card";

const riskKey = (risk: Risk) => (risk.kind === "cost-rise" ? `cost:${risk.underlying}` : risk.kind === "event" ? `event:${risk.event}` : risk.kind);

const stateOf = (s: Suggestion): CardState => (s.status === "ready" ? { kind: "ready", suggestion: s } : { kind: "unavailable", reason: s.reason });

export default function BusinessPage() {
  const profile = useProfile();
  const business = businessType(profile.business.type);
  const { city } = profile.business;
  const needs = business ? needsOf(business) : null;
  const now = useNow();

  const [team, setTeam] = useState<Team | null>(null);
  const [amounts, setAmounts] = useState<Partial<Record<AmountKey, number>>>({});
  const amountOf = (key: AmountKey) => amounts[key] ?? guessAmount(key);

  const weather = usePoll<{ markets: BucketMarket[] }>(needs?.city ? "/api/markets/weather" : null, 60_000);
  const games = usePoll<{ games: Game[] }>(needs?.team ? "/api/markets/games" : null, 30_000);
  const ladders = usePoll<{ ladders: Ladder[] }>(needs && needs.costs.length > 0 ? "/api/markets/ladders" : null, 30_000);
  const events = usePoll<{ markets: EventMarket[] }>(needs?.events ? "/api/markets/events" : null, 60_000);

  const input: SuggestInput = {
    now,
    city,
    team,
    weather: city && weather.data ? pickWeather(weather.data.markets, city, now) : null,
    game: team && games.data ? pickGame(games.data.games, team, now) : null,
    ladders: ladders.data?.ladders ?? [],
    events: events.data?.markets ?? [],
    badDayCost: amountOf("badDay"),
    monthlySpend: Object.fromEntries((needs?.costs ?? []).map((c) => [c.underlying, amountOf(c.underlying)])),
  };
  const feedOf = (risk: Risk) => (risk.kind === "home-loss" ? games : risk.kind === "cost-rise" ? ladders : risk.kind === "event" ? events : weather);

  const cards = (business?.risks ?? []).map((risk) => {
    const feed = feedOf(risk);
    const state: CardState = feed.data
      ? stateOf(suggest(risk, input))
      : feed.loading
        ? { kind: "loading" }
        : { kind: "unavailable", reason: "Gemini's markets did not load. Refresh the page to try again." };
    return { key: riskKey(risk), title: titleOf(risk, input), why: risk.why, state };
  });

  return (
    <>
      <PageHeader title="Cushion your business" lead="Tell Cushion what you run. It suggests the markets that pay on the days that hurt you most." />
      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[1_1_300px]">
          <YouCard
            businessId={business?.id ?? null}
            onBusiness={(id) => updateProfile("business", { type: id, city })}
            needs={needs}
            city={city}
            cities={weather.data ? cityOptions(weather.data.markets) : null}
            onCity={(name) => updateProfile("business", { type: business?.id ?? null, city: name })}
            team={team}
            teams={games.data ? teamOptions(games.data.games) : null}
            onTeam={setTeam}
            amounts={amounts}
            amountOf={amountOf}
            onAmount={(key, value) => setAmounts((previous) => ({ ...previous, [key]: value }))}
          />
        </section>

        <section className="flex min-w-0 flex-[999_1_560px] flex-col">
          <CardTitle hint={business ? "Live prices from Gemini. Play money." : undefined}>
            {business ? `Suggested for ${business.forWhom}` : "Suggested for you"}
          </CardTitle>
          {business ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4">
              {cards.map((c) => (
                <SuggestionCard key={c.key} title={c.title} why={c.why} state={c.state} />
              ))}
            </div>
          ) : (
            <Card>
              <p className="text-[17px] text-body">Choose what you run on the left. Cushion then suggests markets that pay on the days that hurt a business like yours.</p>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
