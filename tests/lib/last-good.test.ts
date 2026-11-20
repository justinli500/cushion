import { beforeEach, describe, expect, it } from "vitest";
import { ageOf, forgetAll, recall, remember } from "@/lib/last-good";

describe("the last good answers", () => {
  beforeEach(forgetAll);

  it("hands back what a route last answered", () => {
    remember("/api/markets/games", { games: [1] }, 1_000);
    expect(recall("/api/markets/games", 2_000)).toEqual({ games: [1] });
    expect(recall("/api/markets/ladders", 2_000)).toBeUndefined();
    expect(ageOf("/api/markets/games", 2_000)).toBe(1_000);
    expect(ageOf("/api/markets/ladders", 2_000)).toBe(Infinity);
  });

  it("does not hand back prices more than five minutes old", () => {
    remember("/api/book?symbols=A", { books: {} }, 0);
    expect(recall("/api/book?symbols=A", 5 * 60_000)).toEqual({ books: {} });
    expect(recall("/api/book?symbols=A", 5 * 60_000 + 1)).toBeUndefined();
  });

  it("keeps the newest answers when it is full", () => {
    for (let i = 0; i < 201; i++) remember(`/api/book?symbols=${i}`, i, i);
    expect(recall("/api/book?symbols=0", 300)).toBeUndefined();
    expect(recall("/api/book?symbols=200", 300)).toBe(200);
    // Answering again moves a route to the back of the line.
    remember("/api/book?symbols=1", "again", 300);
    remember("/api/book?symbols=new", 1, 300);
    expect(recall("/api/book?symbols=1", 300)).toBe("again");
    expect(recall("/api/book?symbols=2", 300)).toBeUndefined();
  });
});
