import { afterEach, describe, expect, it, vi } from "vitest";
import { clientAddress, throttle } from "@/lib/throttle";

const from = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("clientAddress", () => {
  it("on Vercel, uses the platform's header, then the last forwarded hop, never the first", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientAddress(from({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.7");
    expect(clientAddress(from({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientAddress(from({}))).toBe("unknown");
  });

  it("believes no header anywhere else, where a caller can set them", () => {
    vi.stubEnv("VERCEL", "");
    expect(clientAddress(from({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" }))).toBe("local");
  });
});

describe("throttle", () => {
  it("limits each client and leaves others alone", () => {
    vi.stubEnv("VERCEL", "1");
    const limited = throttle(2, 100);
    const a = () => limited(from({ "x-real-ip": "198.51.100.1" }));
    expect([a(), a(), a()]).toEqual([false, false, true]);
    expect(limited(from({ "x-real-ip": "198.51.100.2" }))).toBe(false);
  });

  it("cannot be reset by inventing addresses off the platform", () => {
    vi.stubEnv("VERCEL", "");
    const limited = throttle(2, 100);
    const spoof = (claimed: string) => limited(from({ "x-real-ip": claimed, "x-forwarded-for": claimed }));
    expect([spoof("1.1.1.1"), spoof("2.2.2.2"), spoof("3.3.3.3")]).toEqual([false, false, true]);
  });

  it("caps everyone together, however many addresses the requests come from", () => {
    vi.stubEnv("VERCEL", "1");
    const limited = throttle(5, 3);
    const results = [1, 2, 3, 4].map((n) => limited(from({ "x-real-ip": `198.51.100.${n}` })));
    expect(results).toEqual([false, false, false, true]);
  });

  it("does not let one client that is over its limit use up the total", () => {
    vi.stubEnv("VERCEL", "1");
    const limited = throttle(1, 3);
    const noisy = from({ "x-real-ip": "198.51.100.1" });
    for (let i = 0; i < 50; i++) limited(noisy);
    expect(limited(from({ "x-real-ip": "198.51.100.2" }))).toBe(false);
    expect(limited(from({ "x-real-ip": "198.51.100.3" }))).toBe(false);
  });

  it("keeps the total when a flood of new clients fills the table", () => {
    vi.stubEnv("VERCEL", "1");
    const limited = throttle(1, 1500);
    let turnedAway = 0;
    for (let i = 0; i < 1600; i++) turnedAway += Number(limited(from({ "x-real-ip": `c${i}` })));
    expect(turnedAway).toBe(100);
  });
});
