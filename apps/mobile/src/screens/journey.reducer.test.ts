import type { JourneyView } from "@cage/shared";
import { describe, expect, it } from "vitest";
import { initialJourneyFlow, journeyReducer, type JourneyFlow } from "./journey.reducer";

const journey: JourneyView = {
  id: "j1",
  status: "active",
  destination: { name: "Nhà nghỉ Bờ Sông", lat: 10.7769, lng: 106.7009 },
  expectedArrivalAt: 1_000_000,
  locale: "vi",
  startedAt: 0,
  lastUpdate: null,
  nextDeadlineAt: 2_000_000,
  likelyBatteryDied: false,
};

const travelling = journeyReducer(initialJourneyFlow, { type: "started", journey, token: "jt_x" });

const type = (s: JourneyFlow, digits: string) =>
  [...digits].reduce((acc, digit) => journeyReducer(acc, { type: "digit", digit }), s);

describe("the journey on the phone", () => {
  it("starts travelling once the server answers", () => {
    expect(travelling).toMatchObject({ name: "travelling", token: "jt_x", code: null });
  });

  it("follows the server's status, and ends when the server says so", () => {
    const asked = journeyReducer(travelling, { type: "view", journey: { ...journey, status: "check_in" } });
    expect(asked).toMatchObject({ journey: { status: "check_in" } });
    expect(journeyReducer(asked, { type: "view", journey: { ...journey, status: "ended" } })).toEqual({ name: "ended" });
  });

  it("submits the code after four digits, and takes no more", () => {
    const s = type(journeyReducer(travelling, { type: "openCode", purpose: "answer" }), "25801");
    expect(s).toMatchObject({ code: { entry: "2580", submit: "2580" } });
  });

  it("clears the entry after a wrong code", () => {
    const s = type(journeyReducer(travelling, { type: "openCode", purpose: "answer" }), "1111");
    expect(journeyReducer(s, { type: "codeResult", result: "wrong_code" })).toMatchObject({
      code: { entry: "", submit: null, problem: "wrong_code" },
    });
  });

  it("shows the same thing for any accepted code: back on route, or ended", () => {
    const asked = journeyReducer(travelling, { type: "view", journey: { ...journey, status: "check_in" } });

    const answered = journeyReducer(type(journeyReducer(asked, { type: "openCode", purpose: "answer" }), "2591"), {
      type: "codeResult",
      result: "ok",
    });

    expect(answered).toMatchObject({ code: null, journey: { status: "active" } });

    const ending = type(journeyReducer(travelling, { type: "openCode", purpose: "end" }), "2591");
    expect(journeyReducer(ending, { type: "codeResult", result: "ok" })).toEqual({ name: "ended" });
  });

  it("starts over for a new trip", () => {
    expect(journeyReducer({ name: "ended" }, { type: "newTrip" })).toEqual(initialJourneyFlow);
  });
});
