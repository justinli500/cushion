"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Notice, Skeleton } from "@/components/kit";
import type { Game, TeamSide } from "@/domains/markets/types";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { winChance } from "@/domains/scores/chance";
import { buildLobby, type LobbyRow } from "@/domains/scores/lobby";
import { teamLabel } from "@/domains/scores/names";
import { isLeague, type Score } from "@/domains/scores/types";
import { formatChance, formatWhen } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";

const LIST_MS = 15_000;
const SCORES_MS = 10_000;

const LiveLink = () => (
  <>
    No game on?{" "}
    <Link href="/games/live" className="press text-primary underline-offset-2 hover:underline">
      Watch Colts at Texans.
    </Link>
  </>
);

/** Always on the page, so the game screen can be used whether or not anything is being played tonight. */
function FeaturedGame() {
  return (
    <Link href="/games/live" className="press flex items-center justify-between gap-6 rounded-[18px] bg-card p-5 hover:border-primary">
      <span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Live</span>
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">Simulated · played Nov 19</span>
        </span>
        <span className="mt-2 block text-[17px] font-semibold tracking-tight">Colts at Texans, Thursday Night Football</span>
        <span className="mt-1 block text-[14px] text-muted-foreground">
          Watch the broadcast with the score, plays and Gemini&rsquo;s real prices moving beside it, and cushion a loss as it happens.
        </span>
      </span>
      <span className="shrink-0 rounded-xl bg-foreground px-4 py-2 text-[14px] font-medium text-background">Watch</span>
    </Link>
  );
}

/** Today's games in groups, most traded first, with live scores where ESPN has them. */
export function GameList() {
  const list = usePoll<{ games: Game[] }>("/api/markets/games", LIST_MS);
  const { team } = useProfile();
  const [league, setLeague] = useState("all");
  const [expanded, setExpanded] = useState(false);

  const games = list.data?.games;
  // Only leagues with a game in play need ESPN's scoreboard, and only the one being looked at.
  const scoreUrl = useMemo(() => {
    const leagues = [...new Set((games ?? []).filter((g) => g.isLive && isLeague(g.league) && (league === "all" || g.league === league)).map((g) => g.league))];
    return leagues.length > 0 ? `/api/scores?league=${leagues.sort().join(",")}` : null;
  }, [games, league]);
  const scores = usePoll<{ scores: Score[] }>(scoreUrl, SCORES_MS);

  const lobby = useMemo(
    () => (games ? buildLobby(games, scores.data?.scores ?? [], { league, expanded, team }) : null),
    [games, scores.data, league, expanded, team],
  );

  if (!lobby) {
    return list.error ? (
      <Notice>Gemini&rsquo;s game markets are not answering right now. Give it a moment and this list will try again by itself.</Notice>
    ) : (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[88px] w-full" />
        ))}
      </div>
    );
  }

  const total = lobby.pinned.length + lobby.live.length + lobby.later.length + lobby.done.length;
  if (lobby.leagues.length === 0) {
    return (
      <Card>
        <h2 className="text-[17px] font-semibold tracking-tight">No games on the market right now</h2>
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          New games appear here a day or so before kickoff. <LiveLink />
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <FeaturedGame />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Chip active={league === "all"} onClick={() => setLeague("all")}>
            All
          </Chip>
          {lobby.leagues.map((l) => (
            <Chip key={l.league} active={league === l.league} onClick={() => setLeague(l.league)}>
              {l.league} <span className="tabular ml-1 opacity-60">{l.count}</span>
            </Chip>
          ))}
        </div>
        <p className="text-[14px] text-muted-foreground">
          <LiveLink />
        </p>
      </div>

      {scoreUrl && scores.error && !scores.data ? <Notice>Live scores are unavailable right now. Prices still update.</Notice> : null}
      {list.error ? <Notice>Showing the last list we got. Trying again.</Notice> : null}

      <Group title="Your team" rows={lobby.pinned} />
      <Group title="Live now" rows={lobby.live} />
      <Group title="Later" rows={lobby.later} />
      <Group title="Just finished" rows={lobby.done} />

      {total === 0 ? <Notice>No games in this league right now.</Notice> : null}
      {lobby.hidden > 0 || expanded ? (
        <Button variant="quiet" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show ${lobby.hidden} more`}
        </Button>
      ) : null}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`press rounded-full px-3.5 py-1.5 text-[13px] font-medium ${active ? "bg-foreground text-background" : "bg-card text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function Group({ title, rows }: { title: string; rows: LobbyRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      <ul className="space-y-3">
        {rows.map((row) => (
          <GameRow key={row.game.gameId} row={row} />
        ))}
      </ul>
    </section>
  );
}

/** What sits at the right of a row: where the game is, or when it starts. */
function statusOf({ game, score }: LobbyRow): { text: string; live: boolean } {
  if (score?.state === "final") return { text: "Final", live: false };
  if (score?.state === "live") return { text: [score.clock, score.period].filter(Boolean).join(" · "), live: true };
  if (score?.state === "pre" || !game.isLive) return { text: formatWhen(game.startTime), live: false };
  return { text: "In play", live: true };
}

function GameRow({ row }: { row: LobbyRow }) {
  const { game, score } = row;
  const { team: mine } = useProfile();
  const status = statusOf(row);
  const sides = [game.teams.find((t) => t.side === "away")!, game.teams.find((t) => t.side === "home")!];
  const scoreOf = (t: TeamSide) => (score ? (t.side === "home" ? score.home.score : score.away.score) : null);
  const isMine = (t: TeamSide) => mine?.league === game.league && mine.abbr === t.abbr;

  const chances = sides.map((t) => winChance(t.contract.quote));
  const best = Math.max(...chances.map((c) => c.p ?? 0));

  return (
    <li className="arrive press relative grid grid-cols-[36px_minmax(0,300px)_44px_120px_minmax(0,1fr)] grid-rows-2 items-center gap-y-1.5 rounded-[18px] bg-card px-3 py-3 hover:bg-accent/60">
      <Link href={`/games/${game.gameId}`} aria-label={`Open ${game.title}`} className="absolute inset-0 rounded-[18px]" />
      {sides.map((t, i) => {
        const chance = chances[i];
        const favorite = chance.p != null && chance.p === best && !chance.uncertain;
        return (
          <RowCells key={t.abbr} row={i + 1}>
            <button
              type="button"
              aria-pressed={isMine(t)}
              aria-label={isMine(t) ? `Stop rooting for ${teamLabel(game, t)}` : `Root for ${teamLabel(game, t)}`}
              title={isMine(t) ? "Your team" : "Make this my team"}
              onClick={() => updateProfile("team", isMine(t) ? null : { league: game.league, abbr: t.abbr, name: t.name })}
              className="press pointer-events-auto relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground aria-pressed:text-primary"
            >
              <Star filled={isMine(t)} />
            </button>
            <span className={`pointer-events-none truncate text-[15px] ${isMine(t) ? "font-semibold" : "font-medium"}`}>{teamLabel(game, t)}</span>
            <span className="tabular pointer-events-none text-right text-[17px] font-semibold">{scoreOf(t) ?? ""}</span>
            {/* The chance each team wins, as a chip. The favorite is tinted, and a rough read is dimmed. */}
            <span
              className={`tabular pointer-events-none ml-4 flex h-8 items-center justify-center rounded-[10px] text-[14px] font-semibold ${
                favorite ? "bg-primary/20 text-primary" : chance.uncertain ? "bg-secondary text-muted-foreground" : "bg-secondary text-foreground"
              }`}
              title={chance.uncertain ? "A rough read: not many people are trading this" : "The market's chance this team wins"}
            >
              {formatChance(chance.p)}
            </span>
          </RowCells>
        );
      })}
      <div className="pointer-events-none col-start-5 row-span-2 row-start-1 pl-4 text-right">
        <p className={`tabular text-[13px] font-medium ${status.live ? "text-primary" : "text-muted-foreground"}`}>
          {status.live ? <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-hidden /> : null}
          {status.text}
        </p>
        {score == null && game.isLive ? <p className="mt-0.5 text-[12px] text-muted-foreground/70">No score yet</p> : null}
      </div>
    </li>
  );
}

/** Places its four children in one grid row of the game row. */
function RowCells({ row, children }: { row: number; children: React.ReactNode }) {
  return <div className="col-span-4 grid grid-cols-subgrid items-center" style={{ gridRowStart: row }}>{children}</div>;
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z" />
    </svg>
  );
}
