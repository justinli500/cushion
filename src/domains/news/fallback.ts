import { MAX_LINE_CHARS } from "./schema";

/** Turns the numbers a card already shows into one clean sentence, with no model involved. */
export function numbersLine(facts: string): string {
  const text = facts.replace(/\s+/g, " ").trim();
  // Slicing one character past the cap tells a word that ends exactly at the cap from one cut in half.
  const clipped =
    text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS + 1).replace(/\s\S*$/, "")}…` : text;
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped}.`;
}
