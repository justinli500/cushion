"use client";

import { useState } from "react";
import { CarRender } from "@/components/car-render";
import { Button, Card, Chip, Tag } from "@/components/kit";
import { CARS, carOf, gallonsFor, MILES, TYPICAL_MILES } from "@/domains/exposure/bills-car";
import { cn } from "@/lib/utils";

const MILE_CHOICES = [500, 1000, 1500, 2000];

interface Props {
  car: string | null;
  miles: number | null;
  onSave: (gallons: number, car: string, miles: number) => void;
  /** For someone who knows their gallons and would rather type them. */
  onManual: () => void;
  /** Present when the question can be dismissed. */
  onCancel?: () => void;
}

/** Works out the gas someone buys from the kind of car they drive and how far they drive it. */
export function GasSetup({ car: savedCar, miles: savedMiles, onSave, onManual, onCancel }: Props) {
  const [carId, setCarId] = useState(carOf(savedCar).id);
  const [miles, setMiles] = useState(savedMiles ?? TYPICAL_MILES);
  const car = carOf(carId);
  const gallons = gallonsFor(car, miles);

  return (
    <Card className="arrive flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="display text-[24px] font-bold tracking-[-0.02em]">What do you drive?</h2>
          <p className="text-[15px] text-body">Pick the kind of car and how far you drive it. Cushion works out the gas.</p>
        </div>
        <Tag>Estimate</Tag>
      </div>

      <div className="flex flex-wrap items-stretch gap-5">
        {/* The chosen car on a studio floor, with the others to pick from beneath it. */}
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-3">
          <div className="flex flex-col items-center rounded-[24px] bg-linear-to-b from-muted to-secondary px-6 pb-4 pt-6">
            <CarRender key={car.id} kind={car.id} className="arrive w-full max-w-[560px]" />
            <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-3">
              <span className="display text-[22px] font-semibold">{car.name}</span>
              <span className="tabular text-[14px] text-body">about {car.mpg} miles a gallon</span>
            </div>
          </div>
          <div role="group" aria-label="Choose a kind of car" className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2">
            {CARS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === car.id}
                onClick={() => setCarId(option.id)}
                className={cn(
                  "press flex min-h-11 flex-col items-center gap-0.5 rounded-[18px] border-2 bg-muted px-2 pb-2 pt-1.5 text-[13px] font-semibold",
                  option.id === car.id ? "border-primary" : "border-transparent hover:bg-secondary",
                )}
              >
                <CarRender kind={option.id} className="w-full" />
                {option.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-[24px] bg-muted p-5">
            <label htmlFor="miles" className="text-[13px] font-semibold text-muted-foreground">
              How far do you drive in a month?
            </label>
            <span className="display tabular text-[34px] font-bold leading-none tracking-[-0.02em]">
              {miles.toLocaleString("en-US")} <span className="text-[17px] font-semibold text-body">miles</span>
            </span>
            <input
              id="miles"
              type="range"
              min={MILES.min}
              max={MILES.max}
              step={MILES.step}
              value={miles}
              onChange={(e) => setMiles(Number(e.target.value))}
              className="h-11 w-full cursor-pointer accent-primary"
            />
            <div className="flex flex-wrap gap-2">
              {MILE_CHOICES.map((choice) => (
                <Chip key={choice} small pressed={miles === choice} onClick={() => setMiles(choice)}>
                  {choice.toLocaleString("en-US")}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-[24px] bg-panel p-5 text-white">
            <span className="text-[13px] text-panel-foreground">That is about</span>
            <span className="display tabular text-[40px] font-bold leading-none tracking-[-0.03em]">
              {gallons.toLocaleString("en-US")} <span className="text-[18px] font-semibold text-panel-foreground">gallons a month</span>
            </span>
            <span className="tabular mt-1 text-[13px] text-panel-foreground">
              {miles.toLocaleString("en-US")} miles ÷ {car.mpg} miles a gallon
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => onSave(gallons, car.id, miles)}>Use this</Button>
            {onCancel ? (
              <Button variant="quiet" onClick={onCancel}>
                Not now
              </Button>
            ) : null}
          </div>
          <button type="button" onClick={onManual} className="press min-h-11 self-start text-[14px] font-semibold text-foreground underline underline-offset-4">
            I know my gallons, let me type them
          </button>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Miles a gallon is a typical figure for a recent car of that kind, not your own car&rsquo;s rating. An electric car buys no gas, so there is nothing here to cushion for one.
      </p>
    </Card>
  );
}
