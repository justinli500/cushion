import { createHash } from "node:crypto";
import type { Receipt } from "./schema";

export const MEMO_MAX_BYTES = 500;

type MemoLeg = [symbol: string, side: "y" | "n", filled: number];

interface Memo {
  app: "cushion";
  v: 1;
  id: string;
  at: string;
  cost: number;
  pays: number;
  legs: MemoLeg[];
  more?: number;
  sha256?: string;
}

const cents = (n: number) => Number(n.toFixed(2));
const bytes = (text: string) => Buffer.byteLength(text);

/**
 * The text a receipt writes to the Memo program, at most MEMO_MAX_BYTES of UTF-8. A public chain gets no title and
 * nothing personal. When every leg does not fit, the memo keeps as many as fit, counts the rest in `more`, and
 * carries `sha256`: the hex digest of the UTF-8 JSON this function would have produced had every leg fit
 * (same keys, same order, same rounding), so anyone holding the full receipt can check the memo against it.
 */
export function buildMemo(receipt: Receipt): string {
  const memo: Memo = {
    app: "cushion",
    v: 1,
    id: receipt.id,
    at: new Date(receipt.at).toISOString(),
    cost: cents(receipt.cost),
    pays: cents(receipt.maxPayout),
    legs: receipt.legs.map((leg): MemoLeg => [leg.symbol, leg.side === "yes" ? "y" : "n", cents(leg.filled)]),
  };
  const full = JSON.stringify(memo);
  if (bytes(full) <= MEMO_MAX_BYTES) return full;

  const sha256 = createHash("sha256").update(full).digest("hex");
  const trimmed = (kept: number) =>
    JSON.stringify({ ...memo, legs: memo.legs.slice(0, kept), more: memo.legs.length - kept, sha256 });
  for (let kept = memo.legs.length - 1; kept > 0; kept--) {
    const text = trimmed(kept);
    if (bytes(text) <= MEMO_MAX_BYTES) return text;
  }
  return trimmed(0);
}
