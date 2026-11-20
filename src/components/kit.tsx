import { CalendarDays, Fuel, LineChart, Store, Trophy, Users, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button as BaseButton } from "@/components/ui/button";
import { Card as BaseCard } from "@/components/ui/card";
import { Skeleton as BaseSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Cushion's own building blocks, each a thin layer over a shadcn/ui component. Pages use these so
 * the app's sizes, shapes and tones are decided in one place.
 */

// Each page is named once, in its header, and gets its icon from that name.
const PAGE_ICONS: Record<string, LucideIcon> = {
  Today: CalendarDays,
  Portfolio: LineChart,
  Games: Trophy,
  Bills: Fuel,
  Fantasy: Users,
  "Small business": Store,
  Account: Wallet,
};

export function PageHeader({ title, lead }: { title: string; lead: string }) {
  const Icon = PAGE_ICONS[title];
  return (
    <header className="mb-7 flex items-center gap-4">
      {Icon ? <Icon className="size-11 shrink-0 text-primary" strokeWidth={1.75} aria-hidden /> : null}
      <div>
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight">{title}</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{lead}</p>
      </div>
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <BaseCard className={cn("block gap-0 rounded-[18px] p-5 text-base ring-0", className)}>{children}</BaseCard>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

const TONES = {
  /** Estimates, simulations and thin markets. */
  note: "bg-warning/15 text-warning",
  /** Money paid back, and things that are live. */
  cushion: "bg-positive/15 text-positive",
  loss: "bg-destructive/15 text-destructive",
  plain: "bg-secondary text-muted-foreground",
};

/** A small label. `note` marks any number the app estimated or made up, as opposed to one read from Gemini. */
export function Tag({ children, tone = "note" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <Badge className={cn("h-auto px-2 py-0.5 text-[11px]", TONES[tone])}>{children}</Badge>;
}

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
  variant?: "primary" | "quiet";
  type?: "button" | "submit";
  /** Fills its container, as the main action of a ticket does. */
  wide?: boolean;
}) {
  return (
    <BaseButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={variant === "primary" ? "default" : "secondary"}
      className={cn(
        "press rounded-xl text-[15px] font-semibold disabled:cursor-not-allowed",
        wide ? "h-12 w-full" : "h-10 px-5",
        variant === "primary" && "bg-cta text-cta-foreground hover:bg-cta/85",
      )}
    >
      {children}
    </BaseButton>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** The look of shadcn's Input, for native inputs that need their own props. */
export const inputClass =
  "h-10 w-full min-w-0 rounded-xl border border-transparent bg-secondary px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <BaseSkeleton className={className} aria-hidden />;
}

/** A quiet message for empty, unavailable, or error states. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <Alert className="rounded-xl border-transparent bg-secondary px-4 py-3" role="status">
      <AlertDescription className="text-[14px] leading-relaxed text-muted-foreground">{children}</AlertDescription>
    </Alert>
  );
}

/** Two-column page body: content on the left, a sticky ticket on the right. */
export function WithTicket({ children, ticket }: { children: ReactNode; ticket: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_382px] items-start gap-4">
      <div className="space-y-4">{children}</div>
      <aside className="sticky top-[112px]">{ticket}</aside>
    </div>
  );
}
