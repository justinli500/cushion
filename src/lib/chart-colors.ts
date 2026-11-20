/**
 * Chart series colors, checked with the dataviz palette validator against the card surface.
 * Plain values, not CSS variables: Tailwind drops custom properties no utility class uses, and
 * these are only ever referenced from chart props.
 */
export const CHART = {
  /** The protected outcome, or the first of two series. */
  first: "#17866a",
  /** The unprotected outcome, or the second of two series. */
  second: "#b9502f",
} as const;
