/** A kind of home, with a winter month's heating bill for it in a cold winter at 68°F. */
export interface Home {
  id: string;
  name: string;
  bill: number;
}

// ponytail: round figures chosen for this demo, not measured ones. The page calls the result a rough
// estimate and offers typing the real bill. Use the person's own utility data if this ever needs to be right.
export const HOMES: Home[] = [
  { id: "apartment", name: "Apartment", bill: 60 },
  { id: "townhouse", name: "Townhouse", bill: 95 },
  { id: "house", name: "House", bill: 130 },
  { id: "large", name: "Large house", bill: 200 },
];

/** How hard the winter is, as a multiple of a cold one. */
export const WINTERS = [
  { id: "mild", name: "Mild", factor: 0.6 },
  { id: "cold", name: "Cold", factor: 1 },
  { id: "harsh", name: "Very cold", factor: 1.4 },
] as const;

/**
 * What heats the home, and so which market its bill follows. Gas follows natural gas. Oil and
 * propane follow oil, so their cushion is built on the oil market. Gemini lists no electricity
 * market, so electric heat stays on natural gas and says the match is weak.
 */
export const HEAT = [
  { id: "gas", name: "Gas", note: null, weak: false },
  { id: "electric", name: "Electric", note: "Electric heat follows power prices, which only loosely follow natural gas. This cushion is a weak match for it.", weak: true },
  { id: "oil", name: "Oil or propane", note: null, weak: false },
] as const;

export const THERMOSTAT = { min: 60, max: 76, typical: 68 } as const;
/** A common rule of thumb: each degree on the thermostat moves the bill about 3%. */
const PER_DEGREE = 0.03;

export const homeOf = (id: string | null | undefined): Home => HOMES.find((h) => h.id === id) ?? HOMES[2];
export const winterOf = (id: string | null | undefined) => WINTERS.find((w) => w.id === id) ?? WINTERS[1];
export const heatOf = (id: string | null | undefined) => HEAT.find((h) => h.id === id) ?? HEAT[0];

/** A winter month's heating bill in whole dollars. */
export function heatingBill(home: Home, winter: { factor: number }, thermostat: number): number {
  return Math.max(1, Math.round(home.bill * winter.factor * (1 + PER_DEGREE * (thermostat - THERMOSTAT.typical))));
}

/** How warm the home is kept, from 0 at the lowest setting to 1 at the highest. */
export const warmthOf = (thermostat: number) => Math.min(1, Math.max(0, (thermostat - THERMOSTAT.min) / (THERMOSTAT.max - THERMOSTAT.min)));
