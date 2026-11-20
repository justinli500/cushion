import { newsClient, writeLines } from "@/domains/news/service";
import { newsRequest } from "@/domains/news/schema";
import { badRequest, respond } from "@/lib/http";
import { throttle, tooMany } from "@/lib/throttle";

// A web-search call can run up to 25 seconds before the service gives up and uses the numbers.
export const maxDuration = 60;

const MAX_BODY_CHARS = 20_000;

// Each uncached request can spend model tokens and web searches, so one client cannot ask without limit.
const throttled = throttle(12, 60);

function parse(raw: string) {
  try {
    return newsRequest.safeParse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** POST /api/news with 1 to 8 cards returns one plain line per card, written by Claude or built from the card's numbers. */
export async function POST(request: Request) {
  if (throttled(request)) return tooMany("Too many requests. Wait a minute and try again.");
  const raw = await request.text();
  const body = raw.length > MAX_BODY_CHARS ? null : parse(raw);
  if (!body?.success) {
    return badRequest("Send 1 to 8 cards. Each needs a unique id, a topic up to 60 characters and facts up to 300.");
  }
  return respond(async () => ({ lines: await writeLines(body.data.cards, newsClient()) }));
}
