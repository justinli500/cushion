"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/domains/account/store";
import { formatUsd } from "@/lib/format";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/games", label: "Games" },
  { href: "/bills", label: "Bills" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/business", label: "Small business" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { balance, positions } = useAccount();
  const open = positions.filter((p) => p.payout == null).length;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-line px-5 py-8">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
        <span className="h-6 w-6 rounded-[9px] bg-cushion" aria-hidden />
        <span className="text-[17px] font-semibold tracking-tight">Cushion</span>
      </Link>

      <ul className="space-y-0.5">
        {NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`press block rounded-xl px-3 py-2 text-[14px] ${
                isActive(item.href) ? "bg-card font-medium text-ink shadow-[0_0_0_1px_var(--line)]" : "text-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-3">
        <Link href="/account" className="press block rounded-2xl border border-line bg-card px-4 py-3 hover:border-faint">
          <span className="block text-[12px] text-faint">Play money</span>
          <span className="tabular block text-[19px] font-semibold tracking-tight">{formatUsd(balance)}</span>
          <span className="block text-[12px] text-muted">
            {open === 0 ? "No open cushions" : `${open} open ${open === 1 ? "cushion" : "cushions"}`}
          </span>
        </Link>
        <p className="rounded-xl bg-note-soft px-3 py-2 text-[12px] leading-snug text-note">
          Simulated. No real money. Prices are live from Gemini.
        </p>
      </div>
    </nav>
  );
}
