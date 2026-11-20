"use client";

import { filledLegs } from "@/domains/cushion/price";
import type { CushionQuote } from "@/domains/cushion/types";
import type { Section } from "./ledger";
import { record } from "./store";

export interface Purchase {
  section: Section;
  title: string;
  detail: string;
  quote: CushionQuote;
  eventTickers: string[];
  expiry: string;
}

/** Books a simulated fill, then asks the server for an on-chain receipt without waiting on it. */
export function buyCushion({ section, title, detail, quote, eventTickers, expiry }: Purchase): string {
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const legs = filledLegs(quote);
  record({ type: "CushionBought", at, id, section, title, detail, legs, cost: quote.cost, maxPayout: quote.maxPayout, eventTickers, expiry });
  void requestReceipt({ id, at, title, cost: quote.cost, maxPayout: quote.maxPayout, legs });
  return id;
}

export interface ReceiptRequest {
  id: string;
  at: string;
  title: string;
  cost: number;
  maxPayout: number;
  legs: { symbol: string; side: "yes" | "no"; filled: number; cost: number }[];
}

/** A receipt that fails leaves the cushion in place; the account page offers a retry. */
export async function requestReceipt(receipt: ReceiptRequest): Promise<boolean> {
  try {
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...receipt,
        legs: receipt.legs.map(({ symbol, side, filled, cost }) => ({ symbol, side, filled, cost })),
      }),
    });
    if (!res.ok) return false;
    const { signature } = (await res.json()) as { signature?: string };
    if (!signature) return false;
    record({ type: "ReceiptRecorded", at: new Date().toISOString(), id: receipt.id, signature });
    return true;
  } catch {
    return false;
  }
}
