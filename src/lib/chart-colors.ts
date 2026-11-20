/**
 * Chart series colors, from the theme: violet and orange in light mode, the Drop's lavender and
 * peach in dark mode. Each pair differs in lightness as well as hue, so it reads without color too.
 */
export const CHART = {
  /** The protected outcome, or the first of two series. */
  first: "var(--chart-first)",
  /** The unprotected outcome, or the second of two series. */
  second: "var(--chart-second)",
} as const;
