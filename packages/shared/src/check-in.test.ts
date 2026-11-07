import { describe, expect, it } from "vitest";
import { checkInCall, distanceM, distanceToRouteM, freshWatch, ROUTE, watchRoute, type Reading, type RouteWatch } from "./check-in";
import { checkInDeadline } from "./deadline";
import { TIMERS } from "./timers";

// A straight road north along Nguyễn Huệ, District 1, and a destination at its end.
const route = [
  { lat: 10.7700, lng: 106.7030 },
  { lat: 10.7800, lng: 106.7030 },
];

const destination = { lat: 10.7800, lng: 106.7030 };

/** Metres east of the road, as a longitude at this latitude. */
const east = (m: number) => m / (111_320 * Math.cos((10.775 * Math.PI) / 180));

/** Runs readings in order and returns every reason raised. */
function run(readings: Reading[], road = route): (string | null)[] {
  let watch: RouteWatch = freshWatch;

  return readings.map((reading) => {
    const result = watchRoute(watch, reading, road, destination);
    watch = result.watch;

    return result.reason;
  });
}

describe("distances", () => {
  it("measures a degree of latitude as about 111 km", () => {
    expect(distanceM({ lat: 10, lng: 106 }, { lat: 11, lng: 106 })).toBeCloseTo(111_195, -2);
  });

  it("measures from the nearest point of the route", () => {
    expect(distanceToRouteM({ lat: 10.775, lng: 106.703 + east(400) }, route)).toBeCloseTo(400, -1);
    // Past the end of the route, the distance is to its last point.
    expect(distanceToRouteM({ lat: 10.79, lng: 106.703 }, route)).toBeCloseTo(1112, -1);
  });
});

describe("off route", () => {
  const t0 = Date.UTC(2026, 10, 7, 14, 0);
  const off = (minutes: number): Reading => ({ lat: 10.772 + minutes * 0.0005, lng: 106.703 + east(500), at: t0 + minutes * 60_000 });

  it("asks once the traveller has been off the route for two minutes", () => {
    expect(run([off(0), off(1), off(2)])).toEqual([null, null, "off_route"]);
  });

  it("never asks for one bad fix", () => {
    const back = { lat: 10.775, lng: 106.703, at: t0 + 60_000 };
    expect(run([off(0), back, off(2), off(3)])).toEqual([null, null, null, null]);
  });

  it("skips readings too blurry to tell", () => {
    const blurry = { ...off(2), accuracyM: ROUTE.worstAccuracyM + 1 };
    expect(run([off(0), blurry])).toEqual([null, null]);
  });

  it("doesn't watch the route when there is none", () => {
    expect(run([off(0), off(1), off(2)], [])).toEqual([null, null, null]);
  });
});

describe("stopped too long", () => {
  const t0 = Date.UTC(2026, 10, 7, 14, 0);
  const at = (minutes: number, lat = 10.774): Reading => ({ lat, lng: 106.703, at: t0 + minutes * 60_000 });

  it("asks after twelve minutes in one spot", () => {
    expect(run([at(0), at(6), at(11), at(12)])).toEqual([null, null, null, "stopped"]);
  });

  it("starts again when the traveller moves on", () => {
    expect(run([at(0), at(6, 10.776), at(12, 10.776), at(18, 10.776)])).toEqual([null, null, null, "stopped"]);
  });

  it("treats a stop at the destination as arriving", () => {
    expect(run([at(0, 10.7799), at(20, 10.7799)])).toEqual([null, null]);
  });

  it("asks only after the full stop time", () => {
    expect(TIMERS.stoppedTooLongMs).toBe(12 * 60_000);
  });
});

describe("check-in calls", () => {
  const askedAt = Date.UTC(2026, 10, 7, 14, 0);

  it("rings at once, waits, rings again, then the deadline comes", () => {
    expect(checkInCall(askedAt, askedAt)).toEqual({ call: 1, ringing: true });
    expect(checkInCall(askedAt, askedAt + TIMERS.checkInAnswerMs)).toEqual({ call: 1, ringing: false });
    expect(checkInCall(askedAt, askedAt + TIMERS.checkInRetryMs)).toEqual({ call: 2, ringing: true });
    expect(checkInCall(askedAt, checkInDeadline(askedAt) - 1)).toEqual({ call: 2, ringing: true });
    expect(checkInCall(askedAt, checkInDeadline(askedAt))).toEqual({ call: 2, ringing: false });
  });
});
