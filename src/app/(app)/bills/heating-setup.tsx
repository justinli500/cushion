"use client";

import { useState } from "react";
import { HomeRender } from "@/components/home-render";
import { Button, Card, Chip, Tag } from "@/components/kit";
import { HEAT, heatingBill, heatOf, homeOf, HOMES, THERMOSTAT, warmthOf, winterOf, WINTERS } from "@/domains/exposure/bills-home";
import { formatUsdWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface HomeChoice {
  home: string;
  winter: string;
  heat: string;
  thermostat: number;
}

interface Props {
  saved: Partial<{ [K in keyof HomeChoice]: HomeChoice[K] | null }>;
  onSave: (bill: number, choice: HomeChoice) => void;
  /** For someone who knows their bill and would rather type it. */
  onManual: () => void;
  /** Present when the question can be dismissed. */
  onCancel?: () => void;
}

/** Works out a winter heating bill from the kind of home, how warm it is kept, and how hard the winter is. */
export function HeatingSetup({ saved, onSave, onManual, onCancel }: Props) {
  const [homeId, setHomeId] = useState(homeOf(saved.home).id);
  const [winterId, setWinterId] = useState<string>(winterOf(saved.winter).id);
  const [heatId, setHeatId] = useState<string>(heatOf(saved.heat).id);
  const [thermostat, setThermostat] = useState(saved.thermostat ?? THERMOSTAT.typical);
  const home = homeOf(homeId), winter = winterOf(winterId), heat = heatOf(heatId);
  const bill = heatingBill(home, winter, thermostat);
  const snow = WINTERS.findIndex((w) => w.id === winter.id);

  return (
    <Card className="arrive flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="display text-[24px] font-bold tracking-[-0.02em]">Where do you live, and how warm do you keep it?</h2>
          <p className="text-[15px] text-body">Pick the kind of home, set the thermostat and say how cold your winter is. Cushion works out a winter month&rsquo;s bill.</p>
        </div>
        <Tag>Rough estimate</Tag>
      </div>

      <div className="flex flex-wrap items-stretch gap-5">
        {/* The chosen home at dusk, its windows as warm as the thermostat, with the others beneath it. */}
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-3">
          <div className="flex flex-col items-center rounded-[24px] bg-panel px-6 pb-5 pt-3 text-white">
            <HomeRender key={home.id} kind={home.id} warmth={warmthOf(thermostat)} snow={snow} className="arrive w-full max-w-[440px]" />
            <div className="flex flex-wrap items-baseline justify-center gap-x-3">
              <span className="display text-[22px] font-semibold">{home.name}</span>
              <span className="tabular text-[14px] text-panel-foreground">kept at {thermostat}°F</span>
            </div>
          </div>
          <div role="group" aria-label="Choose a kind of home" className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
            {HOMES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === home.id}
                onClick={() => setHomeId(option.id)}
                className={cn("press flex min-h-11 flex-col items-center gap-1 rounded-[18px] border-2 bg-panel px-2 pb-2 pt-1 text-[13px] font-semibold text-white", option.id === home.id ? "border-primary" : "border-transparent")}
              >
                <HomeRender kind={option.id} warmth={0.6} className="w-full" />
                {option.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-[24px] bg-muted p-5">
            <label htmlFor="thermostat" className="text-[13px] font-semibold text-muted-foreground">
              What do you set the thermostat to?
            </label>
            <span className="display tabular text-[34px] font-bold leading-none tracking-[-0.02em]">{thermostat}°F</span>
            <input
              id="thermostat"
              type="range"
              min={THERMOSTAT.min}
              max={THERMOSTAT.max}
              step={1}
              value={thermostat}
              onChange={(e) => setThermostat(Number(e.target.value))}
              className="h-11 w-full cursor-pointer accent-primary"
            />
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-muted-foreground">How cold is your winter?</span>
              <div className="flex flex-wrap gap-2">
                {WINTERS.map((option) => (
                  <Chip key={option.id} small pressed={option.id === winter.id} onClick={() => setWinterId(option.id)}>
                    {option.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-muted-foreground">What heats your home?</span>
              <div className="flex flex-wrap gap-2">
                {HEAT.map((option) => (
                  <Chip key={option.id} small pressed={option.id === heat.id} onClick={() => setHeatId(option.id)}>
                    {option.name}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-[24px] bg-panel p-5 text-white">
            <span className="text-[13px] text-panel-foreground">That is about</span>
            <span className="display tabular text-[40px] font-bold leading-none tracking-[-0.03em]">
              {formatUsdWhole(bill)} <span className="text-[18px] font-semibold text-panel-foreground">a month in winter</span>
            </span>
            <span className="mt-1 text-[13px] text-panel-foreground">
              {home.name.toLowerCase()}, {winter.name.toLowerCase()} winter, {thermostat}°F
            </span>
          </div>

          {heat.match ? <p className="rounded-[18px] bg-no px-4 py-3 text-[14px] leading-relaxed text-no-foreground">{heat.match}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => onSave(bill, { home: home.id, winter: winter.id, heat: heat.id, thermostat })}>Use this</Button>
            {onCancel ? (
              <Button variant="quiet" onClick={onCancel}>
                Not now
              </Button>
            ) : null}
          </div>
          <button type="button" onClick={onManual} className="press min-h-11 self-start text-[14px] font-semibold text-foreground underline underline-offset-4">
            I know my bill, let me type it
          </button>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        These are round figures for a typical home of each kind, with about 3% added or taken off for each degree on the thermostat. Insulation, rates and the size of your
        home move a real bill a long way, so type your own if you know it.
      </p>
    </Card>
  );
}
