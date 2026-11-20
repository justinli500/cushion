import type { Game, TeamSide } from "@/domains/markets/types";
import { formatUsdWhole } from "@/lib/format";

const isCollege = (game: Game) => game.league.startsWith("NCAA");

/** What a row or header calls a team: the school for college ("Notre Dame"), the full name for pro ("Houston Texans"). */
export const teamLabel = (game: Game, team: TeamSide) => (isCollege(game) ? team.contract.label : team.name);

/**
 * What a sentence calls a team: "Texans", "Notre Dame". Gemini's short label is the city for pro teams,
 * but cuts a name off when two teams share a city ("Los Angeles C"), so the full name stands in then.
 */
export function teamNickname(game: Game, team: TeamSide): string {
  const { label } = team.contract;
  if (isCollege(game)) return label;
  return team.name.startsWith(`${label} `) ? team.name.slice(label.length + 1) : team.name;
}

/** The ticket's title and one sentence on when it pays. */
export function lossCopy(game: Game, abbr: string, payout: number): { title: string; detail: string } {
  const team = game.teams.find((t) => t.abbr === abbr);
  const rival = game.teams.find((t) => t.abbr !== abbr);
  if (!team || !rival) return { title: "Loss cushion", detail: "" };
  const [mine, theirs] = [teamNickname(game, team), teamNickname(game, rival)];
  const detail = isCollege(game)
    ? `Pays ${formatUsdWhole(payout)} if ${mine} loses to ${theirs}.`
    : `Pays ${formatUsdWhole(payout)} if the ${mine} lose to the ${theirs}.`;
  return { title: `${mine} loss cushion`, detail };
}
