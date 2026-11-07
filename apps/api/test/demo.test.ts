import { CircleJourneyView, DemoJourneyView, DemoMessage, DemoTraveller, JourneyView, StartedJourney } from "@cage/shared";
import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { app } from "../src/app";
import { api, newNumber, readData, readError, send, signIn } from "./helpers";

const KEY = { "x-demo-key": "test-demo-key" };

const SAFE = "2580";

const DURESS = "2591";

/** A call to a demo route with the demo key. */
const demo = (path: string, method = "GET", body?: Record<string, string | number>) =>
  api(`/demo${path}`, {
    method,
    headers: { ...KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

/** Calls a demo route from one IP, for the lockout. */
const fromIp = (ip: string, key: string) => api("/demo/journeys", { headers: { "x-demo-key": key, "cf-connecting-ip": ip } });

/** A real traveller, signed in on their phone, who starts a trip with one contact in the circle. */
async function travellerOnTrip(): Promise<StartedJourney & { cookie: string; linkToken: string }> {
  const { cookie } = await signIn();
  expect((await send("/me/codes", "PUT", { safe: SAFE, duress: DURESS }, { cookie })).status).toBe(204);
  expect((await send("/me/name", "PUT", { name: "Jaden" }, { cookie })).status).toBe(204);

  const circle = await api("/circle", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contacts: [{ name: "Mẹ", phone: newNumber() }] }),
  });

  expect(circle.status).toBe(201);

  const res = await api("/journeys", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      destination: { name: "Ga Sài Gòn", lat: 10.782, lng: 106.677 },
      expectedArrivalAt: Date.now() + 30 * 60_000,
    }),
  });

  expect(res.status).toBe(201);
  const started = await readData(res, StartedJourney);
  // The start message carries the circle's link; it's sent from the alarm.
  await flush(started.journey.id);
  const row = await env.DB.prepare("select text from demo_messages where journey_id = ?").bind(started.journey.id).first<{ text: string }>();
  const linkToken = /\/t\/([\w-]+)/.exec(row?.text ?? "")?.[1] ?? "";

  return { ...started, cookie, linkToken };
}

/** Runs the journey's pending alarm, which sends (here: logs) the circle's messages. */
const flush = (id: string) => runDurableObjectAlarm(env.JOURNEY.get(env.JOURNEY.idFromName(id)));

const view = async (id: string) => readData(await demo(`/journeys/${id}`), DemoJourneyView);

describe("the hackathon demo dashboard", () => {
  it("doesn't exist without DEMO_MODE", async () => {
    const res = await app.request("/demo/journeys", { headers: KEY }, { ...env, DEMO_MODE: undefined });
    expect(res.status).toBe(404);
  });

  it("doesn't exist when messages would really be sent", async () => {
    const res = await app.request("/demo/journeys", { headers: KEY }, { ...env, MESSAGE_SENDER: "sms" });
    expect(res.status).toBe(404);
  });

  it("doesn't exist without a demo key", async () => {
    const res = await app.request("/demo/journeys", { headers: KEY }, { ...env, DEMO_KEY: undefined });
    expect(res.status).toBe(404);
  });

  it("locks a caller out after five wrong keys, even with the right one", async () => {
    for (let i = 0; i < 4; i += 1) expect(await readError(await fromIp("203.0.113.7", "wrong"))).toBe("wrong_demo_key");
    expect(await readError(await fromIp("203.0.113.7", "wrong"))).toBe("demo_locked");
    expect((await fromIp("203.0.113.7", "test-demo-key")).status).toBe(429);
    expect((await fromIp("203.0.113.8", "test-demo-key")).status).toBe(200);
  });

  it("lists the traveller's own trip, started on their phone", async () => {
    const trip = await travellerOnTrip();
    const list = await readData(await demo("/journeys"), z.array(DemoTraveller));
    const mine = list.find((t) => t.journeyId === trip.journey.id);
    expect(mine).toMatchObject({ name: "Jaden", destination: "Ga Sài Gòn", status: "active", circleSize: 1 });

    const trip2 = await view(trip.journey.id);
    expect(trip2.circle).toEqual([{ name: "Mẹ", phone: expect.stringMatching(/^0\d{3} ••• \d{3}$/) }]);
  });

  it("shows only the accounts on DEMO_ACCOUNTS when it is set", async () => {
    const trip = await travellerOnTrip();
    const only = { ...env, DEMO_ACCOUNTS: "+84000000001" };

    const list = await readData(await app.request("/demo/journeys", { headers: KEY }, only), z.array(DemoTraveller));
    expect(list.map((t) => t.journeyId)).not.toContain(trip.journey.id);
    expect((await app.request(`/demo/journeys/${trip.journey.id}/check-in`, { method: "POST", headers: KEY }, only)).status).toBe(404);
  });

  it("moves the traveller on a fake route, ignoring the phone's GPS from then on", async () => {
    const trip = await travellerOnTrip();
    const id = trip.journey.id;
    expect((await demo(`/journeys/${id}/move`, "POST", { lat: 10.78, lng: 106.68, battery: 0.6 })).status).toBe(204);

    const fromPhone = { lat: 1, lng: 1, battery: 0.5, recordedAt: Date.now() };

    const res = await api(`/journeys/${id}/updates`, {
      method: "POST",
      headers: { authorization: `Bearer ${trip.journeyToken}`, "content-type": "application/json" },
      body: JSON.stringify(fromPhone),
    });

    expect(res.status).toBe(200);
    expect((await view(id)).lastUpdate).toMatchObject({ lat: 10.78, lng: 106.68 });
    expect((await view(id)).simulated).toBe(true);
  });

  it("sets the states: check-in, duress (hidden from the phone), safe again", async () => {
    const trip = await travellerOnTrip();
    const id = trip.journey.id;

    expect((await demo(`/journeys/${id}/check-in`, "POST")).status).toBe(204);
    expect((await view(id)).status).toBe("check_in");

    // Codes are only typed on the phone, with the traveller's own session.
    const onPhone = (code: string) => send(`/journeys/${id}/answer`, "POST", { code }, { cookie: trip.cookie });
    expect((await onPhone(DURESS)).status).toBe(204);
    expect(await view(id)).toMatchObject({ status: "alerted", shownStatus: "active", alert: { reason: "duress" } });

    const phone = await api(`/journeys/${id}`, { headers: { cookie: trip.cookie } });
    expect((await readData(phone, JourneyView)).status).toBe("active");

    expect((await onPhone(SAFE)).status).toBe(204);
    expect((await view(id)).status).toBe("active");
  });

  it("raises no-answer and lost-contact alerts the circle sees", async () => {
    const quiet = await travellerOnTrip();
    expect((await demo(`/journeys/${quiet.journey.id}/lose-contact`, "POST")).status).toBe(204);
    const circle = await readData(await api(`/links/${quiet.linkToken}`), CircleJourneyView);
    expect(circle.alert?.reason).toBe("lost_contact");

    const silent = await travellerOnTrip();
    await demo(`/journeys/${silent.journey.id}/check-in`, "POST");
    await demo(`/journeys/${silent.journey.id}/skip`, "POST");
    await flush(silent.journey.id);
    expect((await view(silent.journey.id)).alert?.reason).toBe("no_answer");
  });

  it("logs every message it would have sent, by the contact's name, and sends none", async () => {
    const trip = await travellerOnTrip();
    const id = trip.journey.id;
    await demo(`/journeys/${id}/lose-contact`, "POST");
    await flush(id);

    const log = await readData(await demo(`/journeys/${id}/log`), z.array(DemoMessage));
    expect(log.map((m) => m.to)).toEqual(["Mẹ", "Mẹ"]);
    expect(log[1]?.text).toContain("Jaden");
  });

  it("never takes a code", async () => {
    const trip = await travellerOnTrip();
    expect((await demo(`/journeys/${trip.journey.id}/answer`, "POST", { code: SAFE })).status).toBe(404);
  });

  it("deletes the trip on start again, keeping the account and circle", async () => {
    const trip = await travellerOnTrip();
    const id = trip.journey.id;

    expect((await demo(`/journeys/${id}`, "DELETE")).status).toBe(204);
    expect((await demo(`/journeys/${id}`)).status).toBe(404);
    expect((await api(`/links/${trip.linkToken}`)).status).toBe(404);
    expect((await api("/circle", { headers: { cookie: trip.cookie } })).status).toBe(200);
  });
});
