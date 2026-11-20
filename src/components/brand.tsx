import Link from "next/link";

/** The mark: a blue cushion with one stitch. */
export function Mark({ size = 28, color = "var(--primary)", stitch = true }: { size?: number; color?: string; stitch?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M6 9c6-3 14-3 20 0 2 5 2 9 0 14-6 3-14 3-20 0-2-5-2-9 0-14z" fill={color} />
      {stitch ? <path d="M11 16h10" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function Brand({ size = 28, href = "/" }: { size?: number; href?: string }) {
  return (
    <Link href={href} className="drop-soft flex min-h-11 items-center font-medium italic tracking-tight text-foreground" style={{ fontSize: size >= 32 ? 32 : 28 }}>
      cushion
    </Link>
  );
}

/** Kept on every screen: what a cushion is, and that nothing here is real money. */
export function Disclaimer() {
  return (
    <p className="max-w-[760px] text-[13px] text-muted-foreground">
      Hackathon prototype for UBC 2026. Prices are live from Gemini prediction markets, and fills are simulated with play money. A cushion is a
      position in event contracts, not insurance, and you can lose the full amount you pay for it.
    </p>
  );
}
