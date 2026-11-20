import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button as BaseButton } from "@/components/ui/button";
import { Card as BaseCard } from "@/components/ui/card";
import { Skeleton as BaseSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Cushion's own building blocks, each following the design handoff and sitting on a shadcn/ui
 * component where one fits. Pages use these so sizes, shapes and tones are decided in one place.
 */

export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-7 flex flex-col gap-2">
      <h1 className="display text-[clamp(32px,3.6vw,46px)] font-bold leading-[1.05] tracking-[-0.025em]">{title}</h1>
      <p className="max-w-[640px] text-[17px] text-body">{lead}</p>
    </header>
  );
}

/** A white card: 28px corners, no border, no shadow. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <BaseCard className={cn("block gap-0 rounded-[28px] p-6 text-base ring-0", className)}>{children}</BaseCard>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="display text-[20px] font-semibold tracking-[-0.01em]">{children}</h2>
      {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

const TONES = {
  /** Estimates, simulations and thin markets: things to read with care. */
  note: "bg-secondary text-muted-foreground",
  /** Covered, paid back, live: blue. */
  cushion: "bg-primary text-primary-foreground",
  /** Risk or loss: orange, always beside words that say so. */
  loss: "bg-risk-fill text-foreground",
  plain: "bg-secondary text-foreground",
};

export function Tag({ children, tone = "note" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <Badge className={cn("h-auto rounded-[10px] px-2.5 py-1 text-[12px] font-semibold", TONES[tone])}>{children}</Badge>;
}

const BUTTONS = {
  /** The main action: 52px, blue. */
  primary: "h-[52px] bg-cta px-7 text-[16px] text-cta-foreground hover:bg-cta/90",
  /** A second action on a light surface: 44px, outlined. */
  quiet: "h-11 border-[1.5px] border-border bg-card px-5 text-[15px] text-foreground hover:bg-secondary",
  /** An action inside a card: 48px, ink. */
  dark: "h-12 bg-foreground px-6 text-[15px] text-background hover:bg-foreground/90",
  /** The main action on the dark panel: 52px, the Drop's lavender, lit from below. */
  light:
    "h-[52px] bg-[#c3b5ff] px-7 text-[16px] text-[#12101f] shadow-[0_0_0_1px_rgb(255_255_255/0.15),0_12px_36px_rgb(195_181_255/0.35)] hover:bg-[#d2c7ff]",
};

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  wide = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: keyof typeof BUTTONS;
  type?: "button" | "submit";
  /** Fills its container. */
  wide?: boolean;
}) {
  return (
    <BaseButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn("press rounded-full border-transparent font-semibold disabled:cursor-not-allowed", BUTTONS[variant], wide && "w-full")}
    >
      {children}
    </BaseButton>
  );
}

/** A choice chip: fully rounded, 44px, dark when chosen. */
export function Chip({ children, pressed, onClick, small = false }: { children: ReactNode; pressed: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "press tabular inline-flex items-center rounded-full border-[1.5px] font-semibold",
        small ? "min-h-9 px-3.5 text-[14px]" : "min-h-11 px-[18px] text-[15px]",
        pressed ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** The look of an input on a white card: a ground-colored field, 44px tall. */
export const inputClass =
  "h-11 w-full min-w-0 rounded-[14px] border-[1.5px] border-transparent bg-muted px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25";

export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <BaseSkeleton className={cn("bg-track", className)} aria-hidden />;
}

/** A quiet message for empty, unavailable, or error states. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <Alert className="rounded-[18px] border-transparent bg-muted px-4 py-3" role="status">
      <AlertDescription className="text-[14px] leading-relaxed text-body">{children}</AlertDescription>
    </Alert>
  );
}

/** A page body with its summary beside it: content takes the room, the panel keeps to about 340px, and they stack on a narrow screen. */
export function WithTicket({ children, ticket }: { children: ReactNode; ticket: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">{children}</div>
      <aside className="sticky top-6 min-w-0 flex-[1_1_340px]">{ticket}</aside>
    </div>
  );
}

/** The dark panel that carries a cushion's summary. */
export function Panel({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5 rounded-[28px] bg-panel p-6 text-white", className)}>
      {label ? <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-panel-foreground">{label}</span> : null}
      {children}
    </div>
  );
}

/** One number with its caption, as a tile. On the dark panel the tile is the panel's inner color. */
export function Tile({ label, value, tone = "light", className }: { label: string; value: ReactNode; tone?: "light" | "ink" | "panel" | "ground"; className?: string }) {
  const tones = {
    light: "bg-card text-foreground [&>span:first-child]:text-muted-foreground",
    ground: "bg-muted text-foreground [&>span:first-child]:text-muted-foreground",
    ink: "bg-panel text-white [&>span:first-child]:text-panel-foreground",
    panel: "bg-panel-tile text-white [&>span:first-child]:text-panel-foreground",
  };
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-[18px] p-4", tones[tone], className)}>
      <span className="text-[13px]">{label}</span>
      <span className="display tabular text-[28px] font-bold leading-tight">{value}</span>
    </div>
  );
}

/** "You pay" beside "Cushion pays". */
export function QuotePair({ pay, pays, paysLabel = "Cushion pays", onDark = false }: { pay: ReactNode; pays: ReactNode; paysLabel?: string; onDark?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile label="You pay" value={pay} tone={onDark ? "panel" : "light"} />
      <Tile label={paysLabel} value={pays} tone={onDark ? "panel" : "ink"} />
    </div>
  );
}

/** A 28px rounded track with a rounded fill: how much of what is at stake the cushion covers. */
export function CushionMeter({
  label = "How cushioned you are",
  value,
  fraction,
  onDark = false,
  tone = "covered",
}: {
  label?: string;
  /** Read out beside the label, e.g. "$40 of a $40 night out". */
  value: string;
  /** From 0 to 1. */
  fraction: number;
  onDark?: boolean;
  tone?: "covered" | "risk";
}) {
  const width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  const fill = tone === "risk" ? "bg-risk-fill" : onDark ? "bg-covered-on-dark" : "bg-primary";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-3 text-[13px] font-semibold">
        <span>{label}</span>
        <span className="tabular">{value}</span>
      </div>
      <div role="img" aria-label={`${label}: ${value}`} className={cn("h-7 overflow-hidden rounded-full", onDark ? "bg-panel-track" : "bg-track")}>
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fill)} style={{ width }} />
      </div>
    </div>
  );
}

/** A whole card that is a button. Chosen, it takes a 2px blue border and a "Cushioned" tag. */
export function ToggleCard({
  pressed,
  onToggle,
  children,
  disabled = false,
  className,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "press flex w-full flex-col gap-3.5 rounded-[24px] border-2 bg-card p-5 text-left text-foreground disabled:cursor-not-allowed disabled:opacity-60",
        pressed ? "border-primary" : "border-card",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The tag in the corner of a toggle card. */
export function ToggleTag({ pressed, off = "Add", on = "Cushioned" }: { pressed: boolean; off?: string; on?: string }) {
  return (
    <span className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold", pressed ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
      {pressed ? on : off}
    </span>
  );
}

const cents = (price: number | null) => (price == null ? "n/a" : `${Math.round(price * 100)}¢`);

/** Two equal buttons with the price in the label. A side with no price is shown as such and cannot be pressed. */
export function YesNoPair({
  yes,
  no,
  onYes,
  onNo,
  tall = false,
}: {
  /** Prices from 0 to 1, or null when nobody is offering that side. */
  yes: number | null;
  no: number | null;
  onYes?: () => void;
  onNo?: () => void;
  tall?: boolean;
}) {
  const shape = cn("press rounded-[14px] font-semibold disabled:cursor-default", tall ? "min-h-12 text-[16px]" : "min-h-11 text-[15px]");
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onYes} disabled={!onYes || yes == null} className={cn(shape, "tabular bg-yes text-yes-foreground")}>
        Yes {cents(yes)}
      </button>
      <button type="button" onClick={onNo} disabled={!onNo || no == null} className={cn(shape, "tabular bg-no text-no-foreground")}>
        No {cents(no)}
      </button>
    </div>
  );
}
