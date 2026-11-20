"use client";

import { Briefcase, CalendarDays, Fuel, LineChart, Store, Trophy, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { useAccount } from "@/domains/account/store";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Today", icon: CalendarDays },
  { href: "/portfolio", label: "Portfolio", icon: LineChart },
  { href: "/games", label: "Games", icon: Trophy },
  { href: "/bills", label: "Bills", icon: Fuel },
  { href: "/fantasy", label: "Fantasy", icon: Users },
  { href: "/business", label: "Small business", icon: Store },
];

export function Sidebar() {
  const pathname = usePathname();
  const { balance, positions } = useAccount();
  const open = positions.filter((p) => p.payout == null).length;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-7">
      <Link href="/" className="mb-7 flex items-center gap-2.5 px-3">
        <span className="grid size-7 place-items-center rounded-[10px] bg-primary text-primary-foreground" aria-hidden>
          <Briefcase className="size-4" strokeWidth={2.25} />
        </span>
        <span className="text-[17px] font-semibold tracking-tight">Cushion</span>
      </Link>

      <ul className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press flex items-center gap-3 rounded-full px-3 py-2 text-[14px]",
                  active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4", active && "text-primary")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-3">
        <Separator />
        <Link href="/account" className="press block rounded-2xl bg-card px-4 py-3 ring-1 ring-border hover:ring-foreground/30">
          <span className="block text-[12px] text-muted-foreground">Play money</span>
          <span className="tabular block text-[19px] font-semibold tracking-tight">{formatUsd(balance)}</span>
          <span className="block text-[12px] text-muted-foreground">
            {open === 0 ? "No open cushions" : `${open} open ${open === 1 ? "cushion" : "cushions"}`}
          </span>
        </Link>
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-[12px] leading-snug text-warning">
          Simulated. No real money. Prices are live from Gemini.
        </p>
      </div>
    </nav>
  );
}
