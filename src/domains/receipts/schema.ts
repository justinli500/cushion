import { z } from "zod";
import { isSymbol } from "@/domains/markets/gemini";

const amount = z.number().nonnegative();

/** The part of a purchase that goes on chain. Title and anything else the app sends is dropped here. */
export const receiptSchema = z.object({
  id: z.uuid().transform((id) => id.toLowerCase()),
  at: z.iso.datetime(),
  cost: amount,
  maxPayout: amount,
  legs: z
    .array(z.object({ symbol: z.string().refine(isSymbol, "not a market symbol"), side: z.enum(["yes", "no"]), filled: amount, cost: amount }))
    .min(1)
    .max(40),
});

export type Receipt = z.infer<typeof receiptSchema>;
