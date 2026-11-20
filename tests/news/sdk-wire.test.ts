import Anthropic from "@anthropic-ai/sdk";
import { createServer, type ServerResponse, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeLines } from "@/domains/news/service";

// The real SDK talks to a local stand-in for the Messages API. This is the one place the SDK's own
// serialisation, response parsing and abort handling run, since the mocked tests never reach them.
let server: Server;
const requests: { path?: string; body: Record<string, unknown> }[] = [];

async function serve(handler: (res: ServerResponse) => void) {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      requests.push({ path: req.url, body: JSON.parse(raw) });
      handler(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return new Anthropic({ apiKey: "sk-ant-wire-test", baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 });
}

afterEach(() => {
  requests.length = 0;
  vi.restoreAllMocks();
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

const LINE = "Fed minutes land at 2pm, and traders see an 18% chance of a 2% drop.";
const searchReply = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10, server_tool_use: { web_search_requests: 1 } },
  content: [
    { type: "text", text: "I'll search.", citations: null },
    { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "bitcoin" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [] },
    { type: "text", text: JSON.stringify({ lines: [{ n: 1, text: LINE }] }), citations: [] },
  ],
};

describe("the real SDK against a local Messages endpoint", () => {
  it("posts one web-search request and turns a search reply into an ai line", async () => {
    const client = await serve((res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(searchReply));
    });
    const lines = await writeLines([{ id: "btc", topic: "Bitcoin", facts: "18% chance" }], client);

    expect(lines.btc).toEqual({ text: LINE, source: "ai" });
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/v1/messages");
    expect(requests[0].body).toMatchObject({
      model: "claude-haiku-5-5",
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });
  });

  it("stops waiting at the timeout", async () => {
    const client = await serve(() => {});
    const started = Date.now();
    const lines = await writeLines([{ id: "a", topic: "Oil", facts: "Oil chance 20%" }], client, { timeoutMs: 150 });
    expect(lines.a).toEqual({ text: "Oil chance 20%.", source: "numbers" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("falls back on a 401 and logs neither the key nor the response body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = await serve((res) => {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid key sk-ant-wire-test" } }));
    });
    const lines = await writeLines([{ id: "a", topic: "Oil", facts: "Oil chance 20%" }], client);

    expect(lines.a.source).toBe("numbers");
    expect(JSON.stringify(warn.mock.calls)).toContain("status 401");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-ant-wire-test");
  });
});
