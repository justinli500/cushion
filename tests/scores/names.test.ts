import { describe, expect, it } from "vitest";
import { lossCopy, teamLabel, teamNickname } from "@/domains/scores/names";
import { game, team } from "./helpers";

const pro = game();
const [texans, colts] = pro.teams;
const college = game({
  league: "NCAAM",
  teams: [team("ND", "Notre Dame Fighting Irish", "home", undefined, "Notre Dame"), team("AUB", "Auburn Tigers", "away", undefined, "Auburn")],
});
const clippers = team("LAC", "Los Angeles Clippers", "home", undefined, "Los Angeles C");

describe("team names", () => {
  it("uses the nickname for pro teams", () => {
    expect(teamNickname(pro, { ...texans, contract: { ...texans.contract, label: "Houston" } })).toBe("Texans");
  });

  it("keeps the full name when Gemini's short label cuts a word in half", () => {
    expect(teamNickname(pro, clippers)).toBe("Los Angeles Clippers");
  });

  it("uses the school for college teams", () => {
    expect(teamNickname(college, college.teams[0])).toBe("Notre Dame");
    expect(teamLabel(college, college.teams[0])).toBe("Notre Dame");
    expect(teamLabel(pro, texans)).toBe("Houston Texans");
  });

  it("writes the cushion copy for a pro team", () => {
    const g = game({
      teams: [
        { ...texans, contract: { ...texans.contract, label: "Houston" } },
        { ...colts, contract: { ...colts.contract, label: "Indianapolis" } },
      ],
    });
    expect(lossCopy(g, "HOU", 20)).toEqual({ title: "Texans loss cushion", detail: "Pays $20 if the Texans lose to the Colts." });
  });

  it("writes singular copy for a school", () => {
    expect(lossCopy(college, "ND", 50)).toEqual({ title: "Notre Dame loss cushion", detail: "Pays $50 if Notre Dame loses to Auburn." });
  });
});
