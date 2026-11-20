// Saves one finished game as a replay: ESPN's play-by-play and Gemini's real trades on the winner market.
// Run: node scripts/capture-replay.mjs            (writes public/replays/<id>.json)
//      node scripts/capture-replay.mjs --plays    (refreshes only the plays of a game already saved, keeping its trades)
//      node scripts/capture-replay.mjs --wait     (first waits for the game to go final)
import { mkdir, readFile, writeFile } from "node:fs/promises";

const GAME = {
  id: "nfl-ind-hou-2026-11-19",
  league: "NFL",
  espn: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401873066",
  // Gemini's winner market for the same game. Contract symbols are <event>-<team>.
  geminiEvent: "NFL-2611200115-IND-HOU-M",
  // A broadcast of the game that was streamed live and allows embedding. `startedAt` is when the
  // stream began, so a moment in the video maps to the same moment in the plays and trades.
  video: { youtubeId: "3fKOnCxQx9c", startedAt: "2026-11-20T00:46:12.000Z", by: "Rising Rhino" },
};
const OUT = new URL("../public/replays/", import.meta.url);
const POLL_MS = 3 * 60 * 1000;

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

async function espn() {
  const summary = await getJson(GAME.espn);
  const competition = summary.header.competitions[0];
  const side = (homeAway) => {
    const c = competition.competitors.find((x) => x.homeAway === homeAway);
    return { abbr: c.team.abbreviation, name: c.team.displayName, score: Number(c.score), logo: c.team.logos?.[0]?.href };
  };
  const winProb = new Map((summary.winprobability ?? []).map((w) => [w.playId, w.homeWinPercentage]));
  const abbrOf = new Map(competition.competitors.map((c) => [c.team.id, c.team.abbreviation]));
  // ponytail: the same shaping as toField in src/domains/scores/parse.ts, repeated because this script cannot import TypeScript.
  const field = (p) => {
    if (p.start?.yardLine == null || p.end?.yardLine == null || !p.type?.text) return undefined;
    const down = p.end.down >= 1 && p.end.down <= 4 ? p.end.down : null;
    return {
      possession: abbrOf.get(p.end.team?.id) ?? null,
      from: p.start.yardLine,
      to: p.end.yardLine,
      down,
      distance: p.end.distance ?? 0,
      situation: down ? (p.end.downDistanceText?.trim() ?? null) : null,
      kind: p.type.text,
      yards: p.statYardage ?? 0,
    };
  };
  const plays = (summary.drives?.previous ?? [])
    .flatMap((drive) => drive.plays ?? [])
    .filter((p) => p.wallclock && p.text)
    .map((p) => ({
      t: Date.parse(p.wallclock),
      period: p.period.number,
      clock: p.clock.displayValue,
      text: p.text,
      home: p.homeScore,
      away: p.awayScore,
      scoring: Boolean(p.scoringPlay),
      homeWinProb: winProb.get(p.id) ?? null,
      field: field(p),
    }))
    .sort((a, b) => a.t - b.t);
  return { state: competition.status.type.name, home: side("home"), away: side("away"), plays };
}

/** Every trade on a contract, oldest first. The endpoint returns the newest 500, which covers a game. */
async function trades(symbol) {
  const raw = await getJson(`https://api.gemini.com/v1/trades/${symbol}?limit_trades=500`);
  return raw.map((t) => ({ t: t.timestampms, price: Number(t.price), size: Number(t.amount) })).sort((a, b) => a.t - b.t);
}

/** Gemini's picture for the game's sport. */
async function sportImage() {
  const event = await getJson(`https://api.gemini.com/v1/prediction-markets/events/${GAME.geminiEvent}`).catch(() => null);
  return event?.imageUrl ?? undefined;
}

async function capture() {
  const game = await espn();
  const image = await sportImage();
  const [home, away] = await Promise.all(
    [game.home, game.away].map(async (team) => {
      const symbol = `GEMI-${GAME.geminiEvent}-${team.abbr}`;
      return { ...team, symbol, trades: await trades(symbol) };
    }),
  );
  const replay = {
    id: GAME.id,
    league: GAME.league,
    eventTicker: GAME.geminiEvent,
    capturedAt: new Date().toISOString(),
    final: game.state === "STATUS_FINAL",
    video: GAME.video,
    image,
    home,
    away,
    plays: game.plays,
  };
  await mkdir(OUT, { recursive: true });
  await writeFile(new URL(`${GAME.id}.json`, OUT), JSON.stringify(replay));
  console.log(
    `${GAME.id}: ${game.state}, ${away.abbr} ${away.score} at ${home.abbr} ${home.score}, ${replay.plays.length} plays, ` +
      `${home.trades.length} + ${away.trades.length} trades`,
  );
  return replay.final;
}

if (process.argv.includes("--plays")) {
  // Gemini serves only the newest 500 trades of a contract, so a saved game's trades cannot be fetched again later.
  const file = new URL(`${GAME.id}.json`, OUT);
  const saved = JSON.parse(await readFile(file, "utf8"));
  const { plays } = await espn();
  await writeFile(file, JSON.stringify({ ...saved, plays }));
  console.log(`${GAME.id}: ${plays.length} plays refreshed, ${plays.filter((p) => p.field).length} with a field position`);
  process.exit(0);
}

if (process.argv.includes("--wait")) {
  // Bounded: a game that never goes final (postponed, feed down) should not leave this running forever.
  for (let tries = 0; tries < 100; tries++) {
    if ((await espn().catch(() => null))?.state === "STATUS_FINAL") break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
await capture();
