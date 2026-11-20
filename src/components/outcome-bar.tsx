import type { ReactNode } from "react";
import { formatChance } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  /** The market's chance of this outcome, from 0 to 1, or null when nobody is quoting it. */
  chance: number | null;
  /** True when the chance is a rough read from a thin market: it is dimmed and marked. */
  rough?: boolean;
  /** Tints the bar, for the outcome the person cares about. */
  emphasis?: boolean;
  /** Sits before the label: a badge or a control. */
  leading?: ReactNode;
  /** Sits before the percentage: a score, for instance. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * One outcome as a row whose background fills to the market's chance, so the number can be read at
 * a glance and compared with the rows around it.
 */
export function OutcomeBar({ label, chance, rough = false, emphasis = false, leading, trailing, className }: Props) {
  const width = chance == null ? 0 : Math.max(0, Math.min(1, chance)) * 100;
  return (
    <div className={cn("relative flex h-11 items-center gap-3 overflow-hidden rounded-full bg-secondary pl-2 pr-4", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out",
          emphasis ? "bg-primary/25" : "bg-foreground/[0.07]",
        )}
        style={{ width: `${width}%` }}
      />
      {leading ? <span className="relative shrink-0">{leading}</span> : null}
      <span className={cn("relative min-w-0 flex-1 truncate text-[15px]", !leading && "pl-2")}>{label}</span>
      {trailing ? <span className="tabular relative shrink-0 text-[15px] font-semibold">{trailing}</span> : null}
      <span
        className={cn("tabular relative w-12 shrink-0 text-right text-[16px] font-semibold", (rough || chance == null) && "text-muted-foreground")}
        title={rough ? "A rough read: not many people are trading this" : undefined}
      >
        {rough && chance != null ? "~" : ""}
        {chance == null ? "n/a" : formatChance(chance)}
      </span>
    </div>
  );
}
