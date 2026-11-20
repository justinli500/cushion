"use client";

import { CalendarDays, Fuel, LineChart, ShieldCheck, Store, Trophy, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/domains/account/store";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const SECTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Today", icon: CalendarDays },
  { href: "/portfolio", label: "Portfolio", icon: LineChart },
  { href: "/games", label: "Games", icon: Trophy },
  { href: "/bills", label: "Bills", icon: Fuel },
  { href: "/fantasy", label: "Fantasy", icon: Users },
  { href: "/business", label: "Small business", icon: Store },
];

/** The bar across the top: the brand, the standing "simulated" note, the play-money balance, and a tab per section. */
export function TopNav() {
  const pathname = usePathname();
  const { balance, positions } = useAccount();
  const open = positions.filter((p) => p.payout == null).length;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-[1292px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" strokeWidth={2.25} aria-hidden />
          <span className="text-[19px] font-semibold tracking-tight">Cushion</span>
        </Link>

        <p className="mx-auto hidden rounded-full bg-secondary px-4 py-2 text-[13px] text-muted-foreground md:block">
          Simulated. No real money. Prices are live from Gemini.
        </p>

        <Link
          href="/account"
          aria-current={pathname.startsWith("/account") ? "page" : undefined}
          className="press tabular ml-auto flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-[14px] font-medium hover:bg-accent md:ml-0"
        >
          <span className="text-muted-foreground">Play money</span>
          {formatUsd(balance)}
          {open > 0 ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{open}</span> : null}
        </Link>
      </div>

      <nav className="mx-auto flex max-w-[1292px] gap-6 px-6" aria-label="Sections">
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press -mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1.5 text-[15px]",
                active ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? <Icon className="size-4" aria-hidden /> : null}
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
