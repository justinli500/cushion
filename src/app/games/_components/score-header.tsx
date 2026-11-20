import { Card, Tag } from "@/components/kit";
import type { Game, TeamSide } from "@/domains/markets/types";
import { winChance } from "@/domains/scores/chance";
import { teamLabel } from "@/domains/scores/names";
import type { Score } from "@/domains/scores/types";
import { Monogram, OutcomeBar } from "@/components/outcome-bar";
import { formatVolume, formatWhen } from "@/lib/format";
import type { GameFeed } from "./feed";

/** What sits between the two teams: the clock, or where the game is in its day. */
function status(game: Game, score: Score | null): { big: string; small: string } {
  if (score?.state === "final") return { big: "Final", small: "" };
  if (score?.state === "live") return { big: score.clock || score.period, small: score.clock ? score.period : "" };
  if (score?.state === "pre" || !game.isLive) return { big: "Not started", small: `Starts ${formatWhen(game.startTime)}` };
  return { big: "In play", small: `Started ${formatWhen(game.startTime)}` };
}

/** The big scoreboard at the top of the game screen. With no ESPN score it leads with the market's chances instead. */
export function ScoreHeader({ feed }: { feed: GameFeed }) {
  const { game, score, replay } = feed;
  if (!game) return null;
  const away = game.teams.find((t) => t.side === "away")!;
  const home = game.teams.find((t) => t.side === "home")!;
  const { big, small } = status(game, score);
  const live = score?.state === "live" || (score == null && game.isLive);

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Tag tone="plain">{game.league}</Tag>
        {live ? <Tag tone="cushion">Live</Tag> : null}
        {replay ? <Tag tone="note">Simulated live · played {new Date(replay.playedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Tag> : null}
        {feed.scoreStatus === "unavailable" ? <Tag tone="note">Score unavailable</Tag> : null}
        {feed.scoreStatus === "none" && game.isLive ? <Tag tone="plain">No score for this game</Tag> : null}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <Side game={game} team={away} score={score ? score.away.score : null} align="left" />
        <div className="text-center">
          <p className="tabular text-[22px] font-semibold tracking-tight">{big}</p>
          {small ? <p className="text-[13px] text-muted-foreground">{small}</p> : null}
        </div>
        <Side game={game} team={home} score={score ? score.home.score : null} align="right" />
      </div>

      <div className="mt-5 space-y-1.5">
        {[away, home].map((team) => {
          const chance = winChance(team.contract.quote);
          return <OutcomeBar key={team.abbr} label={`${teamLabel(game, team)} to win`} chance={chance.p} rough={chance.uncertain} leading={<Monogram text={team.abbr} />} />;
        })}
        {game.volume > 0 ? <p className="tabular pt-1.5 text-[13px] text-muted-foreground">{formatVolume(game.volume)}</p> : null}
      </div>
    </Card>
  );
}

function Side({ game, team, score, align }: { game: Game; team: TeamSide; score: number | null; align: "left" | "right" }) {
  return (
    <div className={align === "left" ? "text-left" : "text-right"}>
      <p className="text-[15px] font-medium">{teamLabel(game, team)}</p>
      {/* With no ESPN score the screen invents none: the bars below carry the market's read. */}
      {score != null ? <p className="tabular text-[64px] font-semibold leading-none tracking-tight">{score}</p> : null}
    </div>
  );
}
