import { describe, expect, it } from "vitest";
import { fieldNow, firstDownLine, scoreWord } from "@/domains/scores/field";
import { parseSummary } from "@/domains/scores/parse";
import type { Play, PlayField } from "@/domains/scores/types";

const field = (over: Partial<PlayField>): PlayField => ({ possession: "HOU", from: 33, to: 36, down: 2, distance: 7, situation: "2nd & 7 at HOU 36", kind: "Pass Reception", yards: 3, ...over });
const play = (id: string, f?: PlayField, scoringPlay = false): Play => ({ id, text: ` play ${id} `, clock: "", period: "1st", scoringPlay, field: f });

describe("the playing field", () => {
  it("shows the latest play that moved the ball, looking past stoppages", () => {
    const plays = [play("timeout", field({ kind: "Official Timeout", from: 65, to: 65, down: null })), play("catch", field({})), play("older", field({ to: 33 }))];
    expect(fieldNow(plays)).toMatchObject({ to: 36, text: "play catch", scoring: false });
    expect(fieldNow([play("basket")])).toBeNull();
  });

  it("puts the line to gain ahead of the offense, whichever way it is going", () => {
    // Positions count from the home goal line: the home team gains upward, the visitors downward.
    expect(firstDownLine(field({}), "HOU")).toBe(43);
    expect(firstDownLine(field({ possession: "IND", to: 57, distance: 19 }), "HOU")).toBe(38);
    expect(firstDownLine(field({ to: 95, distance: 5 }), "HOU")).toBeNull();
    expect(firstDownLine(field({ down: null }), "HOU")).toBeNull();
  });

  it("names scoring plays", () => {
    expect([scoreWord("Passing Touchdown"), scoreWord("Field Goal Good"), scoreWord("Field Goal Missed"), scoreWord("Rush")]).toEqual(["Touchdown", "Field goal", null, null]);
  });

  it("reads field position from ESPN's plays and names the team by its abbreviation", () => {
    const team = (id: string, abbreviation: string, homeAway: string) => ({ homeAway, score: "0", team: { id, abbreviation, displayName: abbreviation } });
    const summary = {
      header: { id: "1", competitions: [{ date: "2026-11-20T01:15Z", status: { type: { state: "in", shortDetail: "10:38 - 1st" } }, competitors: [team("34", "HOU", "home"), team("11", "IND", "away")] }] },
      drives: {
        previous: [
          {
            plays: [
              {
                id: "p1",
                text: "C.Stroud pass short left to D.Montgomery for 3 yards.",
                type: { text: "Pass Reception" },
                statYardage: 3,
                start: { down: 1, distance: 10, yardLine: 33, team: { id: "34" } },
                end: { down: 2, distance: 7, yardLine: 36, downDistanceText: "2nd & 7 at HOU 36", team: { id: "34" } },
              },
              { id: "p2", text: "Touchdown.", type: { text: "Passing Touchdown" }, scoringPlay: true, statYardage: 42, start: { down: 1, yardLine: 58, team: { id: "34" } }, end: { down: -1, distance: 10, yardLine: 100, team: { id: "34" } } },
            ],
          },
        ],
      },
    };
    const [touchdown, catchPlay] = parseSummary(summary).plays;
    expect(catchPlay.field).toEqual(field({}));
    expect(touchdown.field).toMatchObject({ possession: "HOU", to: 100, down: null, situation: null });
  });
});
