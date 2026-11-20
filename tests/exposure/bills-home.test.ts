import { describe, expect, it } from "vitest";
import { BILLS } from "@/domains/exposure/bills";
import { heatingBill, heatOf, homeOf, HOMES, THERMOSTAT, warmthOf, winterOf, WINTERS } from "@/domains/exposure/bills-home";

describe("a heating bill from a home, a winter and a thermostat", () => {
  it("scales the home's bill by the winter and by about 3% a degree", () => {
    expect(heatingBill(homeOf("house"), winterOf("cold"), 68)).toBe(130);
    expect(heatingBill(homeOf("house"), winterOf("harsh"), 68)).toBe(182);
    expect(heatingBill(homeOf("apartment"), winterOf("mild"), 68)).toBe(36);
    // Four degrees warmer is about 12% more.
    expect(heatingBill(homeOf("house"), winterOf("cold"), 72)).toBe(146);
    expect(heatingBill(homeOf("house"), winterOf("cold"), 64)).toBe(114);
  });

  it("falls back to a house, a cold winter and gas for choices it does not know", () => {
    expect([homeOf("castle").id, winterOf(null).id, heatOf(undefined).id]).toEqual(["house", "cold", "gas"]);
    expect(heatOf("gas").note).toBeNull();
    expect(heatOf("electric")).toMatchObject({ weak: true });
    // Oil and propane are cushioned on the oil market, so they need no note.
    expect(heatOf("oil")).toMatchObject({ weak: false, note: null });
  });

  it("stays inside what the page accepts, and reads warmth from the setting", () => {
    const most = heatingBill(HOMES[HOMES.length - 1], WINTERS[WINTERS.length - 1], THERMOSTAT.max);
    expect(most).toBeLessThanOrEqual(BILLS.heating.max);
    expect([warmthOf(60), warmthOf(68), warmthOf(76), warmthOf(90)]).toEqual([0, 0.5, 1, 1]);
  });
});
