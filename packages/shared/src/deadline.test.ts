import { describe, expect, it } from "vitest";
import { alertStep, arrivalDeadline, atArrivalDeadline, checkInDeadline, likelyBatteryDied } from "./deadline";
import { TIMERS } from "./timers";

const arrival = Date.UTC(2026, 10, 3, 14, 58);
const deadline = arrivalDeadline(arrival);

describe("arrival deadline", () => {
  it("waits for the buffer after the expected arrival", () => {
    expect(deadline - arrival).toBe(20 * 60_000);
  });

  it("checks in when the phone is still sending updates", () => {
    const status = atArrivalDeadline({
      now: deadline,
      status: "active",
      lostContactEnabled: true,
      lastHeardAt: deadline - 30_000,
    });

    expect(status).toBe("check_in");
  });

  it("marks lost contact when the phone went quiet", () => {
    const status = atArrivalDeadline({
      now: deadline,
      status: "active",
      lostContactEnabled: true,
      lastHeardAt: deadline - TIMERS.staleUpdateMs,
    });

    expect(status).toBe("lost_contact");
  });

  it("checks in instead when lost contact is off for this trip", () => {
    const status = atArrivalDeadline({
      now: deadline,
      status: "active",
      lostContactEnabled: false,
      lastHeardAt: arrival - 60 * 60_000,
    });

    expect(status).toBe("check_in");
  });

  it("leaves an ended journey alone", () => {
    const status = atArrivalDeadline({ now: deadline, status: "ended", lostContactEnabled: true, lastHeardAt: 0 });
    expect(status).toBe("ended");
  });
});

describe("likelyBatteryDied", () => {
  const update = { lat: 10.77, lng: 106.7, recordedAt: arrival, battery: 0.08 };
  it("is true at 10% or less", () => {
    expect(likelyBatteryDied(update)).toBe(true);
    expect(likelyBatteryDied({ ...update, battery: 0.64 })).toBe(false);
    expect(likelyBatteryDied(null)).toBe(false);
  });
});

describe("checkInDeadline", () => {
  it("gives the answer window plus one retry", () => {
    expect(checkInDeadline(1000)).toBe(1000 + TIMERS.checkInAnswerMs + TIMERS.checkInRetryMs);
  });
});

describe("alertStep", () => {
  const raisedAt = 1_000_000;

  it("stays with the circle while the timeout runs", () => {
    expect(alertStep({ raisedAt, openedAt: null }, raisedAt + TIMERS.circleOpenTimeoutMs - 1)).toBe("circle");
  });

  it("moves to the hotline when nobody opened the link in time", () => {
    expect(alertStep({ raisedAt, openedAt: null }, raisedAt + TIMERS.circleOpenTimeoutMs)).toBe("hotline");
  });

  it("stays with the circle once someone opened it", () => {
    expect(alertStep({ raisedAt, openedAt: raisedAt + 1 }, raisedAt + TIMERS.circleOpenTimeoutMs * 2)).toBe("circle");
  });
});
