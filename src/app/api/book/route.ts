import { getBook, isSymbol } from "@/domains/markets/gemini";
import type { Book } from "@/domains/markets/types";
import { badRequest, respond } from "@/lib/http";

const MAX_SYMBOLS = 40;

/** GET /api/book?symbols=GEMI-A,GEMI-B returns the live YES book for each symbol. */
export function GET(request: Request) {
  const symbols = [...new Set((new URL(request.url).searchParams.get("symbols") ?? "").split(",").filter(Boolean))];
  if (symbols.length === 0 || symbols.length > MAX_SYMBOLS || !symbols.every(isSymbol)) {
    return badRequest(`Pass 1 to ${MAX_SYMBOLS} contract symbols.`);
  }
  return respond(async () => {
    // One missing book should not blank the ticket, so each symbol fails on its own.
    const settled = await Promise.allSettled(symbols.map(getBook));
    const books: Record<string, Book> = {};
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") books[symbols[i]] = result.value;
    });
    return { books };
  });
}
