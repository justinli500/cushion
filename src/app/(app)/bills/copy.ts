import type { BillKind, CoverLevel } from "@/domains/exposure/bills";
import { formatLevel } from "@/lib/format";

export const LEVEL_NAMES: Record<CoverLevel, string> = { spike: "Spikes only", full: "Full" };

/** `jump` is a price rise used to show what the bill would do, and `jumpText` is how to say it. */
export const COPY: Record<BillKind, { name: string; commodity: string; unit: string; jump: number; jumpText: string }> = {
  gas: { name: "Gas", commodity: "oil", unit: " a barrel", jump: 5, jumpText: "$5 a barrel" },
  heating: { name: "Heating", commodity: "natural gas", unit: "", jump: 0.5, jumpText: "50 cents" },
};

/** The wording for a bill. A home heated with oil or propane follows oil, so its heating bill is worded like one. */
export const copyFor = (bill: BillKind, heat?: string | null) => (bill === "heating" && heat === "oil" ? { ...COPY.gas, name: COPY.heating.name } : COPY[bill]);

/** One plain sentence on when a cover pays, for a cover that starts at `level`. */
export function payIfSentence(bill: BillKind, level: number, when: string, heat?: string | null): string {
  const { name, commodity, unit } = copyFor(bill, heat);
  return `If ${commodity} climbs past $${formatLevel(level)}${unit} ${when}, this pays back part of what your ${name.toLowerCase()} costs you.`;
}
