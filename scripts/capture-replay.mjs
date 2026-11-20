// Saves one finished game as a replay: ESPN's play-by-play and Gemini's real trades on the winner market.
// Run: node scripts/capture-replay.mjs            (writes public/replays/<id>.json)
//      node scripts/capture-replay.mjs --wait     (first waits for the game to go final)
import { mkdir, writeFile } from "node:fs/promises";

const GAME = {
  id: "nfl-ind-hou-2026-11-19",
  league: "NFL",
  espn: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401873066",
  // Gemini's winner market for the same game. Contract symbols are <event>-<team>.
  geminiEvent: "NFL-2611200115-IND-HOU-M",
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
    return { abbr: c.team.abbreviation, name: c.team.displayName, score: Number(c.score) };
  };
  const winProb = new Map((summary.winprobability ?? []).map((w) => [w.playId, w.homeWinPercentage]));
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
    }))
    .sort((a, b) => a.t - b.t);
  return { state: competition.status.type.name, home: side("home"), away: side("away"), plays };
}

/** Every trade on a contract, oldest first. The endpoint returns the newest 500, which covers a game. */
async function trades(symbol) {
  const raw = await getJson(`https://api.gemini.com/v1/trades/${symbol}?limit_trades=500`);
  return raw.map((t) => ({ t: t.timestampms, price: Number(t.price), size: Number(t.amount) })).sort((a, b) => a.t - b.t);
}

async function capture() {
  const game = await espn();
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

if (process.argv.includes("--wait")) {
  // Bounded: a game that never goes final (postponed, feed down) should not leave this running forever.
  for (let tries = 0; tries < 100; tries++) {
    if ((await espn().catch(() => null))?.state === "STATUS_FINAL") break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
await capture();
