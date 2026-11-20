import { describe, expect, it } from "vitest";
import { BILLS } from "@/domains/exposure/bills";
import { CARS, carOf, gallonsFor, MILES } from "@/domains/exposure/bills-car";

describe("gas from a car and a distance", () => {
  it("divides the miles driven by the car's miles per gallon", () => {
    expect(gallonsFor(carOf("sedan"), 1000)).toBe(33.3);
    expect(gallonsFor(carOf("hybrid"), 1200)).toBe(25);
    expect(gallonsFor(carOf("pickup"), 1000)).toBe(50);
  });

  it("falls back to a sedan for a car it does not know", () => {
    expect(carOf("spaceship").id).toBe("sedan");
    expect(carOf(null).id).toBe("sedan");
  });

  it("never asks for more gas than the page accepts", () => {
    const thirstiest = Math.min(...CARS.map((car) => car.mpg));
    expect(MILES.max / thirstiest).toBeLessThanOrEqual(BILLS.gas.max);
  });
});
