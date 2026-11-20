import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/news/route";
import { newsRequest } from "@/domains/news/schema";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/news", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

const ok = { id: "btc", topic: "Bitcoin", facts: "Market gives an 18% chance BTC closes under $61,500 today" };

beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/news validation", () => {
  it.each([
    ["not JSON", "{nope"],
    ["an empty object", {}],
    ["no cards", { cards: [] }],
    ["more than 8 cards", { cards: Array.from({ length: 9 }, (_, i) => ({ ...ok, id: `c${i}` })) }],
    ["a missing id", { cards: [{ topic: "Bitcoin", facts: "x" }] }],
    ["an id that is only control characters", { cards: [{ ...ok, id: "\u0000\u0007" }] }],
    ["a topic over 60 characters", { cards: [{ ...ok, topic: "x".repeat(61) }] }],
    ["facts over 300 characters", { cards: [{ ...ok, facts: "x".repeat(301) }] }],
    ["empty facts", { cards: [{ ...ok, facts: "  " }] }],
    ["a repeated id", { cards: [ok, ok] }],
    ["a body that is too large", { cards: [{ ...ok, facts: "x".repeat(30_000) }] }],
  ])("returns 400 with an error for %s", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it("accepts exactly 8 cards, a 60 character topic and 300 character facts", async () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, topic: "t".repeat(60), facts: "f".repeat(300) }));
    expect((await post({ cards })).status).toBe(200);
  });

  it("strips control characters before applying the length limits", () => {
    const { cards } = newsRequest.parse({ cards: [{ id: "a\u0000b", topic: "Bit‮coin\n", facts: `${"x".repeat(299)}\u0000` }] });
    expect(cards[0]).toEqual({ id: "ab", topic: "Bitcoin", facts: "x".repeat(299) });
  });
});

describe("POST /api/news without a key", () => {
  it("returns a numbers line for every card and nothing else", async () => {
    const res = await post({ cards: [ok, { id: "rain", topic: "Austin weather", facts: "Rain chance 40%" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      lines: {
        btc: { text: "Market gives an 18% chance BTC closes under $61,500 today.", source: "numbers" },
        rain: { text: "Rain chance 40%.", source: "numbers" },
      },
    });
  });
});
