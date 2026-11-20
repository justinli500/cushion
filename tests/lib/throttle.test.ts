import { describe, expect, it } from "vitest";
import { clientAddress, throttle } from "@/lib/throttle";

const from = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

describe("clientAddress", () => {
  it("trusts the platform's header and the last forwarded hop, never the first", () => {
    expect(clientAddress(from({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.7");
    expect(clientAddress(from({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientAddress(from({}))).toBe("unknown");
  });
});

describe("throttle", () => {
  it("limits each client and leaves others alone", () => {
    const limited = throttle(2, 100);
    const a = () => limited(from({ "x-real-ip": "198.51.100.1" }));
    expect([a(), a(), a()]).toEqual([false, false, true]);
    expect(limited(from({ "x-real-ip": "198.51.100.2" }))).toBe(false);
  });

  it("cannot be reset by a caller inventing forwarded addresses", () => {
    const limited = throttle(2, 100);
    const spoof = (claimed: string) => limited(from({ "x-forwarded-for": `${claimed}, 198.51.100.9` }));
    expect([spoof("1.1.1.1"), spoof("2.2.2.2"), spoof("3.3.3.3")]).toEqual([false, false, true]);
  });

  it("caps everyone together, however many addresses the requests come from", () => {
    const limited = throttle(5, 3);
    const results = [1, 2, 3, 4].map((n) => limited(from({ "x-real-ip": `198.51.100.${n}` })));
    expect(results).toEqual([false, false, false, true]);
  });
});
