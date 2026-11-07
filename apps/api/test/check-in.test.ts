import { encodePolyline, JourneyView, StartedJourney, TIMERS, type LocationUpdate, type StartJourney } from "@cage/shared";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { JourneyObject } from "../src/journey-object";
import { api, newNumber, readData, send, signIn } from "./helpers";

const SAFE = "2580";

const DURESS = "2591";

// A straight road north along Nguyễn Huệ, District 1, ending at the destination.
const road = [
  { lat: 10.77, lng: 106.703 },
  { lat: 10.78, lng: 106.703 },
];

const start: StartJourney = {
  destination: { name: "Nhà nghỉ Bờ Sông", lat: 10.78, lng: 106.703 },
  expectedArrivalAt: Date.now() + 40 * 60_000,
  route: encodePolyline(road),
  lostContactEnabled: true,
  locale: "vi",
};

/** About 500 m east of the road. */
const OFF = { lat: 10.774, lng: 106.7076 };

const ON = { lat: 10.774, lng: 106.703 };

const reading = (at: { lat: number; lng: number }): LocationUpdate => ({ ...at, battery: 0.8, recordedAt: Date.now() });

interface Stored {
  status: string;
  callAt: number | null;
  callsRung: number;
  route: string | null;
  checkIn: { reason: string; askedAt: number } | null;
  watch: { offRouteSince: number | null; still: { lat: number; lng: number; since: number } | null };
  deadlineAt: number | null;
}

const stub = (id: string) => env.JOURNEY.get(env.JOURNEY.idFromName(id));

const stored = (id: string) =>
  runInDurableObject(stub(id), async (_obj: JourneyObject, state) => (await state.storage.get<Stored>("state"))!);

/** Changes the stored journey, as if time had passed. */
async function rewrite(id: string, change: (s: Stored) => Partial<Stored>) {
  await runInDurableObject(stub(id), async (_obj: JourneyObject, state) => {
    const s = (await state.storage.get<Stored>("state"))!;
    await state.storage.put("state", { ...s, ...change(s) });
  });
}

async function onTrip(): Promise<StartedJourney & { cookie: string }> {
  const { cookie } = await signIn();
  await send("/me/codes", "PUT", { safe: SAFE, duress: DURESS }, { cookie });

  await api("/circle", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contacts: [{ name: "Mẹ", phone: newNumber() }] }),
  });

  const res = await api("/journeys", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(start) });
  expect(res.status).toBe(201);

  return { ...(await readData(res, StartedJourney)), cookie };
}

const update = (trip: StartedJourney, at: { lat: number; lng: number }) =>
  api(`/journeys/${trip.journey.id}/updates`, {
    method: "POST",
    headers: { authorization: `Bearer ${trip.journeyToken}`, "content-type": "application/json" },
    body: JSON.stringify(reading(at)),
  });

const view = async (trip: StartedJourney & { cookie: string }) =>
  readData(await api(`/journeys/${trip.journey.id}`, { headers: { cookie: trip.cookie } }), JourneyView);

/** The traveller left the road two minutes ago and is still off it. */
async function offRoute(trip: StartedJourney) {
  await update(trip, OFF);
  await rewrite(trip.journey.id, (s) => ({ watch: { ...s.watch, offRouteSince: Date.now() - TIMERS.offRouteForMs } }));
  await update(trip, OFF);
}

/** Moves the next call to now and runs the alarm. */
async function ringNow(id: string) {
  await rewrite(id, () => ({ callAt: Date.now() - 1 }));
  await runInDurableObject(stub(id), (_obj: JourneyObject, state) => state.storage.setAlarm(Date.now()));
  await runDurableObjectAlarm(stub(id));
}

describe("the route rules on the server (#19)", () => {
  it("keeps quiet while the traveller is on the road", async () => {
    const trip = await onTrip();
    await update(trip, ON);
    await update(trip, ON);
    expect((await view(trip)).status).toBe("active");
  });

  it("asks once the traveller has been off the road for two minutes", async () => {
    const trip = await onTrip();
    await update(trip, OFF);
    expect((await view(trip)).status).toBe("active");

    await offRoute(trip);
    const asked = await view(trip);
    expect(asked.status).toBe("check_in");
    expect(asked.checkIn?.reason).toBe("off_route");
  });

  it("asks when the traveller has stood still too long away from the destination", async () => {
    const trip = await onTrip();
    await update(trip, ON);
    await rewrite(trip.journey.id, (s) => ({ watch: { ...s.watch, still: { ...ON, since: Date.now() - TIMERS.stoppedTooLongMs } } }));
    await update(trip, ON);
    expect((await view(trip)).checkIn?.reason).toBe("stopped");
  });

  it("stops holding the traveller to the road once they say they're fine", async () => {
    const trip = await onTrip();
    await offRoute(trip);
    expect((await send(`/journeys/${trip.journey.id}/answer`, "POST", { code: SAFE }, { cookie: trip.cookie })).status).toBe(204);

    const after = await stored(trip.journey.id);
    expect(after).toMatchObject({ status: "active", route: null, checkIn: null, callAt: null });
    await offRoute(trip);
    expect((await view(trip)).status).toBe("active");
  });
});

describe("check-in calls (#20)", () => {
  it("rings at once, again after the retry time, then alerts", async () => {
    const trip = await onTrip();
    await offRoute(trip);
    const asked = await stored(trip.journey.id);
    expect(asked.callAt).toBe(asked.checkIn!.askedAt);

    await runDurableObjectAlarm(stub(trip.journey.id));
    const first = await stored(trip.journey.id);
    expect(first.callsRung).toBe(1);
    expect(first.callAt).toBe(asked.checkIn!.askedAt + TIMERS.checkInRetryMs);

    await ringNow(trip.journey.id);
    const second = await stored(trip.journey.id);
    expect(second.callsRung).toBe(2);
    expect(second.callAt).toBeNull();
    expect(second.deadlineAt).toBe(asked.checkIn!.askedAt + TIMERS.checkInAnswerMs + TIMERS.checkInRetryMs);

    await rewrite(trip.journey.id, () => ({ deadlineAt: Date.now() - 1 }));
    await runInDurableObject(stub(trip.journey.id), (_obj: JourneyObject, state) => state.storage.setAlarm(Date.now()));
    await runDurableObjectAlarm(stub(trip.journey.id));
    expect((await stored(trip.journey.id)).status).toBe("alerted");
  });

  it("stops ringing after the duress PIN, which looks the same as the safe code", async () => {
    const trip = await onTrip();
    await offRoute(trip);
    expect((await send(`/journeys/${trip.journey.id}/answer`, "POST", { code: DURESS }, { cookie: trip.cookie })).status).toBe(204);

    const s = await stored(trip.journey.id);
    expect(s).toMatchObject({ status: "alerted", callAt: null, checkIn: null });
    expect((await view(trip)).status).toBe("active");
  });

  it("after the duress PIN, still asks and rings the phone as after the safe code", async () => {
    const trip = await onTrip();
    await api(`/journeys/${trip.journey.id}/check-in`, { method: "POST", headers: { cookie: trip.cookie } });
    await send(`/journeys/${trip.journey.id}/answer`, "POST", { code: DURESS }, { cookie: trip.cookie });

    await update(trip, ON);
    await rewrite(trip.journey.id, (s) => ({ watch: { ...s.watch, still: { ...ON, since: Date.now() - TIMERS.stoppedTooLongMs } } }));
    await update(trip, ON);

    expect((await view(trip)).checkIn?.reason).toBe("stopped");
    const s = await stored(trip.journey.id);
    expect(s.status).toBe("alerted");
    expect(s.callAt).not.toBeNull();
  });

  it("tells the phone why and when it asked, only during the check-in", async () => {
    const trip = await onTrip();
    expect((await view(trip)).checkIn).toBeNull();
    await api(`/journeys/${trip.journey.id}/check-in`, { method: "POST", headers: { cookie: trip.cookie } });
    expect((await view(trip)).checkIn).toMatchObject({ reason: "off_route" });
  });
});
