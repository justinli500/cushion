import { getScores } from "@/domains/scores/espn";
import { isLeague, type League } from "@/domains/scores/types";
import { badRequest, respond } from "@/lib/http";

/** GET /api/scores?league=NFL or ?league=NFL,NBA returns today's scores for those leagues. */
export function GET(request: Request) {
  const names = (new URL(request.url).searchParams.get("league") ?? "").split(",");
  const leagues = [...new Set(names)];
  if (leagues.length > 5 || !leagues.every(isLeague)) return badRequest("Pass a league: NFL, NCAAF, NBA, NCAAM or NHL.");
  return respond(async () => ({ scores: await getScores(leagues as League[]) }));
}
