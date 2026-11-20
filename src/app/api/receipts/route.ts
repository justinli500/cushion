import { buildMemo } from "@/domains/receipts/memo";
import { receiptSchema } from "@/domains/receipts/schema";
import { ReceiptUnavailable, sendMemo } from "@/domains/receipts/send";
import { badRequest } from "@/lib/http";
import { throttle, tooMany } from "@/lib/throttle";

export const maxDuration = 30;

const MAX_BODY_BYTES = 16 * 1024;
const MAX_TRACKED = 1000;

const throttled = throttle(20);

// Lives in this process only. On serverless a retry that lands on a cold instance can write a second memo for the same id.
const sent = new Map<string, Promise<string>>();

function evictOldest(map: Map<string, unknown>) {
  if (map.size >= MAX_TRACKED) map.delete(map.keys().next().value!);
}

/** One transaction per receipt id: a repeat or a concurrent request shares the first one's outcome, and only a failure is forgotten. */
function sendOnce(id: string, send: () => Promise<string>): Promise<string> {
  let promise = sent.get(id);
  if (!promise) {
    evictOldest(sent);
    promise = send();
    sent.set(id, promise);
    promise.catch(() => sent.delete(id));
  }
  return promise;
}

/** POST /api/receipts writes a purchase to Solana devnet as a memo and returns the transaction signature. */
export async function POST(request: Request) {
  if (throttled(request)) return tooMany("Too many receipts at once. Wait a minute and try again.");
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return badRequest("That receipt is too large.");
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return badRequest("That receipt is too large.");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return badRequest("Send the receipt as JSON.");
  }
  const parsed = receiptSchema.safeParse(body);
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
    return badRequest(`That receipt is not valid. ${problems.join("; ")}`);
  }

  try {
    const signature = await sendOnce(parsed.data.id, () => sendMemo(buildMemo(parsed.data)));
    return Response.json({ signature });
  } catch (error) {
    const known = error instanceof ReceiptUnavailable;
    console.error("receipt not written:", known ? [error.message, error.cause instanceof Error && error.cause.message] : "unexpected failure");
    return Response.json({ error: known ? error.message : "Receipts are unavailable right now." }, { status: 503 });
  }
}
