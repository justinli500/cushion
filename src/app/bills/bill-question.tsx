"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { BILLS, parseAmount, type BillKind } from "@/domains/exposure/bills";
import { formatUsdWhole } from "@/lib/format";

const QUESTIONS: Record<BillKind, { label: string; hint: string; unit: string }> = {
  gas: {
    label: "How many gallons of gas do you buy in a month?",
    hint: "A recent receipt or card statement will tell you. A rough number is fine.",
    unit: "gallons",
  },
  heating: {
    label: "What does your heating bill come to in a typical winter month?",
    hint: "A rough number is fine. Utility rates barely follow daily gas prices, so this stays a rough estimate.",
    unit: "dollars",
  },
};

interface Props {
  bill: BillKind;
  initial: number | null;
  onSave: (amount: number) => void;
  /** Present when the question can be dismissed. */
  onCancel?: () => void;
  /** Swaps to the other question on first use. */
  onSwitch?: () => void;
}

/** Asks one thing: how much of one bill the person has. */
export function BillQuestion({ bill, initial, onSave, onCancel, onSwitch }: Props) {
  const [text, setText] = useState(initial == null ? "" : String(initial));
  const [problem, setProblem] = useState<string | null>(null);
  const { label, hint, unit } = QUESTIONS[bill];
  const max = BILLS[bill].max;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = parseAmount(bill, text);
    if (amount == null) {
      setProblem(`Enter a number above 0 and up to ${bill === "gas" ? max.toLocaleString("en-US") : formatUsdWhole(max)}.`);
      return;
    }
    onSave(amount);
  };

  return (
    <Card className="arrive max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label={label}>
          <div className="flex items-center gap-3">
            <input
              className={`${inputClass} max-w-[160px] tabular`}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setProblem(null);
              }}
              aria-invalid={problem != null}
              aria-label={`${unit} a month`}
            />
            <span className="text-[14px] text-muted">{unit} a month</span>
          </div>
        </Field>
        <p className="text-[13px] leading-relaxed text-muted">{hint}</p>
        {problem ? <p className="text-[13px] text-loss">{problem}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit">Continue</Button>
          {onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Not now
            </Button>
          ) : null}
          {onSwitch ? (
            <button type="button" onClick={onSwitch} className="press text-[13px] text-muted underline-offset-2 hover:underline">
              {bill === "gas" ? "I only want heating cover" : "I only want gas cover"}
            </button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
