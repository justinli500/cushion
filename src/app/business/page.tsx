"use client";

import { useState, type ReactNode } from "react";
import { CushionTicket } from "@/components/cushion-ticket";
import { Card, Notice, PageHeader, WithTicket } from "@/components/kit";
import { priceCushion } from "@/domains/cushion/price";
import {
  businessType,
  cityOptions,
  needsOf,
  pickGame,
  pickWeather,
  suggest,
  teamOptions,
  titleOf,
  type Risk,
  type SuggestInput,
  type Suggestion,
  type Team,
} from "@/domains/exposure/business";
import type { BucketMarket, Game, Ladder, UnderlyingId } from "@/domains/markets/types";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { formatUsdWhole } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import { SuggestionCard, type CardState } from "./cards";
import { useBooks, useNow } from "./hooks";
import { AmountForm, Picker, PickerSkeleton, QUESTIONS, Step, TypeGrid, stepsOf, type StepId } from "./steps";

type Spend = Partial<Record<UnderlyingId, number>>;

const LEAGUE_LABELS: Record<string, string> = { NCAAF: "College football", NCAAM: "College basketball" };

const riskKey = (risk: Risk) => (risk.kind === "cost-rise" ? `${risk.kind}:${risk.underlying}` : risk.kind);
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Item {
  id: string;
  title: string;
  why: string;
  state: CardState;
  /** Set when the card can be bought, so choosing it fills the ticket. */
  ready?: Extract<Suggestion, { status: "ready" }>;
}

export default function BusinessPage() {
  const profile = useProfile();
  const business = businessType(profile.business.type);
  const { city } = profile.business;
  const needs = business ? needsOf(business) : null;
  const now = useNow();

  const [team, setTeam] = useState<Team | null>(null);
  const [badDay, setBadDay] = useState<number | null>(null);
  const [spend, setSpend] = useState<Spend>({});
  const [editing, setEditing] = useState<StepId | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const weather = usePoll<{ markets: BucketMarket[] }>(needs?.city ? "/api/markets/weather" : null, 60_000);
  const games = usePoll<{ games: Game[] }>(needs?.team ? "/api/markets/games" : null, 30_000);
  const ladders = usePoll<{ ladders: Ladder[] }>(needs && needs.costs.length > 0 ? "/api/markets/ladders" : null, 30_000);

  const steps = stepsOf(needs);
  const answered: Record<StepId, boolean> = {
    type: business != null,
    city: city != null,
    team: team != null,
    badDay: badDay != null,
    spend: needs?.costs.every((c) => (spend[c.underlying] ?? 0) > 0) ?? false,
  };
  const current = editing ?? steps.find((s) => !answered[s]) ?? null;
  const complete = business != null && needs != null && current === null;

  const input: SuggestInput = {
    now,
    city,
    team,
    weather: city && weather.data ? pickWeather(weather.data.markets, city, now) : null,
    game: team && games.data ? pickGame(games.data.games, team, now) : null,
    ladders: ladders.data?.ladders ?? [],
    badDayCost: badDay ?? 0,
    monthlySpend: spend,
  };
  const feedOf = (risk: Risk) => (risk.kind === "home-loss" ? games : risk.kind === "cost-rise" ? ladders : weather);

  const suggestions = complete
    ? business.risks.map((risk) => ({ risk, feed: feedOf(risk), suggestion: feedOf(risk).data ? suggest(risk, input) : null }))
    : [];
  const symbols = suggestions.flatMap((s) => (s.suggestion?.status === "ready" ? s.suggestion.cushion.legs.map((l) => l.symbol) : []));
  const book = useBooks([...new Set(symbols)]);

  const items: Item[] = suggestions.map(({ risk, feed, suggestion }) => {
    const base = { id: riskKey(risk), title: titleOf(risk, input), why: risk.why };
    if (!suggestion) {
      const state: CardState = feed.loading
        ? { kind: "loading" }
        : { kind: "unavailable", reason: "Gemini's markets did not load. Refresh the page to try again." };
      return { ...base, state };
    }
    if (suggestion.status === "unavailable") return { ...base, state: { kind: "unavailable", reason: suggestion.reason } };

    const unpriced = suggestion.cushion.legs.some((l) => !book.books[l.symbol]);
    if (unpriced && book.loading) return { ...base, state: { kind: "loading" } };
    if (unpriced && book.error) return { ...base, state: { kind: "unavailable", reason: "Gemini's order books did not load. Refresh the page to try again." } };

    const quote = priceCushion(suggestion.cushion, book.books);
    if (quote.maxPayout === 0) return { ...base, state: { kind: "thin" } };
    return {
      ...base,
      ready: suggestion,
      state: { kind: "ready", quote, trigger: suggestion.trigger, chance: suggestion.chance, estimate: risk.kind === "cost-rise" },
    };
  });
  const chosen = items.find((item) => item.id === picked)?.ready;
  const nothingToBuy = items.length > 0 && items.every((item) => item.state.kind === "unavailable" || item.state.kind === "thin");

  const pickType = (id: string) => {
    updateProfile("business", { type: id, city });
    setPicked(null);
    setEditing(null);
  };

  const editor: Record<StepId, () => ReactNode> = {
    type: () => <TypeGrid selected={business?.id ?? null} onPick={pickType} />,
    city: () =>
      weather.data ? (
        <Picker
          options={cityOptions(weather.data.markets).map((name) => ({ key: name, label: name }))}
          selected={city}
          noun="city"
          onPick={(name) => {
            updateProfile("business", { type: business?.id ?? null, city: name });
            setEditing(null);
          }}
        />
      ) : weather.loading ? (
        <PickerSkeleton />
      ) : (
        <Notice>The list of cities did not load. Refresh the page to try again.</Notice>
      ),
    team: () =>
      games.data ? (
        <Picker
          options={teamOptions(games.data.games).map((t) => ({ key: `${t.league}/${t.abbr}`, label: t.name, hint: LEAGUE_LABELS[t.league] ?? t.league }))}
          selected={team ? `${team.league}/${team.abbr}` : null}
          noun="team"
          onPick={(key) => {
            setTeam(teamOptions(games.data?.games ?? []).find((t) => `${t.league}/${t.abbr}` === key) ?? null);
            setEditing(null);
          }}
        />
      ) : games.loading ? (
        <PickerSkeleton />
      ) : (
        <Notice>The list of teams did not load. Refresh the page to try again.</Notice>
      ),
    badDay: () => (
      <AmountForm
        fields={[{ key: "badDay", label: "Lost sales on a bad day", placeholder: "300" }]}
        initial={{ badDay: badDay ?? undefined }}
        hint="A rough number is fine. It sets how much a cushion pays you back."
        onDone={(v) => {
          setBadDay(v.badDay);
          setEditing(null);
        }}
      />
    ),
    spend: () => (
      <AmountForm
        fields={(needs?.costs ?? []).map((c) => ({ key: c.underlying, label: capitalise(c.what), placeholder: "400" }))}
        initial={spend}
        hint="Roughly what you pay in a month. A cushion pays you back if that bill climbs."
        onDone={(v) => {
          setSpend(v);
          setEditing(null);
        }}
      />
    ),
  };

  const answerText: Record<StepId, string> = {
    type: business?.name ?? "",
    city: city ?? "",
    team: team?.name ?? "",
    badDay: badDay != null ? formatUsdWhole(badDay) : "",
    spend: (needs?.costs ?? []).map((c) => `${capitalise(c.what)} ${formatUsdWhole(spend[c.underlying] ?? 0)}`).join(", "),
  };

  return (
    <>
      <PageHeader
        title="Small business"
        lead="Tell us what you run and we will suggest cushions for the days and bills that hurt most. Everything here uses play money."
      />
      <WithTicket
        ticket={
          <CushionTicket
            section="business"
            title={chosen?.title ?? "Your cushion"}
            detail={chosen?.trigger ?? "Choose a cushion and its price shows up here."}
            cushion={chosen?.cushion ?? null}
            eventTickers={chosen?.eventTickers ?? []}
            expiry={chosen?.expiry ?? ""}
            chance={chosen?.chance}
            emptyMessage={
              complete
                ? "Choose one of the cushions on the left to see what it costs."
                : "Answer the questions on the left and we will suggest cushions for your business."
            }
          />
        }
      >
        <Card className="divide-y divide-border">
          {steps.map((step) =>
            step === current || answered[step] ? (
              <Step
                key={step}
                question={QUESTIONS[step]}
                answer={answerText[step]}
                open={step === current}
                onOpen={() => setEditing(step)}
              >
                {step === current ? editor[step]() : null}
              </Step>
            ) : null,
          )}
        </Card>

        {complete ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight">Cushions for your {business.name.toLowerCase()}</h2>
              <p className="mt-0.5 text-[14px] text-muted-foreground">Each one pays you back when something here goes against you. Choose one to see its price.</p>
            </div>
            {nothingToBuy ? <Notice>None of these have cover on offer today. Check back tomorrow, or try another kind of business.</Notice> : null}
            {items.map((item) => (
              <SuggestionCard
                key={item.id}
                title={item.title}
                why={item.why}
                state={item.state}
                selected={item.id === picked}
                onSelect={() => setPicked(item.id)}
              />
            ))}
          </section>
        ) : null}
      </WithTicket>
    </>
  );
}
