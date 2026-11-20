import { Tag } from "@/components/kit";
import { TeamLogo } from "@/components/team-logo";
import type { Game, TeamSide } from "@/domains/markets/types";
import { winChance } from "@/domains/scores/chance";
import { teamLabel } from "@/domains/scores/names";
import type { Score } from "@/domains/scores/types";
import { formatChance, formatVolume, formatWhen } from "@/lib/format";
import { GameVideo } from "./game-video";
import { whole, type GameView } from "./view";

/** What sits between the two teams: the clock, or where the game is in its day. */
function status(game: Game, score: Score | null): { big: string; small: string } {
  if (score?.state === "final") return { big: "Final", small: "" };
  if (score?.state === "live") return { big: score.clock || score.period, small: score.clock ? score.period : "" };
  if (score?.state === "pre" || !game.isLive) return { big: "Not started", small: `Starts ${formatWhen(game.startTime)}` };
  return { big: "In play", small: `Started ${formatWhen(game.startTime)}` };
}

/**
 * The 16:9 tile at the top of the game screen. On a replay with a broadcast it is the real video,
 * with the scoreboard laid over it. With no video it holds the scoreboard itself, and no player.
 */
export function StreamTile({ view, game, covered }: { view: GameView; game: Game; covered: number | null }) {
  const video = view.replay?.video;
  const { score } = view;
  const away = game.teams.find((t) => t.side === "away")!;
  const home = game.teams.find((t) => t.side === "home")!;

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[#0A1220]">
      {video && view.replay ? (
        <GameVideo
          youtubeId={video.youtubeId}
          startSeconds={video.startSeconds}
          onTime={video.onTime}
          onUnavailable={video.onUnavailable}
          jump={video.jump}
        />
      ) : (
        <Scoreboard game={game} score={score} away={away} home={home} />
      )}
      {video && score ? (
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3 rounded-[14px] bg-card px-4 py-2 text-[15px] font-bold text-foreground">
          <span className="tabular">
            {away.abbr} {score.away.score}
          </span>
          <span className="font-medium text-muted-foreground">
            {score.state === "live" ? [score.period, score.clock].filter(Boolean).join(" · ") : status(game, score).big}
          </span>
          <span className="tabular">
            {home.abbr} {score.home.score}
          </span>
        </div>
      ) : null}
      {covered != null ? (
        <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-[14px] bg-primary px-3.5 py-2 text-[14px] font-semibold text-primary-foreground">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 32 32" fill="none">
            <path d="M6 9c6-3 14-3 20 0 2 5 2 9 0 14-6 3-14 3-20 0-2-5-2-9 0-14z" fill="#ffffff" />
          </svg>
          Cushioned for {whole(covered)}
        </div>
      ) : null}
    </div>
  );
}

/** The labels under the tile: the league, whether it is live, and what is simulated or missing. */
export function StreamTags({ view, game }: { view: GameView; game: Game }) {
  const { score, replay } = view;
  const live = score?.state === "live" || (score == null && game.isLive);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tag tone="plain">{game.league}</Tag>
      {live ? <Tag tone="cushion">Live</Tag> : null}
      {replay ? <Tag tone="note">Simulated live · played {new Date(replay.playedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Tag> : null}
      {view.scoreStatus === "unavailable" ? <Tag tone="note">Score unavailable</Tag> : null}
      {view.scoreStatus === "none" && game.isLive ? <Tag tone="plain">No score for this game</Tag> : null}
      {game.volume > 0 ? <span className="tabular text-[13px] text-muted-foreground">{formatVolume(game.volume)}</span> : null}
    </div>
  );
}

function Scoreboard({ game, score, away, home }: { game: Game; score: Score | null; away: TeamSide; home: TeamSide }) {
  const { big, small } = status(game, score);
  return (
    <div className="flex aspect-video min-h-[260px] items-center justify-center p-6 pt-16 text-white">
      <div className="grid w-full max-w-[720px] grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
        <Side game={game} team={away} score={score ? score.away.score : null} />
        <div className="text-center">
          <p className="tabular text-[22px] font-semibold tracking-tight">{big}</p>
          {small ? <p className="text-[13px] text-[#A9B6CB]">{small}</p> : null}
        </div>
        <Side game={game} team={home} score={score ? score.home.score : null} />
      </div>
    </div>
  );
}

function Side({ game, team, score }: { game: Game; team: TeamSide; score: number | null }) {
  const chance = winChance(team.contract.quote);
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamLogo src={team.contract.image} fallback={team.abbr} className="size-14" />
      <p className="max-w-full truncate text-[15px] font-semibold">{teamLabel(game, team)}</p>
      {/* With no ESPN score the screen invents none: the market's chance stands in. */}
      <p className="display tabular text-[clamp(48px,9vw,88px)] font-bold leading-none tracking-[-0.03em]">
        {score != null ? score : formatChance(chance.p)}
      </p>
      <p className="tabular text-[13px] text-[#A9B6CB]">
        {score != null ? `${chance.uncertain ? "~" : ""}${formatChance(chance.p)} to win` : "chance to win"}
      </p>
    </div>
  );
}
