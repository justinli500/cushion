import { describe, expect, it } from "vitest";
import { buildLobby } from "@/domains/scores/lobby";
import { game, score, team } from "./helpers";

const nba = (id: string, volume: number, over = {}) =>
  game({
    gameId: id,
    league: "NBA",
    volume,
    teams: [team(`H${id}`, `Home ${id}`, "home"), team(`A${id}`, `Away ${id}`, "away")],
    ...over,
  });

const open = { league: "all", expanded: false, team: null };
const ids = (rows: { game: { gameId: string } }[]) => rows.map((r) => r.game.gameId);

describe("building the games list", () => {
  it("splits live from later and leads each with the most traded game", () => {
    const lobby = buildLobby(
      [nba("a", 10, { isLive: true }), nba("b", 500, { isLive: true }), nba("c", 5, { isLive: false }), nba("d", 50, { isLive: false })],
      [],
      open,
    );
    expect(ids(lobby.live)).toEqual(["b", "a"]);
    expect(ids(lobby.later)).toEqual(["d", "c"]);
  });

  it("trusts ESPN over Gemini about whether a game has started or finished", () => {
    const pre = score({ espnId: "p", state: "pre", home: { abbr: "Ha", name: "Home a", score: 0 }, away: { abbr: "Aa", name: "Away a", score: 0 } });
    const fin = score({ espnId: "f", state: "final", home: { abbr: "Hb", name: "Home b", score: 1 }, away: { abbr: "Ab", name: "Away b", score: 2 } });
    const lobby = buildLobby([nba("a", 1, { isLive: true }), nba("b", 1, { isLive: true })], [pre, fin], open);
    expect(ids(lobby.later)).toEqual(["a"]);
    expect(ids(lobby.done)).toEqual(["b"]);
    expect(lobby.live).toEqual([]);
  });

  it("attaches the matched score to its row", () => {
    const s = score({ espnId: "s", home: { abbr: "Ha", name: "Home a", score: 9 }, away: { abbr: "Aa", name: "Away a", score: 7 } });
    const [row] = buildLobby([nba("a", 1)], [s], open).live;
    expect(row.score?.home.score).toBe(9);
  });

  it("pins the person's team above everything, once", () => {
    const lobby = buildLobby([nba("a", 500), nba("b", 1, { isLive: false })], [], { ...open, team: { league: "NBA", abbr: "Hb" } });
    expect(ids(lobby.pinned)).toEqual(["b"]);
    expect(ids(lobby.live)).toEqual(["a"]);
    expect(lobby.later).toEqual([]);
  });

  it("does not pin a team from another league with the same abbreviation", () => {
    const lobby = buildLobby([nba("a", 1)], [], { ...open, team: { league: "NFL", abbr: "Ha" } });
    expect(lobby.pinned).toEqual([]);
  });

  it("caps each league per group until expanded, and reports what is hidden", () => {
    const games = Array.from({ length: 10 }, (_, i) => nba(`n${i}`, 100 - i));
    const capped = buildLobby(games, [], open);
    expect(capped.live).toHaveLength(4);
    expect(capped.hidden).toBe(6);
    expect(ids(capped.live)).toEqual(["n0", "n1", "n2", "n3"]);
    const all = buildLobby(games, [], { ...open, expanded: true });
    expect(all.live).toHaveLength(10);
    expect(all.hidden).toBe(0);
  });

  it("caps per league, so one busy league does not crowd out the rest", () => {
    const nfl = game({ gameId: "nfl", league: "NFL", volume: 1 });
    const games = [...Array.from({ length: 10 }, (_, i) => nba(`n${i}`, 100 - i)), nfl];
    expect(ids(buildLobby(games, [], open).live)).toContain("nfl");
  });

  it("filters by league and lists the leagues with their counts, NFL first", () => {
    const games = [nba("a", 1), nba("b", 1), game({ gameId: "nfl", league: "NFL" })];
    const lobby = buildLobby(games, [], { ...open, league: "NFL" });
    expect(ids(lobby.live)).toEqual(["nfl"]);
    expect(lobby.leagues).toEqual([
      { league: "NFL", count: 1 },
      { league: "NBA", count: 2 },
    ]);
  });
});
