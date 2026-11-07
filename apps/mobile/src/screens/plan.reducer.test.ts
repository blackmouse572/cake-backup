import type { Place, Route } from "@cage/shared";
import { describe, expect, it } from "vitest";
import { initialPlan, planReducer, travelMs, type PlanAction, type PlanState } from "./plan.reducer";

const here = { lat: 21.0285, lng: 105.7782 };

const place: Place = { id: "p1", name: "1 Đại Cồ Việt", address: "Hai Bà Trưng, Hà Nội", lat: 21.0072, lng: 105.843 };

const route: Route = { distanceM: 9_300, durationS: 1_440, polyline: "abc" };

const run = (...actions: PlanAction[]) => actions.reduce<PlanState>(planReducer, initialPlan);

describe("planning a trip (screen 01)", () => {
  it("searches from two letters and drops answers for older text", () => {
    expect(run({ type: "typed", query: "B" }).search).toBe("idle");
    const typing = run({ type: "typed", query: "Bế" }, { type: "typed", query: "Bến x" });
    expect(typing.search).toBe("searching");

    const late = planReducer(typing, { type: "suggestions", query: "Bế", result: [{ id: "x", name: "Bếp", address: "" }] });
    expect(late).toBe(typing);
    const fresh = planReducer(typing, { type: "suggestions", query: "Bến x", result: [{ id: "p1", name: "Bến xe", address: "" }] });
    expect(fresh).toMatchObject({ search: "done", suggestions: [{ id: "p1" }] });
  });

  it("asks for a route once a place is picked and the phone knows where it is", () => {
    const picked = run({ type: "here", here }, { type: "typed", query: "Đại Cồ" }, { type: "picked", result: place });
    expect(picked).toMatchObject({ query: "1 Đại Cồ Việt", suggestions: [], route: { status: "loading" } });
    expect(travelMs(picked)).toBeNull();

    const ready = planReducer(picked, { type: "route", to: "p1", mode: "motorbike", result: route });
    expect(travelMs(ready)).toBe(1_440_000);
  });

  it("ignores a route for a mode the traveller has since changed", () => {
    const picked = run({ type: "here", here }, { type: "picked", result: place }, { type: "mode", mode: "car" });
    const stale = planReducer(picked, { type: "route", to: "p1", mode: "motorbike", result: route });
    expect(stale.route.status).toBe("loading");
  });

  it("falls back to a picked travel time when there is no route", () => {
    const failed = run(
      { type: "here", here },
      { type: "picked", result: place },
      { type: "route", to: "p1", mode: "motorbike", result: "error" },
      { type: "minutes", minutes: 45 },
    );

    expect(travelMs(failed)).toBe(45 * 60_000);
    expect(travelMs(run({ type: "picked", result: place }))).toBe(30 * 60_000);
  });

  it("starts over when the destination is cleared or retyped", () => {
    const ready = run(
      { type: "here", here },
      { type: "picked", result: place },
      { type: "route", to: "p1", mode: "motorbike", result: route },
    );

    expect(planReducer(ready, { type: "typed", query: "Ga" })).toMatchObject({ picked: null, route: { status: "idle" } });
    expect(planReducer(ready, { type: "clear" })).toMatchObject({ here, picked: null, query: "" });
  });
});
