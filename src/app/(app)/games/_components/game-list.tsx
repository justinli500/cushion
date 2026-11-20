"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Chip, Notice, Skeleton } from "@/components/kit";
import type { Game, TeamSide } from "@/domains/markets/types";
import { updateProfile, useProfile } from "@/domains/profile/profile";
import { winChance } from "@/domains/scores/chance";
import { buildLobby, type LobbyRow } from "@/domains/scores/lobby";
import { teamLabel, teamNickname } from "@/domains/scores/names";
import { isLeague, type Score } from "@/domains/scores/types";
import { OutcomeBar } from "@/components/outcome-bar";
import { TeamLogo } from "@/components/team-logo";
import { formatVolume, formatWhen } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";

const LIST_MS = 15_000;
const SCORES_MS = 10_000;

const LiveLink = () => (
  <>
    No game on?{" "}
    <Link href="/games/live" className="press font-semibold text-covered underline underline-offset-2">
      Watch Colts at Texans.
    </Link>
  </>
);

/** Always on the page, so the game screen can be used whether or not anything is being played tonight. */
function FeaturedGame() {
  return (
    <Link href="/games/live" className="press flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-panel p-7 text-white">
      <span className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-[10px] bg-primary px-2.5 py-1 text-[12px] font-semibold text-white">Live</span>
          <span className="rounded-[10px] bg-panel-tile px-2.5 py-1 text-[12px] font-semibold text-panel-foreground">Simulated · played Nov 19</span>
        </span>
        <span className="display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">Colts at Texans, Thursday Night Football</span>
        <span className="max-w-[560px] text-[15px] text-panel-foreground">
          Watch the broadcast with the score, plays and Gemini&rsquo;s real prices moving beside it, and cushion a loss as it happens.
        </span>
      </span>
      <span className="inline-flex min-h-[52px] shrink-0 items-center rounded-full bg-card px-7 text-[16px] font-semibold text-foreground">Watch the game</span>
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
          <Skeleton key={i} className="h-[160px] w-full rounded-[24px]" />
        ))}
      </div>
    );
  }

  const total = lobby.pinned.length + lobby.live.length + lobby.later.length + lobby.done.length;
  if (lobby.leagues.length === 0) {
    return (
      <Card>
        <h2 className="display text-[22px] font-semibold">No games on the market right now</h2>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-body">
          New games appear here a day or so before kickoff. <LiveLink />
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-7">
      <FeaturedGame />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Chip small pressed={league === "all"} onClick={() => setLeague("all")}>
            All
          </Chip>
          {lobby.leagues.map((l) => (
            <Chip small key={l.league} pressed={league === l.league} onClick={() => setLeague(l.league)}>
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

function Group({ title, rows }: { title: string; rows: LobbyRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="display mb-3.5 text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4">
        {rows.map((row) => (
          <GameCard key={row.game.gameId} row={row} />
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

/** One game as a market card: who plays, each team's chance as a filling bar, and how much has traded. */
function GameCard({ row }: { row: LobbyRow }) {
  const { game, score } = row;
  const { team: mine } = useProfile();
  const status = statusOf(row);
  const sides = [game.teams.find((t) => t.side === "away")!, game.teams.find((t) => t.side === "home")!];
  const scoreOf = (t: TeamSide) => (score ? (t.side === "home" ? score.home.score : score.away.score) : null);
  const isMine = (t: TeamSide) => mine?.league === game.league && mine.abbr === t.abbr;

  return (
    <li className="arrive press relative rounded-[24px] bg-card p-5 hover:shadow-[0_0_0_2px_var(--primary)]">
      <Link href={`/games/${game.gameId}`} aria-label={`Open ${game.title}`} className="absolute inset-0 rounded-[24px]" />
      <div className="pointer-events-none mb-3 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <TeamLogo src={game.image} fallback={game.league} className="size-8 rounded-lg" />
          <span className="display truncate text-[18px] font-semibold">
            {teamNickname(game, sides[0])} at {teamNickname(game, sides[1])}
          </span>
        </span>
        <span className={`tabular shrink-0 text-[13px] font-medium ${status.live ? "text-positive" : "text-muted-foreground"}`}>
          {status.live ? <span className="mr-1.5 inline-block size-1.5 rounded-full bg-positive align-middle" aria-hidden /> : null}
          {status.text}
        </span>
      </div>

      <div className="pointer-events-none space-y-1.5">
        {sides.map((t) => {
          const chance = winChance(t.contract.quote);
          return (
            <OutcomeBar
              key={t.abbr}
              label={teamLabel(game, t)}
              chance={chance.p}
              rough={chance.uncertain}
              emphasis={isMine(t)}
              leading={<TeamLogo src={t.contract.image} fallback={t.abbr} />}
              trailing={
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={isMine(t)}
                    aria-label={isMine(t) ? `Stop rooting for ${teamLabel(game, t)}` : `Root for ${teamLabel(game, t)}`}
                    title={isMine(t) ? "Your team" : "Make this my team"}
                    onClick={() => updateProfile("team", isMine(t) ? null : { league: game.league, abbr: t.abbr, name: t.name })}
                    className="press pointer-events-auto relative z-10 grid size-8 place-items-center rounded-full text-muted-foreground/50 hover:text-foreground aria-pressed:text-primary"
                  >
                    <Star filled={isMine(t)} />
                  </button>
                  {scoreOf(t)}
                </span>
              }
            />
          );
        })}
      </div>

      <p className="tabular pointer-events-none mt-3 text-[13px] text-muted-foreground">
        {formatVolume(game.volume)}
        {score == null && game.isLive ? " · No score yet" : ""}
      </p>
    </li>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z" />
    </svg>
  );
}
