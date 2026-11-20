import { describe, expect, it, vi } from "vitest";
import { cached, cacheSize } from "@/lib/ttl-cache";

describe("cached", () => {
  it("shares one load between concurrent callers and reuses it until it expires", async () => {
    const load = vi.fn(async () => 7);
    const [a, b] = await Promise.all([cached("share", 60_000, load), cached("share", 60_000, load)]);
    expect([a, b, await cached("share", 60_000, load)]).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failed load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("ok");
    await expect(cached("flaky", 60_000, load)).rejects.toThrow("down");
    expect(await cached("flaky", 60_000, load)).toBe("ok");
  });

  it("stays bounded when keys come from request input", async () => {
    for (let i = 0; i < 2500; i++) await cached(`flood:${i}`, 60_000, async () => i);
    expect(cacheSize()).toBeLessThanOrEqual(2000);
    expect(await cached("flood:2499", 60_000, async () => -1)).toBe(2499);
  });
});
