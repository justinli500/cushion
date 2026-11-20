import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/receipts/route";
import { ReceiptUnavailable, sendMemo } from "@/domains/receipts/send";

vi.mock("@/domains/receipts/send", async (importOriginal) => ({ ...(await importOriginal<object>()), sendMemo: vi.fn() }));
const send = vi.mocked(sendMemo);

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const body = (over: object = {}) => ({
  id: nextId(),
  at: "2026-11-20T01:02:03.000Z",
  title: "Protect my Bitcoin",
  cost: 12.5,
  maxPayout: 40,
  legs: [{ symbol: "GEMI-BTC2611202200-HI95000", side: "yes", filled: 10, cost: 5 }],
  ...over,
});
let ip = 0;
const post = (payload: unknown, from = `10.0.0.${++ip}`) =>
  POST(new Request("http://localhost/api/receipts", { method: "POST", body: typeof payload === "string" ? payload : JSON.stringify(payload), headers: { "x-forwarded-for": from } }));

beforeEach(() => {
  send.mockReset().mockResolvedValue("SIG");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/receipts", () => {
  it("sends the memo and answers with the signature", async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signature: "SIG" });
    const memo = JSON.parse(send.mock.calls[0][0]);
    expect(memo).toMatchObject({ app: "cushion", v: 1, cost: 12.5, pays: 40, legs: [["GEMI-BTC2611202200-HI95000", "y", 10]] });
    expect(JSON.stringify(memo)).not.toContain("Bitcoin");
  });

  it.each([
    ["a body that is not JSON", "{nope"],
    ["a body that fails validation", body({ legs: [] })],
    ["a body over 16 KB", body({ padding: "x".repeat(17 * 1024) })],
  ])("answers 400 for %s and sends nothing", async (_name, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
    expect(send).not.toHaveBeenCalled();
  });

  it("names the invalid field without echoing its value", async () => {
    const res = await post(body({ cost: "secret-value" }));
    const { error } = await res.json();
    expect(error).toContain("cost");
    expect(error).not.toContain("secret-value");
  });

  it("answers 429 past 20 a minute from one address, and only for that address", async () => {
    const from = "192.0.2.1";
    for (let i = 0; i < 20; i++) expect((await post(body(), from)).status).toBe(200);
    const res = await post(body(), from);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: expect.any(String) });
    expect((await post(body(), "192.0.2.2")).status).toBe(200);
  });

  it("answers 503 with the plain reason when the chain is not available", async () => {
    send.mockRejectedValue(new ReceiptUnavailable("Receipts are not set up on this server."));
    const res = await post(body());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Receipts are not set up on this server." });
  });

  it("answers 503 without leaking anything from an unexpected failure", async () => {
    send.mockRejectedValue(new Error("boom at /Users/someone/secret.ts"));
    const res = await post(body());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });

  describe("sending a receipt twice", () => {
    it("returns the first signature and pays for one transaction", async () => {
      const receipt = body();
      send.mockResolvedValueOnce("FIRST").mockResolvedValueOnce("SECOND");
      expect(await (await post(receipt)).json()).toEqual({ signature: "FIRST" });
      expect(await (await post({ ...receipt, id: receipt.id.toUpperCase() })).json()).toEqual({ signature: "FIRST" });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("shares one transaction between concurrent requests", async () => {
      const receipt = body();
      send.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve("SLOW"), 20)));
      const [a, b] = await Promise.all([post(receipt), post(receipt)]);
      expect(await a.json()).toEqual({ signature: "SLOW" });
      expect(await b.json()).toEqual({ signature: "SLOW" });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("tries again after a failure", async () => {
      const receipt = body();
      send.mockRejectedValueOnce(new ReceiptUnavailable("The network took too long.")).mockResolvedValueOnce("RETRIED");
      expect((await post(receipt)).status).toBe(503);
      expect(await (await post(receipt)).json()).toEqual({ signature: "RETRIED" });
    });
  });
});
