import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game, PlayerProp } from "@/domains/markets/types";

const HOUR = 60 * 60 * 1000;

const game = (id: string, league: string, startsInHours: number): Game => ({
  kind: "game",
  gameId: id,
  eventTicker: `${league}-${id}`,
  league,
  title: `Game ${id}`,
  startTime: new Date(Date.now() + startsInHours * HOUR).toISOString(),
  expiry: new Date(Date.now() + (startsInHours + 36) * HOUR).toISOString(),
  isLive: startsInHours < 0,
  teams: [],
  hasDraw: false,
  volume: 0,
});

const prop = (gameId: string, player: string): PlayerProp => ({
  gameId,
  eventTicker: `EV-${gameId}`,
  expiry: new Date(Date.now() + 40 * HOUR).toISOString(),
  player,
  team: null,
  position: null,
  metric: "points",
  lines: [],
});

const getGames = vi.fn();
const getAllPlayerProps = vi.fn();

async function callRoute() {
  vi.resetModules();
  vi.doMock("@/domains/markets/gemini", () => ({ getGames, getAllPlayerProps }));
  const { GET } = await import("@/app/api/markets/props/route");
  return GET();
}

beforeEach(() => {
  getGames.mockReset();
  getAllPlayerProps.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/markets/props", () => {
  it("lists NFL and NBA players for games that are live or start within three days, and nothing else", async () => {
    getGames.mockResolvedValue([
      game("live", "NBA", -1),
      game("weekend", "NFL", 60),
      game("next-week", "NFL", 100),
      game("hockey", "NHL", 2),
    ]);
    getAllPlayerProps.mockResolvedValue(["live", "weekend", "next-week", "hockey", "unlisted"].map((id) => prop(id, `Player of ${id}`)));

    const { players } = await (await callRoute()).json();

    expect(players.map((p: { player: string }) => p.player)).toEqual(["Player of live", "Player of weekend"]);
  });

  it("asks Gemini once for every game's props", async () => {
    getGames.mockResolvedValue(Array.from({ length: 12 }, (_, i) => game(`g${i}`, "NBA", i)));
    getAllPlayerProps.mockResolvedValue(Array.from({ length: 12 }, (_, i) => prop(`g${i}`, `P${i}`)));

    const { players } = await (await callRoute()).json();

    expect(players).toHaveLength(12);
    expect(getAllPlayerProps).toHaveBeenCalledTimes(1);
  });

  it("answers with an empty list when no game has props", async () => {
    getGames.mockResolvedValue([game("quiet", "NBA", 5)]);
    getAllPlayerProps.mockResolvedValue([]);
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect((await res.json()).players).toEqual([]);
  });

  it("reports an outage as an error and does not cache it as an empty slate", async () => {
    getGames.mockResolvedValue([game("g", "NBA", 5)]);
    getAllPlayerProps.mockRejectedValueOnce(new Error("Gemini is down")).mockResolvedValueOnce([prop("g", "Back")]);
    vi.resetModules();
    vi.doMock("@/domains/markets/gemini", () => ({ getGames, getAllPlayerProps }));
    const { GET } = await import("@/app/api/markets/props/route");

    expect((await GET()).status).toBe(502);
    const again = await GET();
    expect(again.status).toBe(200);
    expect((await again.json()).players.map((p: { player: string }) => p.player)).toEqual(["Back"]);
  });

  it("serves the cached list to a second caller", async () => {
    getGames.mockResolvedValue([game("g", "NBA", 5)]);
    getAllPlayerProps.mockResolvedValue([prop("g", "Once")]);
    vi.resetModules();
    vi.doMock("@/domains/markets/gemini", () => ({ getGames, getAllPlayerProps }));
    const { GET } = await import("@/app/api/markets/props/route");
    await GET();
    await GET();
    expect(getAllPlayerProps).toHaveBeenCalledTimes(1);
  });
});
