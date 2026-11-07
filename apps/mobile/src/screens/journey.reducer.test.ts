import { TIMERS, type JourneyView } from "@cage/shared";
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
  checkIn: null,
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

  it("sends an SOS, and says so when it didn't go", () => {
    expect(travelling).toMatchObject({ sos: "idle" });

    const sending = journeyReducer(travelling, { type: "sosSending" });
    expect(sending).toMatchObject({ sos: "sending" });
    expect(journeyReducer(sending, { type: "sosSending" })).toBe(sending);

    const failed = journeyReducer(sending, { type: "sosFailed" });
    expect(failed).toMatchObject({ sos: "failed" });
    expect(journeyReducer(failed, { type: "sosSending" })).toMatchObject({ sos: "sending" });
  });

  it("shows the alert once the server says it went out, and the SOS is no longer pending", () => {
    const sending = journeyReducer(travelling, { type: "sosSending" });

    expect(journeyReducer(sending, { type: "view", journey: { ...journey, status: "alerted" } })).toMatchObject({
      sos: "idle",
      journey: { status: "alerted" },
    });
  });

  it("does not call a late failure an error when the alert is already showing", () => {
    const alerted = journeyReducer(journeyReducer(travelling, { type: "sosSending" }), {
      type: "view",
      journey: { ...journey, status: "alerted" },
    });

    expect(journeyReducer(alerted, { type: "sosFailed" })).toMatchObject({ sos: "idle" });
  });

  it("stops waiting once the server has answered, even when the phone still shows a quiet screen", () => {
    // After a duress PIN the phone keeps showing "active", so the answer is not "alerted".
    const sending = journeyReducer(travelling, { type: "sosSending" });
    const answered = journeyReducer(sending, { type: "view", journey });

    expect(journeyReducer(answered, { type: "sosSent" })).toMatchObject({ sos: "idle", journey: { status: "active" } });
  });

  it("ignores an SOS before a journey is running", () => {
    expect(journeyReducer(initialJourneyFlow, { type: "sosSending" })).toBe(initialJourneyFlow);
  });

  it("starts over for a new trip", () => {
    expect(journeyReducer({ name: "ended" }, { type: "newTrip" })).toEqual(initialJourneyFlow);
  });
});

describe("the check-in call on the phone (#20)", () => {
  const askedAt = 5_000_000;
  const checkIn = { ...journey, status: "check_in" as const, checkIn: { reason: "off_route" as const, askedAt } };
  const asked = journeyReducer(travelling, { type: "view", journey: checkIn });
  const secondCall = askedAt + TIMERS.checkInRetryMs;

  it("shows screen 03, not a call, while the app is open for the first call", () => {
    expect(journeyReducer(asked, { type: "clock", now: askedAt + 1_000 })).toMatchObject({ call: null });
  });

  it("rings on screen for the second call", () => {
    expect(journeyReducer(asked, { type: "clock", now: secondCall })).toMatchObject({ call: { phase: "ringing", call: 2 } });
  });

  it("rings when the traveller opens the call from the lock screen, and answering asks for the code", () => {
    const ringing = journeyReducer(asked, { type: "ring", call: 1 });
    const talking = journeyReducer(ringing, { type: "answerCall", now: 42 });
    expect(talking).toMatchObject({ call: { phase: "talking", call: 1, startedAt: 42 }, code: { purpose: "answer", entry: "" } });

    const done = journeyReducer(type(talking, "2580"), { type: "codeResult", result: "ok" });
    expect(done).toMatchObject({ call: null, code: null, journey: { status: "active", checkIn: null } });
  });

  it("keeps the call open for another try after a wrong code", () => {
    const talking = journeyReducer(journeyReducer(asked, { type: "ring", call: 1 }), { type: "answerCall", now: 42 });
    const wrong = journeyReducer(type(talking, "1111"), { type: "codeResult", result: "wrong_code" });
    expect(wrong).toMatchObject({ call: { phase: "talking" }, code: { entry: "", problem: "wrong_code" } });
  });

  it("doesn't ring the same call again once declined", () => {
    const ringing = journeyReducer(asked, { type: "clock", now: secondCall });
    const declined = journeyReducer(ringing, { type: "hangUp" });
    expect(declined).toMatchObject({ call: null, hungUp: { askedAt, call: 2 } });
    expect(journeyReducer(declined, { type: "clock", now: secondCall + 1_000 })).toMatchObject({ call: null });
  });

  it("ends the call when the check-in is over on the server", () => {
    const ringing = journeyReducer(asked, { type: "ring", call: 1 });
    const alerted = journeyReducer(ringing, { type: "view", journey: { ...journey, status: "alerted" } });
    expect(alerted).toMatchObject({ call: null, code: null });
  });
});
