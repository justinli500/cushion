import { describe, expect, it } from "vitest";
import { winChance } from "@/domains/scores/chance";

describe("a team's chance of winning", () => {
  it("is the midpoint of a tight book", () => {
    expect(winChance({ bid: 0.94, ask: 0.96, last: 0.9 })).toMatchObject({ p: 0.95, uncertain: false });
  });

  it("falls back to the last trade when the book is wide", () => {
    expect(winChance({ bid: 0.16, ask: 0.98, last: 0.96 })).toMatchObject({ p: 0.96, uncertain: true });
  });

  it("keeps the midpoint of a wide book that has never traded", () => {
    expect(winChance({ bid: 0.1, ask: 0.9, last: null }).p).toBeCloseTo(0.5);
  });

  it("is unknown with no quote at all", () => {
    expect(winChance({ bid: null, ask: null, last: null }).p).toBeNull();
  });
});
