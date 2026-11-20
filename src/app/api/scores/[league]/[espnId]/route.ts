import { getSummary } from "@/domains/scores/espn";
import { isLeague } from "@/domains/scores/types";
import { badRequest, respond } from "@/lib/http";

/** GET /api/scores/NFL/401873066 returns one game's score and its plays, newest first. */
export async function GET(_request: Request, { params }: { params: Promise<{ league: string; espnId: string }> }) {
  const { league, espnId } = await params;
  if (!isLeague(league) || !/^\d{1,12}$/.test(espnId)) return badRequest("Pass a league and an ESPN game id.");
  return respond(() => getSummary(league, espnId));
}
