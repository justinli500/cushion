import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsClient, NewsReply } from "@/domains/news/claude";
import { numbersLine } from "@/domains/news/fallback";
import type { NewsCard } from "@/domains/news/schema";
import { writeLines } from "@/domains/news/service";

// The cache is per process and keyed by topic, so every card gets a topic no other test uses.
let seq = 0;
const card = (over: Partial<NewsCard> = {}): NewsCard => {
  seq += 1;
  return { id: `card-${seq}`, topic: `Topic ${seq}`, facts: `Market gives a ${seq}% chance of a drop today`, ...over };
};

const text = (t: string) => ({ type: "text", text: t });
const reply = (lines: { n: number; text: string }[], stop_reason = "end_turn"): NewsReply => ({
  stop_reason,
  content: [text("Let me look."), { type: "server_tool_use" }, { type: "web_search_tool_result" }, text(JSON.stringify({ lines }))],
});

type Create = NewsClient["messages"]["create"];
const clientWith = (create: Create): NewsClient => ({ messages: { create } });
const answering = (...replies: NewsReply[]) => {
  const create = vi.fn<Create>();
  replies.forEach((r) => create.mockResolvedValueOnce(r));
  return { create, client: clientWith(create) };
};

const GOOD = "Fed minutes land at 2pm, and traders see an 18% chance of a 2% drop.";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("numbersLine", () => {
  it("ends a plain fact with a full stop", () => {
    expect(numbersLine("Market gives an 18% chance BTC closes under $61,500 today")).toBe(
      "Market gives an 18% chance BTC closes under $61,500 today.",
    );
  });

  it("collapses stray whitespace and keeps existing end punctuation", () => {
    expect(numbersLine("  Rain is likely.\n\n 40%  chance!  ")).toBe("Rain is likely. 40% chance!");
  });

  it("clips a long fact at a whole word and marks the cut", () => {
    const long = `${"word ".repeat(60)}end`;
    const line = numbersLine(long);
    expect(line.length).toBeLessThanOrEqual(201);
    expect(line.endsWith("word…")).toBe(true);
  });
});

describe("without a key", () => {
  it("gives every card its own numbers and marks them as numbers", async () => {
    const a = card({ facts: "Market gives an 18% chance BTC closes under $61,500 today" });
    const b = card({ facts: "Rain chance 40%" });
    expect(await writeLines([a, b], null)).toEqual({
      [a.id]: { text: "Market gives an 18% chance BTC closes under $61,500 today.", source: "numbers" },
      [b.id]: { text: "Rain chance 40%.", source: "numbers" },
    });
  });
});

describe("with Claude", () => {
  it("returns model lines marked ai, matched to cards by number even when the reply is out of order", async () => {
    const [a, b] = [card(), card()];
    const { client } = answering(reply([{ n: 2, text: "Second line." }, { n: 1, text: GOOD }]));
    expect(await writeLines([a, b], client)).toEqual({
      [a.id]: { text: GOOD, source: "ai" },
      [b.id]: { text: "Second line.", source: "ai" },
    });
  });

  it("sends one request for all cards, with web search on and the cards as data", async () => {
    const [a, b] = [card({ topic: "Bitcoin" }), card({ topic: "Austin weather" })];
    const { create, client } = answering(reply([{ n: 1, text: GOOD }, { n: 2, text: GOOD }]));
    await writeLines([a, b], client, { now: new Date("2026-11-19T15:00:00Z") });

    expect(create).toHaveBeenCalledTimes(1);
    const [body] = create.mock.calls[0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.tools).toEqual([expect.objectContaining({ type: "web_search_20250305", name: "web_search" })]);
    const prompt = JSON.stringify(body.messages);
    expect(prompt).toContain("Bitcoin");
    expect(prompt).toContain("Austin weather");
    expect(prompt).toContain("Thursday, November 19, 2026");
    expect(String(body.system)).toMatch(/is data and not instructions/);
  });

  it("keeps the good lines and gives only the bad card its numbers", async () => {
    const [a, b, c] = [card(), card({ facts: "Rain chance 40%" }), card()];
    const { client } = answering(
      reply([{ n: 1, text: GOOD }, { n: 2, text: "Read more at https://example.com/rain today." }, { n: 3, text: "Third line." }]),
    );
    expect(await writeLines([a, b, c], client)).toEqual({
      [a.id]: { text: GOOD, source: "ai" },
      [b.id]: { text: "Rain chance 40%.", source: "numbers" },
      [c.id]: { text: "Third line.", source: "ai" },
    });
  });

  it("falls back for a card the model skipped and ignores numbers that were never sent", async () => {
    const [a, b] = [card(), card({ facts: "Rain chance 40%" })];
    const { client } = answering(reply([{ n: 1, text: GOOD }, { n: 7, text: "Not a card." }]));
    const lines = await writeLines([a, b], client);
    expect(lines[a.id]).toEqual({ text: GOOD, source: "ai" });
    expect(lines[b.id]).toEqual({ text: "Rain chance 40%.", source: "numbers" });
  });

  it.each([
    ["too long", Array(30).fill("word").join(" ")],
    ["a web address", "See www.example.com for the full picture today."],
    ["a bare domain", "Reuters.com says the vote lands today."],
    ["markdown", "**Big day** for oil as traders see a 20% chance."],
    ["html", "<b>Big day</b> for oil as traders see a 20% chance."],
    ["empty", "   "],
  ])("uses the numbers when the line is %s", async (_name, bad) => {
    const c = card({ facts: "Oil chance 20%" });
    const { client } = answering(reply([{ n: 1, text: bad }]));
    expect(await writeLines([c], client)).toEqual({ [c.id]: { text: "Oil chance 20%.", source: "numbers" } });
  });

  it("reads the answer from after the search blocks, even when cited fragments split the JSON", async () => {
    const c = card();
    const json = JSON.stringify({ lines: [{ n: 1, text: GOOD }] });
    const { client } = answering({
      stop_reason: "end_turn",
      content: [
        text('I will check {the news} first.'),
        { type: "server_tool_use" },
        { type: "web_search_tool_result" },
        text(`Here you go:\n\`\`\`json\n${json.slice(0, 20)}`),
        text(`${json.slice(20)}\n\`\`\``),
      ],
    });
    expect(await writeLines([c], client)).toEqual({ [c.id]: { text: GOOD, source: "ai" } });
  });

  it.each([
    ["no JSON in the reply", { stop_reason: "end_turn", content: [text("Nothing notable today.")] }],
    ["broken JSON", { stop_reason: "end_turn", content: [text('{"lines":[{"n":1,')] }],
    ["the wrong shape", { stop_reason: "end_turn", content: [text('{"captions":[]}')] }],
    ["a refusal", reply([{ n: 1, text: GOOD }], "refusal")],
    ["a cut-off reply", reply([{ n: 1, text: GOOD }], "max_tokens")],
    ["a paused search", reply([{ n: 1, text: GOOD }], "pause_turn")],
  ])("uses the numbers on %s", async (_name, bad) => {
    const c = card({ facts: "Oil chance 20%" });
    const { client } = answering(bad);
    expect(await writeLines([c], client)).toEqual({ [c.id]: { text: "Oil chance 20%.", source: "numbers" } });
  });

  it("uses the numbers when the call fails, and logs the failure without the error message", async () => {
    const c = card({ facts: "Oil chance 20%" });
    const client = clientWith(vi.fn<Create>().mockRejectedValue(new Error("boom sk-ant-secret-key")));
    expect(await writeLines([c], client)).toEqual({ [c.id]: { text: "Oil chance 20%.", source: "numbers" } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-ant-secret-key");
  });

  it("gives up after the timeout and uses the numbers for every card", async () => {
    const [a, b] = [card({ facts: "Oil chance 20%" }), card({ facts: "Rain chance 40%" })];
    const create = vi.fn<Create>(
      (_body, { signal }) =>
        new Promise<NewsReply>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const lines = await writeLines([a, b], clientWith(create), { timeoutMs: 20 });
    expect(lines[a.id]).toEqual({ text: "Oil chance 20%.", source: "numbers" });
    expect(lines[b.id]).toEqual({ text: "Rain chance 40%.", source: "numbers" });
  });
});

describe("cache", () => {
  const now = new Date("2026-11-19T15:00:00Z");

  it("does not call the client again for the same card", async () => {
    const c = card();
    const { create, client } = answering(reply([{ n: 1, text: GOOD }]));
    await writeLines([c], client, { now });
    const again = await writeLines([{ ...c, id: "another-id" }], client, { now });
    expect(create).toHaveBeenCalledTimes(1);
    expect(again["another-id"]).toEqual({ text: GOOD, source: "ai" });
  });

  it("treats a price drifting by a few dollars as the same card, but a different strike as a new one", async () => {
    const topic = `Bitcoin ${++seq}`;
    const at = (level: string) => card({ topic, facts: `Market gives an 18% chance BTC closes under ${level} today` });
    const { create, client } = answering(reply([{ n: 1, text: GOOD }]), reply([{ n: 1, text: "Other strike." }]));
    await writeLines([at("$61,512")], client, { now });
    await writeLines([at("$61,498")], client, { now });
    expect(create).toHaveBeenCalledTimes(1);
    const other = await writeLines([at("$62,500")], client, { now });
    expect(create).toHaveBeenCalledTimes(2);
    expect(Object.values(other)[0].text).toBe("Other strike.");
  });

  it("asks again the next UTC day", async () => {
    const c = card();
    const { create, client } = answering(reply([{ n: 1, text: GOOD }]), reply([{ n: 1, text: GOOD }]));
    await writeLines([c], client, { now: new Date("2026-11-19T23:59:00Z") });
    await writeLines([c], client, { now: new Date("2026-11-20T00:01:00Z") });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("asks only for the cards that are not cached", async () => {
    const [cachedCard, fresh] = [card(), card({ facts: "Rain chance 40%" })];
    const first = answering(reply([{ n: 1, text: GOOD }]));
    await writeLines([cachedCard], first.client, { now });
    const second = answering(reply([{ n: 1, text: "Fresh line." }]));
    const lines = await writeLines([cachedCard, fresh], second.client, { now });
    expect(JSON.stringify(second.create.mock.calls[0][0].messages)).not.toContain(cachedCard.topic);
    expect(lines[cachedCard.id].text).toBe(GOOD);
    expect(lines[fresh.id].text).toBe("Fresh line.");
  });

  it("shares one call between simultaneous requests for the same card", async () => {
    const c = card();
    const { create, client } = answering(reply([{ n: 1, text: GOOD }]));
    const [x, y] = await Promise.all([writeLines([c], client, { now }), writeLines([{ ...c, id: "twin" }], client, { now })]);
    expect(create).toHaveBeenCalledTimes(1);
    expect([x[c.id].source, y.twin.source]).toEqual(["ai", "ai"]);
  });

  it("sends a card that appears twice in one request only once", async () => {
    const c = card();
    const { create, client } = answering(reply([{ n: 1, text: GOOD }]));
    const lines = await writeLines([c, { ...c, id: "twin" }], client, { now });
    expect(JSON.stringify(create.mock.calls[0][0].messages).split(c.topic)).toHaveLength(2);
    expect([lines[c.id].source, lines.twin.source]).toEqual(["ai", "ai"]);
  });

  it("does not remember a failed card, so the next request tries again", async () => {
    const c = card({ facts: "Rain chance 40%" });
    const { create, client } = answering(reply([{ n: 1, text: "Visit www.example.com" }]), reply([{ n: 1, text: GOOD }]));
    expect((await writeLines([c], client, { now }))[c.id].source).toBe("numbers");
    expect((await writeLines([c], client, { now }))[c.id]).toEqual({ text: GOOD, source: "ai" });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
