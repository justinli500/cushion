/**
 * Chart series colors: the handoff's blue for covered and its orange for risk. Checked with the
 * dataviz palette validator as a pair on the white card (light mode, surface #ffffff).
 */
export const CHART = {
  /** The protected outcome, or the first of two series. */
  first: "#2447f9",
  /** The unprotected outcome, or the second of two series. */
  second: "#b45309",
} as const;
