import { describe, expect, it } from "vitest";
import { parseScoreboard, parseSummary } from "@/domains/scores/parse";
import { fixture } from "./helpers";

// Real ESPN responses captured during live games on 2026-11-19, trimmed to the fields they carry.
describe("parsing an ESPN scoreboard", () => {
  it("reads a live NFL game with its clock and quarter", () => {
    const scores = parseScoreboard(fixture("espn-scoreboard-nfl.json"));
    const live = scores.find((s) => s.espnId === "401873066")!;
    expect(live).toMatchObject({
      state: "live",
      clock: "7:31",
      period: "2nd",
      home: { abbr: "HOU", name: "Houston Texans", score: 14 },
      away: { abbr: "IND", name: "Indianapolis Colts", score: 3 },
    });
    expect(live.startTime).toBe("2026-11-20T01:15Z");
  });

  it("leaves the clock and period empty before the game starts", () => {
    const pre = parseScoreboard(fixture("espn-scoreboard-nfl.json")).find((s) => s.espnId === "401873070")!;
    expect(pre).toMatchObject({ state: "pre", clock: "", period: "", home: { score: 0 }, away: { score: 0 } });
  });

  it("keeps halftime as the period, with no clock", () => {
    const half = parseScoreboard(fixture("espn-scoreboard-ncaam.json")).find((s) => s.espnId === "401918950")!;
    expect(half).toMatchObject({ state: "live", clock: "", period: "Halftime", home: { score: 42 }, away: { score: 37 } });
  });

  it("marks a finished game final", () => {
    const final = parseScoreboard(fixture("espn-scoreboard-ncaam.json")).find((s) => s.espnId === "401920517")!;
    expect(final).toMatchObject({ state: "final", period: "Final", home: { abbr: "WVU", score: 72 }, away: { abbr: "FLA", score: 85 } });
  });

  it("keeps ESPN's own abbreviations, which can differ from Gemini's", () => {
    const abbrs = parseScoreboard(fixture("espn-scoreboard-nhl.json")).flatMap((s) => [s.home.abbr, s.away.abbr]);
    expect(abbrs).toContain("LA");
    expect(abbrs).toContain("TB");
  });

  it("skips an event it cannot read instead of failing the whole board", () => {
    const board = fixture("espn-scoreboard-nfl.json");
    board.events.push({ id: "bad", competitions: [{ competitors: [] }] });
    expect(parseScoreboard(board)).toHaveLength(2);
  });

  it("rejects a body that is not a scoreboard", () => {
    expect(() => parseScoreboard({ nope: true })).toThrow();
  });
});

describe("parsing an ESPN game summary", () => {
  it("reads football plays from drives, newest first, and flags scoring plays", () => {
    const { score, plays } = parseSummary(fixture("espn-summary-nfl-live.json"));
    expect(score).toMatchObject({ espnId: "401873066", state: "live", home: { score: 14 }, away: { score: 3 } });
    expect(plays.length).toBeGreaterThan(10);
    expect(plays[0].text).toContain("J.Taylor");
    expect(plays[0]).toMatchObject({ clock: "7:31", period: "2nd" });
    const touchdown = plays.find((p) => p.text.includes("Boutte"))!;
    expect(touchdown.scoringPlay).toBe(true);
    expect(new Set(plays.map((p) => p.id)).size).toBe(plays.length);
  });

  it("reads basketball plays from the flat list, newest first", () => {
    const { plays } = parseSummary(fixture("espn-summary-nba-live.json"));
    expect(plays[0]).toMatchObject({ text: "End of the 2nd Quarter", period: "2nd Quarter" });
    expect(plays.length).toBeGreaterThan(10);
  });

  it("drops hockey face-offs, which are most of the feed and say nothing", () => {
    const { plays } = parseSummary(fixture("espn-summary-nhl-live.json"));
    expect(plays.some((p) => p.text.includes("faceoff"))).toBe(false);
    expect(plays.find((p) => p.text.includes("Cam York Goal"))?.scoringPlay).toBe(true);
  });

  it("returns a pregame score and no plays", () => {
    const { score, plays } = parseSummary(fixture("espn-summary-nfl-pre.json"));
    expect(score).toMatchObject({ state: "pre", home: { abbr: "BUF" }, away: { abbr: "MIA" } });
    expect(plays).toEqual([]);
  });
});
