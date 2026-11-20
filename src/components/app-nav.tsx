"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/domains/account/store";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export const SECTIONS = [
  { href: "/today", label: "Today" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/business", label: "Business" },
  { href: "/bills", label: "Bills" },
  { href: "/games", label: "Live games" },
];

/** The app's nav: the mark, a pill per section with the current one dark, and the play-money balance. */
export function AppNav() {
  const pathname = usePathname();
  const { balance, positions } = useAccount();
  const open = positions.filter((p) => p.payout == null).length;

  return (
    <header className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-8 py-4">
      <Brand />
      <nav className="flex flex-wrap items-center gap-1" aria-label="Sections">
        {SECTIONS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press inline-flex min-h-11 items-center rounded-full px-4 text-[15px]",
                active ? "bg-foreground font-semibold text-background" : "font-medium text-foreground hover:bg-accent",
              )}
            >
              {label}
            </Link>
          );
        })}
        <Link
          href="/account"
          aria-current={pathname.startsWith("/account") ? "page" : undefined}
          className={cn(
            "press tabular ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold",
            pathname.startsWith("/account") ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-accent",
          )}
        >
          {formatUsd(balance)}
          {open > 0 ? <span className="rounded-full bg-primary px-1.5 text-[12px] text-primary-foreground">{open}</span> : null}
        </Link>
        <span className="ml-1 rounded-[10px] bg-accent px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">Play money</span>
        <ThemeToggle className="ml-1" />
      </nav>
    </header>
  );
}
