import { describe, expect, it } from "vitest";
import { athleteKey, findAthlete, indexAthletes, parseRoster } from "@/domains/scores/athletes";

const player = (fullName: string, abbreviation: string, href?: string) => ({ id: "1", fullName, position: { abbreviation }, ...(href ? { headshot: { href } } : {}) });

describe("ESPN rosters", () => {
  it("reads football's grouped roster and basketball's flat one, keeping only pictures on ESPN's host", () => {
    const football = parseRoster({
      team: { abbreviation: "ATL", location: "Atlanta" },
      athletes: [
        { position: "offense", items: [player("Bijan Robinson", "RB", "https://a.espncdn.com/i/headshots/nfl/players/full/1.png"), { broken: true }] },
        { position: "defense", items: [player("Jessie Bates III", "S", "https://elsewhere.example/x.png")] },
      ],
    });
    expect(football).toEqual([
      { name: "Bijan Robinson", position: "RB", headshot: "https://a.espncdn.com/i/headshots/nfl/players/full/1.png", team: "ATL", place: "Atlanta" },
      { name: "Jessie Bates III", position: "S", headshot: null, team: "ATL", place: "Atlanta" },
    ]);
    const basketball = parseRoster({ team: { abbreviation: "CHA", location: "Charlotte" }, athletes: [player("Brandon Miller", "F")] });
    expect(basketball).toMatchObject([{ name: "Brandon Miller", position: "F", team: "CHA" }]);
  });

  it("matches a name through punctuation, accents and suffixes", () => {
    expect(athleteKey("D.J. Moore")).toBe(athleteKey("DJ Moore"));
    expect(athleteKey("Marvin Harrison Jr.")).toBe("marvin harrison");
    expect(athleteKey("Amon-Ra St. Brown")).toBe("amon ra st brown");
    expect(athleteKey("Nikola Jokić")).toBe("nikola jokic");
  });

  it("tells two players with one name apart by who is playing", () => {
    const index = indexAthletes([
      { name: "Josh Allen", position: "LB", headshot: null, team: "JAX", place: "Jacksonville" },
      { name: "Josh Allen", position: "QB", headshot: null, team: "BUF", place: "Buffalo" },
    ]);
    expect(findAthlete(index, "Josh Allen", "Miami vs Buffalo")?.position).toBe("QB");
    expect(findAthlete(index, "Josh Allen", "Jacksonville vs New York G")?.position).toBe("LB");
    expect(findAthlete(index, "Nobody Here", "Miami vs Buffalo")).toBeNull();
  });
});
