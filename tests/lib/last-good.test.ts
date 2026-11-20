import { beforeEach, describe, expect, it } from "vitest";
import { ageOf, forgetAll, recall, remember } from "@/lib/last-good";

/** A stand-in for session storage that holds at most `room` characters. */
function fakeStorage(room = Infinity) {
  const items = new Map<string, string>();
  const used = () => [...items.values()].reduce((sum, v) => sum + v.length, 0);
  return {
    items,
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => void items.delete(key),
    setItem: (key: string, value: string) => {
      if (used() - (items.get(key)?.length ?? 0) + value.length > room) throw new Error("QuotaExceededError");
      items.set(key, value);
    },
  };
}

describe("the last good answers", () => {
  beforeEach(() => forgetAll(null));

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

  it("still has an answer after a reload, which empties memory but not session storage", () => {
    const storage = fakeStorage();
    forgetAll(storage);
    remember("/api/markets/games", { games: [1] }, 1_000);
    forgetAll();
    expect(recall("/api/markets/games", 2_000)).toEqual({ games: [1] });
    expect(ageOf("/api/markets/games", 2_000)).toBe(1_000);
    // Still too old to show once five minutes have passed, reload or not.
    forgetAll();
    expect(recall("/api/markets/games", 1_000 + 5 * 60_000 + 1)).toBeUndefined();
  });

  it("throws away what it cannot read, and makes room when storage is full", () => {
    const storage = fakeStorage(60);
    forgetAll(storage);
    storage.items.set("cushion.cache:/broken", "not json");
    storage.items.set("someone.else", "kept");
    expect(recall("/broken", 0)).toBeUndefined();
    expect(storage.items.has("cushion.cache:/broken")).toBe(false);

    remember("/a", "x".repeat(20), 0);
    remember("/b", "y".repeat(20), 0);
    // The second did not fit beside the first, so the kept answers were dropped to make room. Nothing else was touched.
    expect([...storage.items.keys()].sort()).toEqual(["cushion.cache:/b", "someone.else"]);
    expect(recall("/a", 1)).toBe("x".repeat(20));
    // An answer too large for storage at all is still held in memory.
    remember("/huge", "z".repeat(500), 0);
    expect(recall("/huge", 1)).toBe("z".repeat(500));
  });
});
