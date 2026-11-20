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
  // A highlights reel of the game. `sync` pairs a second of the video with the moment of the game on screen then, read off
  // the reel's own scoreboard, so the plays and trades follow it roughly. The reel shows the second quarter twice and skips
  // the third: the game holds at the half through the repeat, then runs through the third quarter as the reel moves on.
  // A stream that ran live can give `startedAt` (when it began) in place of `sync`.
  // prettier-ignore
  video: { youtubeId: "31-LKGF-BRg", by: "Anas Pet House", sync: [[0,1795137344000],[21,1795137653000],[38,1795137726000],[69,1795137769974],[84,1795137811116],[100,1795137827488],[141,1795137904674],[156,1795137951333],[190,1795138196600],[216,1795138302000],[235,1795138343000],[262,1795138373000],[280,1795138446789],[291,1795138483000],[340,1795138761000],[385,1795138842950],[429,1795139020000],[454,1795139057000],[478,1795139102000],[502,1795139327000],[527,1795139393729],[530,1795139397999],[574,1795139587000],[597,1795139596000],[621,1795139642800],[625,1795139696333],[646,1795139783000],[650,1795139783000],[670,1795140046500],[694,1795140070000],[739,1795140191000],[767,1795140248000],[790,1795140302023],[793,1795140344581],[812,1795140388000],[836,1795140471000],[840,1795140475000],[889,1795140784000],[909,1795140834000],[932,1795140866000],[981,1795140962667],[1005,1795141152737],[1028,1795141441000],[1054,1795141509000],[1077,1795141544000],[1082,1795141560242],[1125,1795141742000],[1149,1795141752000],[1172,1795141902000],[1196,1795141966000],[1203,1795141974195],[1214,1795141986488],[1300,1795142483000],[1341,1795142537000],[1353,1795142545556],[1365,1795142627000],[1370,1795142649778],[2114,1795142649778],[2157,1795146106000],[2161,1795146109000],[2183,1795146150000],[2231,1795146287286],[2253,1795146477270],[2277,1795146546045],[2300,1795146594000],[2373,1795146891000],[2396,1795146974000],[2421,1795147075462],[2442,1795147117000],[2466,1795147254023],[2490,1795147306574],[2533,1795147407941],[2565,1795147560000],[2568,1795147620000]] },
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
