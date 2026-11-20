/** A kind of car, with the fuel economy typical of a recent one. */
export interface Car {
  id: string;
  name: string;
  /** Miles per gallon, city and highway combined. A round, typical figure for the class, not any one model's rating. */
  mpg: number;
}

// ponytail: six body types with one typical figure each. Look up the person's exact model (fueleconomy.gov has the data) if precision ever matters.
export const CARS: Car[] = [
  { id: "compact", name: "Compact", mpg: 33 },
  { id: "sedan", name: "Sedan", mpg: 30 },
  { id: "hybrid", name: "Hybrid", mpg: 48 },
  { id: "suv", name: "SUV", mpg: 26 },
  { id: "pickup", name: "Pickup", mpg: 20 },
  { id: "sports", name: "Sports car", mpg: 22 },
];

export const DEFAULT_CAR = "sedan";
/** About what an American driver covers in a month. */
export const TYPICAL_MILES = 1000;
export const MILES = { min: 100, max: 3000, step: 50 } as const;

export const carOf = (id: string | null | undefined): Car => CARS.find((car) => car.id === id) ?? CARS.find((car) => car.id === DEFAULT_CAR)!;

/** Gallons bought in a month, to one decimal place. */
export const gallonsFor = (car: Car, milesPerMonth: number): number => Math.round((milesPerMonth / car.mpg) * 10) / 10;
