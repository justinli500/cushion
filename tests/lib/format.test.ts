import { describe, expect, it } from "vitest";
import { formatChance, formatVolume } from "@/lib/format";

describe("formatVolume", () => {
  it("shortens dollars traded the way a market card shows them", () => {
    expect(formatVolume(135_400)).toBe("$135K Vol.");
    expect(formatVolume(1_250_000)).toBe("$1.3M Vol.");
    expect(formatVolume(2_000_000)).toBe("$2M Vol.");
    expect(formatVolume(812.4)).toBe("$812 Vol.");
    expect(formatVolume(0)).toBe("$0 Vol.");
  });
});

describe("formatChance", () => {
  it("never rounds a real chance to 0% or 100%", () => {
    expect([formatChance(0.004), formatChance(0.996), formatChance(0.22), formatChance(null)]).toEqual(["under 1%", "over 99%", "22%", "n/a"]);
  });
});
