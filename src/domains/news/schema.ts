import { z } from "zod";

export const MAX_CARDS = 8;
export const MAX_TOPIC_CHARS = 60;
export const MAX_FACTS_CHARS = 300;
export const MAX_LINE_CHARS = 200;
// The prompt asks for 20 words, so a line that overshoots a little is kept.
export const MAX_LINE_WORDS = 24;

export interface NewsCard {
  id: string;
  topic: string;
  facts: string;
}

export type LineSource = "ai" | "numbers";

export interface NewsLine {
  text: string;
  source: LineSource;
}

export type NewsLines = Record<string, NewsLine>;

/** Drops control and invisible formatting characters, turns whitespace runs into one space. */
const squash = (s: string) =>
  s.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (/\s/.test(c) ? " " : "")).replace(/\s+/g, " ").trim();

const text = (max: number) => z.string().transform(squash).pipe(z.string().min(1).max(max));

export const newsRequest = z.object({
  cards: z
    .array(z.object({ id: text(100), topic: text(MAX_TOPIC_CHARS), facts: text(MAX_FACTS_CHARS) }))
    .min(1)
    .max(MAX_CARDS)
    .refine((cards) => new Set(cards.map((c) => c.id)).size === cards.length, "Card ids must be unique."),
});

const URL_LIKE = /https?:|www\.|\b[a-z0-9-]+\.(?:com|org|net|io|gov|edu|co|ai|app|ly|me|us|ca|uk)\b/i;
const MARKUP = /[<>`*#[\]{}\\|_]/;

/** What a model-written line must satisfy before a person sees it. Web content is untrusted, so this is the backstop. */
export const lineText = z
  .string()
  .transform(squash)
  .pipe(
    z
      .string()
      .min(1)
      .max(MAX_LINE_CHARS)
      .refine((s) => s.split(" ").length <= MAX_LINE_WORDS)
      .refine((s) => !URL_LIKE.test(s))
      .refine((s) => !MARKUP.test(s)),
  );
