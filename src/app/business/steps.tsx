"use client";

import { useState, type ReactNode } from "react";
import { Button, Field, Notice, Skeleton, inputClass } from "@/components/kit";
import { BUSINESS_TYPES, type Needs } from "@/domains/exposure/business";

export type StepId = "type" | "city" | "team" | "badDay" | "spend";

export const QUESTIONS: Record<StepId, string> = {
  type: "What do you run?",
  city: "Where are you based?",
  team: "Which team is yours?",
  badDay: "What does a bad day cost you?",
  spend: "What do you spend each month?",
};

/** The questions this business has to answer, in the order they are asked. */
export function stepsOf(needs: Needs | null): StepId[] {
  const steps: StepId[] = ["type"];
  if (needs?.city) steps.push("city");
  if (needs?.team) steps.push("team");
  if (needs?.badDay) steps.push("badDay");
  if (needs && needs.costs.length > 0) steps.push("spend");
  return steps;
}

/** One question: the question as a heading while it is open, or the answer with a way back to it. */
export function Step({ question, answer, open, onOpen, children }: { question: string; answer: ReactNode; open: boolean; onOpen: () => void; children: ReactNode }) {
  if (open) {
    return (
      <div className="arrive py-5 first:pt-0 last:pb-0">
        <h2 className="mb-4 text-[17px] font-semibold tracking-tight">{question}</h2>
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <p className="text-[13px] text-muted-foreground">{question}</p>
      <p className="flex items-baseline gap-3 text-[14px] font-medium">
        {answer}
        <button type="button" onClick={onOpen} className="press text-[13px] font-normal text-muted-foreground underline-offset-2 hover:underline">
          Change
        </button>
      </p>
    </div>
  );
}

export function TypeGrid({ selected, onPick }: { selected: string | null; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {BUSINESS_TYPES.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onPick(b.id)}
          className={`press rounded-xl border p-3.5 text-left ${b.id === selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-foreground/30"}`}
        >
          <span className="block text-[14px] font-medium">{b.name}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{b.blurb}</span>
        </button>
      ))}
    </div>
  );
}

export interface Option {
  key: string;
  label: string;
  hint?: string;
}

const SHOWN = 12;

/** A searchable list for choices too long to show at once: about 60 cities, hundreds of teams. */
export function Picker({ options, selected, noun, onPick }: { options: Option[]; selected: string | null; noun: string; onPick: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
  const shown = matches.slice(0, SHOWN);

  return (
    <div>
      <input
        className={inputClass}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search for your ${noun}`}
        aria-label={`Search for your ${noun}`}
        autoFocus
      />
      {shown.length === 0 ? (
        <div className="mt-3">
          <Notice>{q ? `No ${noun} matches "${query.trim()}". Check the spelling or try another.` : `No ${noun}s are listed right now.`}</Notice>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {shown.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onPick(o.key)}
              className={`press flex items-baseline justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[14px] ${o.key === selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-foreground/30"}`}
            >
              <span className="truncate">{o.label}</span>
              {o.hint ? <span className="shrink-0 text-[12px] text-muted-foreground/70">{o.hint}</span> : null}
            </button>
          ))}
        </div>
      )}
      {matches.length > shown.length ? (
        <p className="mt-3 text-[13px] text-muted-foreground/70">
          Showing {shown.length} of {matches.length}. Type to narrow it down.
        </p>
      ) : null}
    </div>
  );
}

export function PickerSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export interface AmountField {
  key: string;
  label: string;
  placeholder: string;
}

/** One or more dollar amounts, all required and above zero. */
export function AmountForm({ fields, initial, hint, onDone }: { fields: AmountField[]; initial: Record<string, number | undefined>; hint: string; onDone: (values: Record<string, number>) => void }) {
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ? String(initial[f.key]) : ""])));
  const values = Object.fromEntries(fields.map((f) => [f.key, Number(text[f.key].replace(/[$,\s]/g, "") || NaN)]));
  const valid = fields.every((f) => Number.isFinite(values[f.key]) && values[f.key] > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onDone(values);
      }}
    >
      <div className="space-y-3">
        {fields.map((f, i) => (
          <Field key={f.key} label={f.label}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground/70">$</span>
              <input
                className={`${inputClass} tabular pl-7`}
                inputMode="decimal"
                value={text[f.key]}
                onChange={(e) => setText({ ...text, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                autoFocus={i === 0}
              />
            </div>
          </Field>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{hint}</p>
      <div className="mt-4">
        <Button type="submit" disabled={!valid}>
          Continue
        </Button>
      </div>
    </form>
  );
}
