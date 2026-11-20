import Link from "next/link";
import { Notice } from "@/components/kit";
import type { UpcomingRow } from "@/domains/feed/news";
import { cn } from "@/lib/utils";

/** The little date tile: "TONIGHT 7:00" for a game, "DEC 11" for a market that resolves that day. */
function tileFor(row: UpcomingRow): { top: string; big: string } {
  const at = new Date(row.at);
  if (row.kind === "event") return { top: at.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), big: String(at.getDate()) };
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const big = `${part("hour")}:${part("minute")}`;
  const meridiem = part("dayPeriod");
  if (row.live) return { top: "LIVE", big };
  if (at.toDateString() === new Date().toDateString()) return at.getHours() >= 17 ? { top: "TONIGHT", big } : { top: `TODAY ${meridiem}`, big };
  return { top: `${at.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} ${meridiem}`, big };
}

function Row({ row }: { row: UpcomingRow }) {
  const { top, big } = tileFor(row);
  const dark = row.live || top === "TONIGHT";
  const body = (
    <>
      <span className={cn("flex w-16 flex-none flex-col items-center rounded-[14px] py-2", dark ? "bg-panel text-white" : "bg-card text-foreground")}>
        <span className={cn("text-[11px] font-semibold", dark ? "text-panel-foreground" : "text-muted-foreground")}>{top}</span>
        <span className="display text-[17px] font-bold">{big}</span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-2 text-[15px] font-semibold">{row.title}</span>
        {row.detail ? <span className="line-clamp-2 text-[13px] text-muted-foreground">{row.detail}</span> : null}
      </span>
    </>
  );
  // One height for every row, with room for two lines of each: the two themes use different fonts, so the same words wrap
  // differently, and the big card beside this list stretches to match it.
  const shape = "flex min-h-[112px] items-center gap-3.5 rounded-[18px] bg-background p-3 text-foreground";
  return row.href ? (
    <Link href={row.href} className={cn(shape, "press hover:bg-secondary")}>
      {body}
    </Link>
  ) : (
    <div className={shape}>{body}</div>
  );
}

/** Real dated things, soonest first: games about to start and markets about to resolve. */
export function ComingUp({ rows, loading }: { rows: UpcomingRow[]; loading: boolean }) {
  return (
    <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[32px] bg-card p-6">
      <h2 className="display text-[20px] font-semibold">Coming up</h2>
      {rows.length > 0 ? rows.map((row) => <Row key={row.id} row={row} />) : <Notice>{loading ? "Looking for what is on the calendar…" : "Nothing dated is coming up right now."}</Notice>}
    </aside>
  );
}
