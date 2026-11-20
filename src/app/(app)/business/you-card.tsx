"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/kit";
import { BUSINESS_TYPES, amountsOf, type AmountKey, type Needs, type Team } from "@/domains/exposure/business";
import { formatUsdWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEAGUE_LABELS: Record<string, string> = { NCAAF: "College football", NCAAM: "College basketball" };
const teamKey = (t: Team) => `${t.league}/${t.abbr}`;

const MAX_AMOUNT = 1_000_000;
const parseAmount = (text: string): number | null => {
  const n = Number(text.replace(/[$,\s]/g, "") || NaN);
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
};

/** A dollar amount in its own tile, with a way to type a different one. */
function AmountTile({ label, value, guess, onChange }: { label: string; value: number; guess: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const typed = text == null ? null : parseAmount(text);

  return (
    <div className="flex flex-col gap-1 rounded-[18px] bg-muted p-4">
      <span className="text-[13px] text-muted-foreground">
        {label}
        {guess ? " (a starting guess)" : ""}
      </span>
      {text == null ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="display tabular text-[30px] font-bold tracking-[-0.02em]">{formatUsdWhole(value)}</span>
          <button
            type="button"
            onClick={() => setText(String(value))}
            className="press min-h-11 px-3.5 text-[14px] font-semibold text-covered underline underline-offset-[3px]"
          >
            Change
          </button>
        </div>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed != null) {
              onChange(typed);
              setText(null);
            }
          }}
        >
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">$</span>
            <input
              className={cn(inputClass, "tabular bg-card pl-7")}
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setText(null)}
              aria-label={label}
              aria-invalid={typed == null}
              autoFocus
            />
          </div>
          <Button type="submit" variant="quiet" disabled={typed == null}>
            Done
          </Button>
        </form>
      )}
    </div>
  );
}

export interface YouCardProps {
  businessId: string | null;
  onBusiness: (id: string) => void;
  needs: Needs | null;
  city: string | null;
  /** Cities with a temperature market, or null while they load or if they did not. */
  cities: string[] | null;
  onCity: (city: string) => void;
  team: Team | null;
  teams: Team[] | null;
  onTeam: (team: Team | null) => void;
  /** Amounts the owner has typed; anything missing is still the starting guess. */
  amounts: Partial<Record<AmountKey, number>>;
  amountOf: (key: AmountKey) => number;
  onAmount: (key: AmountKey, value: number) => void;
}

/** The left card: what the person runs, where, and what a bad stretch costs them. */
export function YouCard({ businessId, onBusiness, needs, city, cities, onCity, team, teams, onTeam, amounts, amountOf, onAmount }: YouCardProps) {
  // A saved city whose market has since expired must still show as the choice.
  const cityList = cities && city && !cities.includes(city) ? [city, ...cities] : cities;
  const leagues = [...new Set((teams ?? []).map((t) => t.league))];

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="display text-[20px] font-semibold">I run a</h2>
      <div className="flex flex-col gap-2">
        {BUSINESS_TYPES.map((b) => {
          const chosen = b.id === businessId;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={chosen}
              onClick={() => onBusiness(b.id)}
              className={cn(
                "press min-h-[52px] rounded-[18px] border-[1.5px] px-[18px] text-left text-[16px] font-semibold",
                chosen ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              {b.name}
            </button>
          );
        })}
      </div>

      {needs?.city ? (
        <Field label="Your city">
          <select className={inputClass} value={city ?? ""} onChange={(e) => onCity(e.target.value)}>
            <option value="" disabled>
              {cityList ? "Choose a city" : "Loading cities…"}
            </option>
            {cityList?.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {needs?.team ? (
        <Field label="Your team">
          <select
            className={inputClass}
            value={team ? teamKey(team) : ""}
            onChange={(e) => onTeam((teams ?? []).find((t) => teamKey(t) === e.target.value) ?? null)}
          >
            <option value="" disabled>
              {teams ? "Choose a team" : "Loading teams…"}
            </option>
            {leagues.map((league) => (
              <optgroup key={league} label={LEAGUE_LABELS[league] ?? league}>
                {teams?.filter((t) => t.league === league).map((t) => (
                  <option key={teamKey(t)} value={teamKey(t)}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      ) : null}

      {needs
        ? amountsOf(needs).map((a) => (
            <AmountTile key={a.key} label={a.label} value={amountOf(a.key)} guess={amounts[a.key] == null} onChange={(v) => onAmount(a.key, v)} />
          ))
        : null}
    </Card>
  );
}
