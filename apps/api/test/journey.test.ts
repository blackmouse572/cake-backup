import {
  CircleJourneyView,
  JourneyView,
  Me,
  StartedJourney,
  TIMERS,
  type LocationUpdate,
  type StartJourney,
} from "@cage/shared";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { JourneyObject } from "../src/journey-object";
import { CHECK_IN } from "../src/constants";
import { hashToken } from "../src/utils";
import { api, newNumber, readData, readError, send, signIn } from "./helpers";

/** Request bodies, including deliberately incomplete ones for validation tests. */
type Body = Partial<StartJourney> | LocationUpdate;

const post = (path: string, body: Body, headers: Record<string, string> = {}) =>
  api(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const start = {
  destination: { name: "Nhà nghỉ Bờ Sông", lat: 10.7769, lng: 106.7009 },
  expectedArrivalAt: Date.now() + 22 * 60_000,
};

const reading = (battery = 0.64): LocationUpdate => ({ lat: 10.775, lng: 106.699, battery, recordedAt: Date.now() });

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const SAFE = "2580";

const DURESS = "2591";

/** A traveller with codes set and two contacts in the circle, ready to travel. */
async function traveller(): Promise<string> {
  const { cookie } = await signIn();
  expect((await send("/me/codes", "PUT", { safe: SAFE, duress: DURESS }, { cookie })).status).toBe(204);

  const contacts = [
    { name: "Mẹ", phone: newNumber() },
    { name: "Chị Hoa", phone: newNumber() },
  ];

  const res = await api("/circle", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contacts }),
  });

  expect(res.status).toBe(201);

  return cookie;
}

async function startJourney(cookie?: string): Promise<StartedJourney & { cookie: string }> {
  const session = cookie ?? (await traveller());
  const res = await post("/journeys", start, { cookie: session });
  expect(res.status).toBe(201);

  return { ...(await readData(res, StartedJourney)), cookie: session };
}

const sendUpdate = (id: string, token: string, update = reading()) =>
  post(`/journeys/${id}/updates`, update, bearer(token));

function stubFor(id: string) {
  return env.JOURNEY.get(env.JOURNEY.idFromName(id));
}

async function endJourney(id: string) {
  await runInDurableObject(stubFor(id), async (_obj: JourneyObject, state) => {
    const s = await state.storage.get<{ status: string }>("state");
    await state.storage.put("state", { ...s, status: "ended" });
  });
}

describe("journeys API", () => {
  it("answers health checks", async () => {
    expect(await (await api("/health")).json()).toEqual({ data: { ok: true } });
  });

  it("starts a journey for the signed-in traveller, with a journey token and the arrival timer", async () => {
    const cookie = await traveller();
    const me = await readData(await api("/me", { headers: { cookie } }), Me);
    const phoneNumber = me.phoneNumber;
    const { journey, journeyToken } = await startJourney(cookie);
    expect(journey.status).toBe("active");
    expect(journey.nextDeadlineAt).toBe(start.expectedArrivalAt + TIMERS.arrivalBufferMs);
    expect(journeyToken).toMatch(/^jt_[\w-]{43}$/);

    const row = await env.DB.prepare(
      "select j.destination_name, j.status, u.phone_number from journeys j join user u on u.id = j.user_id where j.id = ?",
    )
      .bind(journey.id)
      .first();

    expect(row).toEqual({ destination_name: "Nhà nghỉ Bờ Sông", status: "active", phone_number: phoneNumber });
  });

  it("never stores the journey token itself", async () => {
    const { journey, journeyToken } = await startJourney();

    await runInDurableObject(stubFor(journey.id), async (_obj: JourneyObject, state) => {
      expect(JSON.stringify(await state.storage.get("state"))).not.toContain(journeyToken);
    });
  });

  it("won't start a journey before the safe code is set", async () => {
    const { cookie } = await signIn();
    const res = await post("/journeys", start, { cookie });
    expect(res.status).toBe(409);
    expect(await readError(res)).toBe("no_codes");
  });

  it("rejects a journey without a destination", async () => {
    const cookie = await traveller();
    const res = await post("/journeys", { expectedArrivalAt: start.expectedArrivalAt }, { cookie });
    expect(res.status).toBe(400);
    expect(await readError(res)).toBe("invalid_request");
  });

  it("takes location updates with the journey token, without a session", async () => {
    const { journey, journeyToken } = await startJourney();

    const view = await readData(await sendUpdate(journey.id, journeyToken, reading(0.08)), JourneyView);
    expect(view.lastUpdate?.battery).toBe(0.08);
    expect(view.likelyBatteryDied).toBe(true);
  });

  it("shows the traveller their own journey", async () => {
    const { journey, cookie } = await startJourney();
    const res = await api(`/journeys/${journey.id}`, { headers: { cookie } });
    expect((await readData(res, JourneyView)).id).toBe(journey.id);
  });

  it("returns 404 for a journey that never started", async () => {
    const { cookie } = await signIn();
    const res = await api("/journeys/nope", { headers: { cookie } });
    expect(res.status).toBe(404);
    expect(await readError(res)).toBe("not_found");
  });

  it("answers an unknown route with the standard error body", async () => {
    const res = await api("/nowhere");
    expect(res.status).toBe(404);
    expect(await readError(res)).toBe("not_found");
  });
});

describe("who can use a journey", () => {
  it("needs a session to start a journey", async () => {
    const res = await post("/journeys", start);
    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });

  it("needs a session to read a journey", async () => {
    const { journey } = await startJourney();
    const res = await api(`/journeys/${journey.id}`);
    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });

  it("answers someone else's journey with 404, as if it didn't exist", async () => {
    const { journey } = await startJourney();
    const other = await signIn();
    const res = await api(`/journeys/${journey.id}`, { headers: { cookie: other.cookie } });
    expect(res.status).toBe(404);
    expect(await readError(res)).toBe("not_found");
  });

  it("refuses an update without a journey token", async () => {
    const { journey, cookie } = await startJourney();
    // A session is not enough either: updates only take the journey token.
    const res = await post(`/journeys/${journey.id}/updates`, reading(), { cookie });
    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });

  it("refuses a wrong token and another journey's token", async () => {
    const mine = await startJourney();
    const theirs = await startJourney();
    expect((await sendUpdate(mine.journey.id, `${mine.journeyToken}x`)).status).toBe(401);
    expect((await sendUpdate(mine.journey.id, theirs.journeyToken)).status).toBe(401);
    expect((await sendUpdate("nope", mine.journeyToken)).status).toBe(401);
  });

  it("stops taking the token once the journey has ended", async () => {
    const { journey, journeyToken } = await startJourney();
    expect((await sendUpdate(journey.id, journeyToken)).status).toBe(200);
    await endJourney(journey.id);

    const res = await sendUpdate(journey.id, journeyToken);
    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });
});

/** Moves the journey's next deadline to now and runs its alarm. */
async function passDeadline(id: string) {
  const stub = stubFor(id);
  await runInDurableObject(stub, async (_obj: JourneyObject, state) => {
    const s = await state.storage.get<{ deadlineAt: number | null }>("state");
    await state.storage.put("state", { ...s, deadlineAt: Date.now() - 1 });
    await state.storage.setAlarm(Date.now());
  });
  await runDurableObjectAlarm(stub);
}

/** Runs any pending alarm, so the outbox is sent and D1 is in step. */
async function flush(id: string) {
  await runDurableObjectAlarm(stubFor(id));
}

/** Pretends the phone went quiet long ago. */
async function goQuiet(id: string) {
  await runInDurableObject(stubFor(id), async (_obj: JourneyObject, state) => {
    const s = await state.storage.get<{ lastHeardAt: number }>("state");
    await state.storage.put("state", { ...s, lastHeardAt: Date.now() - TIMERS.staleUpdateMs - 1 });
  });
}

/** The circle's message when the phone went quiet after its last update at this battery level (the test env logs messages). */
async function lostContactMessage(battery: number): Promise<string> {
  const { journey, journeyToken } = await startJourney();
  expect((await sendUpdate(journey.id, journeyToken, reading(battery))).status).toBe(200);
  await goQuiet(journey.id);
  await passDeadline(journey.id);

  // rowid is the order of insertion: the start message comes first, the alert last.
  const row = await env.DB.prepare("select text from demo_messages where journey_id = ? order by rowid desc limit 1")
    .bind(journey.id)
    .first<{ text: string }>();

  return row?.text ?? "";
}

const travellerView = async (id: string, cookie: string) =>
  readData(await api(`/journeys/${id}`, { headers: { cookie } }), JourneyView);

const enter = (id: string, action: "answer" | "end", code: string, cookie: string) =>
  send(`/journeys/${id}/${action}`, "POST", { code }, { cookie });

/** The raw tokens of the links sent for a journey can't be read back, so tests mint their own row. */
async function linkFor(journeyId: string, contactIndex = 0): Promise<string> {
  const contact = await env.DB.prepare(
    "select c.id from circle_contacts c join journeys j on j.user_id = c.user_id where j.id = ? order by c.position limit 1 offset ?",
  )
    .bind(journeyId, contactIndex)
    .first<{ id: string }>();

  const token = `test-${crypto.randomUUID()}`;
  await env.DB.prepare("insert into circle_links (token_hash, journey_id, contact_id) values (?, ?, ?)")
    .bind(await hashToken(token), journeyId, contact!.id)
    .run();

  return token;
}

const openLink = (token: string) => api(`/links/${token}`);

const circleView = async (token: string) => readData(await openLink(token), CircleJourneyView);

const linkOpenedAt = async (token: string) =>
  (
    await env.DB.prepare("select opened_at as at from circle_links where token_hash = ?")
      .bind(await hashToken(token))
      .first<{ at: number | null }>()
  )?.at;

const countRows = async (sql: string, id: string) =>
  (await env.DB.prepare(sql).bind(id).first<{ n: number }>())!.n;

describe("journey timers", () => {
  it("alerts the circle with lost contact when the phone is silent at arrival plus buffer", async () => {
    const { journey } = await startJourney();
    const stub = stubFor(journey.id);
    await goQuiet(journey.id);
    await passDeadline(journey.id);
    expect((await stub.view())?.status).toBe("lost_contact");
    expect((await stub.circleView())?.alert?.reason).toBe("lost_contact");
  });

  it("tells the circle the phone probably died when it went quiet at low battery", async () => {
    const low = await lostContactMessage(0.03);
    const normal = await lostContactMessage(0.64);

    expect(low).toContain("có thể đã hết pin");
    expect(normal).toContain("mất kết nối");
    expect(normal).not.toContain("hết pin");
  });

  it("checks in instead of losing contact when the traveller turned lost contact off", async () => {
    const cookie = await traveller();
    const res = await post("/journeys", { ...start, lostContactEnabled: false }, { cookie });
    const { journey } = await readData(res, StartedJourney);
    await goQuiet(journey.id);
    await passDeadline(journey.id);

    expect((await stubFor(journey.id).view())?.status).toBe("check_in");
    expect((await stubFor(journey.id).circleView())?.alert).toBeNull();
  });

  it("checks in instead when updates are still arriving", async () => {
    const { journey, journeyToken } = await startJourney();
    const stub = stubFor(journey.id);
    expect((await sendUpdate(journey.id, journeyToken)).status).toBe(200);
    await passDeadline(journey.id);
    expect((await stub.view())?.status).toBe("check_in");
  });

  it("alerts the circle when a check-in goes unanswered", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await passDeadline(journey.id);
    expect((await travellerView(journey.id, cookie)).status).toBe("alerted");
    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("no_answer");
  });
});

describe("the safety circle's links", () => {
  it("sends every contact their own link when the journey starts", async () => {
    const { journey } = await startJourney();
    await flush(journey.id);
    expect(await countRows("select count(*) as n from circle_links where journey_id = ?", journey.id)).toBe(2);
  });

  it("shows the circle the journey and the traveller's name", async () => {
    const cookie = await traveller();
    expect((await send("/me/name", "PUT", { name: "Lan" }, { cookie })).status).toBe(204);
    const { journey } = await startJourney(cookie);
    const view = await circleView(await linkFor(journey.id));
    expect(view).toMatchObject({ id: journey.id, status: "active", travellerName: "Lan", alert: null });
  });

  it("falls back to the traveller's number when no name is set", async () => {
    const { journey } = await startJourney();
    expect((await circleView(await linkFor(journey.id))).travellerName).toMatch(/^09\d{2} \d{3} \d{3,4}$/);
  });

  it("answers an unknown, ended or revoked link with 404", async () => {
    expect((await openLink("nope")).status).toBe(404);

    const ended = await startJourney();
    const endedLink = await linkFor(ended.journey.id);
    expect((await enter(ended.journey.id, "end", SAFE, ended.cookie)).status).toBe(204);
    expect((await openLink(endedLink)).status).toBe(404);

    const revoked = await startJourney();
    const revokedLink = await linkFor(revoked.journey.id);

    const contact = await env.DB.prepare(
      "select c.id from circle_contacts c join journeys j on j.user_id = c.user_id where j.id = ? order by c.position",
    )
      .bind(revoked.journey.id)
      .first<{ id: string }>();

    await api(`/circle/${contact!.id}`, { method: "DELETE", headers: { cookie: revoked.cookie } });
    expect((await openLink(revokedLink)).status).toBe(404);
  });

  it("answers a changed, cut short or extended link token with 404, and leaves other journeys' links working", async () => {
    const { journey } = await startJourney();
    const other = await startJourney();
    const token = await linkFor(journey.id);
    expect((await openLink(token)).status).toBe(200);

    const changed = `${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`;
    expect((await openLink(changed)).status).toBe(404);
    expect((await openLink(token.slice(0, -1))).status).toBe(404);
    expect((await openLink(`${token}x`)).status).toBe(404);
    expect((await openLink(await linkFor(other.journey.id))).status).toBe(200);
  });

  it("notes which contact opened their link, and when", async () => {
    const { journey } = await startJourney();
    const first = await linkFor(journey.id, 0);
    const second = await linkFor(journey.id, 1);

    expect(await linkOpenedAt(first)).toBeNull();
    expect(await linkOpenedAt(second)).toBeNull();

    const before = Date.now();
    await circleView(second);
    expect(await linkOpenedAt(first)).toBeNull();
    expect(await linkOpenedAt(second)).toBeGreaterThanOrEqual(before);
  });

  it("keeps the first time a contact opened their link", async () => {
    const { journey } = await startJourney();
    const token = await linkFor(journey.id);

    await circleView(token);
    const first = await linkOpenedAt(token);
    expect(first).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await circleView(token);
    expect(await linkOpenedAt(token)).toBe(first);
  });

  it("moves an unopened alert to the hotline step after the timeout", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await passDeadline(journey.id);
    const later = Date.now() + TIMERS.circleOpenTimeoutMs;
    expect((await stubFor(journey.id).circleView(later))?.alert?.step).toBe("hotline");

    await circleView(await linkFor(journey.id));
    expect((await stubFor(journey.id).circleView(later))?.alert?.step).toBe("circle");
  });
});

describe("check-ins and the duress PIN", () => {
  it("lets the phone ask for a check-in", async () => {
    const { journey, cookie } = await startJourney();
    const res = await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    expect((await readData(res, JourneyView)).status).toBe("check_in");
  });

  it("carries on after the safe code", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    expect((await enter(journey.id, "answer", SAFE, cookie)).status).toBe(204);
    expect((await travellerView(journey.id, cookie)).status).toBe("active");
  });

  it("answers the duress PIN like the safe code, and alerts the circle", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    const res = await enter(journey.id, "answer", DURESS, cookie);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    const mine = await travellerView(journey.id, cookie);
    expect(mine.status).toBe("active");

    const theirs = await circleView(await linkFor(journey.id));
    expect(theirs.status).toBe("alerted");
    expect(theirs.alert?.reason).toBe("duress");

    await flush(journey.id);
    expect(await countRows("select count(*) as n from alert_events where journey_id = ?", journey.id)).toBe(1);
  });

  it("treats too many wrong codes on a check-in as no answer", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });

    for (let i = 1; i < CHECK_IN.wrongTries; i++) {
      const res = await enter(journey.id, "answer", "1111", cookie);
      expect(res.status).toBe(403);
      expect(await readError(res)).toBe("wrong_code");
    }

    expect((await enter(journey.id, "answer", "1111", cookie)).status).toBe(429);
    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("no_answer");
  });

  it("clears an alert with the safe code and tells the circle", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await passDeadline(journey.id);
    expect((await enter(journey.id, "answer", SAFE, cookie)).status).toBe(204);
    const view = await stubFor(journey.id).circleView();
    expect(view).toMatchObject({ status: "active", alert: null });
  });
});

describe("ending a journey", () => {
  it("ends with the safe code, drops the location and kills the token", async () => {
    const { journey, journeyToken, cookie } = await startJourney();
    await sendUpdate(journey.id, journeyToken);
    expect((await enter(journey.id, "end", SAFE, cookie)).status).toBe(204);

    const view = await travellerView(journey.id, cookie);
    expect(view.status).toBe("ended");
    expect(view.lastUpdate).toBeNull();
    expect((await sendUpdate(journey.id, journeyToken)).status).toBe(401);

    await flush(journey.id);
    const row = await env.DB.prepare("select status, ended_at from journeys where id = ?").bind(journey.id).first();
    expect(row?.status).toBe("ended");
    expect(row?.ended_at).not.toBeNull();
  });

  it("drops the circle's links once the safe code ends the journey", async () => {
    const { journey, cookie } = await startJourney();
    await flush(journey.id);
    expect(await countRows("select count(*) as n from circle_links where journey_id = ?", journey.id)).toBe(2);

    expect((await enter(journey.id, "end", SAFE, cookie)).status).toBe(204);
    await flush(journey.id);
    expect(await countRows("select count(*) as n from circle_links where journey_id = ?", journey.id)).toBe(0);
  });

  it("keeps the circle's links after the duress PIN, so they can still follow the alert", async () => {
    const { journey, cookie } = await startJourney();
    await flush(journey.id);
    expect((await enter(journey.id, "end", DURESS, cookie)).status).toBe(204);
    await flush(journey.id);
    expect(
      await countRows("select count(*) as n from circle_links where journey_id = ?", journey.id),
    ).toBeGreaterThanOrEqual(2);
  });

  it("refuses a wrong code", async () => {
    const { journey, cookie } = await startJourney();
    const res = await enter(journey.id, "end", "1111", cookie);
    expect(res.status).toBe(403);
    expect((await travellerView(journey.id, cookie)).status).toBe("active");
  });

  it("shows the phone an ended journey after the duress PIN, while the circle sees the alert", async () => {
    const { journey, cookie } = await startJourney();
    const link = await linkFor(journey.id);
    expect((await enter(journey.id, "end", DURESS, cookie)).status).toBe(204);
    expect((await travellerView(journey.id, cookie)).status).toBe("ended");

    const theirs = await circleView(link);
    expect(theirs.status).toBe("alerted");
    expect(theirs.alert?.reason).toBe("duress");
  });

  it("answers someone else's journey with 404", async () => {
    const { journey } = await startJourney();
    const other = await traveller();
    expect((await enter(journey.id, "end", SAFE, other)).status).toBe(404);
  });
});
