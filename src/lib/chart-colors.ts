/**
 * Chart series colors, checked with the dataviz palette validator against the dark card surface
 * (#0d0f11). They are a step darker than the interface's cyan so that both sit inside the
 * lightness band the validator asks of series on a dark background.
 */
export const CHART = {
  /** The protected outcome, or the first of two series. */
  first: "#1b9fda",
  /** The unprotected outcome, or the second of two series. */
  second: "#d6781a",
} as const;
