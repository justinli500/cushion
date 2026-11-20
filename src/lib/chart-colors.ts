/**
 * Chart series colors, checked with the dataviz palette validator against the card surface
 * (#272727). They are a step darker than the interface's lavender and gold so that both sit inside
 * the lightness band the validator asks of series on a dark background.
 */
export const CHART = {
  /** The protected outcome, or the first of two series. */
  first: "#8b7ff0",
  /** The unprotected outcome, or the second of two series. */
  second: "#b98c2a",
} as const;
