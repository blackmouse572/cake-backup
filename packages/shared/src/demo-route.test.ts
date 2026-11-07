import { describe, expect, it } from "vitest";
import { besideRoute, fallbackStart, metresBetween, metresLeft, walkRoute } from "./demo-route";

const market = { lat: 10.7722, lng: 106.6983 };

const guesthouse = { lat: 10.7769, lng: 106.7009 };

describe("the demo's fake route", () => {
  it("walks from start to destination in the asked number of steps", () => {
    const route = walkRoute(market, guesthouse, 20);
    expect(route).toHaveLength(21);
    expect(route[0]).toEqual(market);
    expect(metresBetween(route[20]!, guesthouse)).toBeLessThan(1);
  });

  it("counts the metres left, which shrink step by step", () => {
    const route = walkRoute(market, guesthouse, 20);
    expect(metresLeft(route, 0)).toBeGreaterThan(metresLeft(route, 10));
    expect(metresLeft(route, 20)).toBe(0);
  });

  it("puts an off-route point about 180 m to the side", () => {
    const route = walkRoute(market, guesthouse, 20);
    expect(metresBetween(besideRoute(route, 5), route[5]!)).toBeCloseTo(180, -1);
  });

  it("starts 800 m away when the phone never reported", () => {
    expect(metresBetween(fallbackStart(guesthouse), guesthouse)).toBeCloseTo(800, -1);
  });
});
