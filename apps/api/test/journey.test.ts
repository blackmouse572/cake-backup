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
import { describe, expect, it, vi } from "vitest";
import type { JourneyObject } from "../src/journey-object";
import { JOURNEY_CODES } from "../src/constants";
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

const saveSettings = (cookie: string, body: { locale: string }) =>
  api("/me/settings", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("the language of a journey", () => {
  it("is the language saved in settings, which the circle's SMS and page follow", async () => {
    const cookie = await traveller();
    expect((await saveSettings(cookie, { locale: "en" })).status).toBe(204);

    const { journey } = await startJourney(cookie);

    expect(journey.locale).toBe("en");
  });

  it("is not overruled by the language an older app sends with the journey", async () => {
    const cookie = await traveller();
    await saveSettings(cookie, { locale: "en" });

    const res = await post("/journeys", { ...start, locale: "vi" }, { cookie });
    const { journey } = await readData(res, StartedJourney);

    expect(journey.locale).toBe("en");
  });
});

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

  expect(row).not.toBeNull();

  return row!.text;
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

/** What the circle's page does once it has loaded in a browser. Link previews never get this far. */
const markOpened = (token: string) => api(`/links/${token}/opened`, { method: "POST" });

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

    const lost = await env.DB.prepare("select count(*) as n from demo_messages where journey_id = ? and text like ?")
      .bind(journey.id, "%mất kết nối%")
      .first<{ n: number }>();

    expect(lost?.n).toBe(0);
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
    expect((await markOpened(second)).status).toBe(204);
    expect(await linkOpenedAt(first)).toBeNull();
    expect(await linkOpenedAt(second)).toBeGreaterThanOrEqual(before);
  });

  it("keeps the first time a contact opened their link", async () => {
    const { journey } = await startJourney();
    const token = await linkFor(journey.id);

    await markOpened(token);
    const first = await linkOpenedAt(token);
    expect(first).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await markOpened(token);
    expect(await linkOpenedAt(token)).toBe(first);
  });

  it("moves an unopened alert to the hotline step after the timeout", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await passDeadline(journey.id);
    const later = Date.now() + TIMERS.circleOpenTimeoutMs;
    expect((await stubFor(journey.id).circleView(later))?.alert?.step).toBe("hotline");

    await markOpened(await linkFor(journey.id));
    expect((await stubFor(journey.id).circleView(later))?.alert?.step).toBe("circle");
  });

  it("doesn't count fetching the page, as a link preview does, as opening it", async () => {
    const { journey } = await unanswered();
    const token = await linkFor(journey.id);
    await circleView(token);

    expect(await linkOpenedAt(token)).toBeNull();
    expect(await ladderAt(journey.id)).not.toBeNull();
  });

  it("answers marking an unknown or ended link as opened with 404", async () => {
    expect((await markOpened("nope")).status).toBe(404);

    const { journey, cookie } = await startJourney();
    const token = await linkFor(journey.id);
    expect((await enter(journey.id, "end", SAFE, cookie)).status).toBe(204);
    expect((await markOpened(token)).status).toBe(404);
  });
});

/** Enters wrong codes until the journey refuses every code. */
async function lockOut(id: string, action: "answer" | "end", cookie: string) {
  for (let i = 0; i < JOURNEY_CODES.wrongTries; i++) await enter(id, action, "1111", cookie);
}

/** Pretends the last wrong code was entered longer ago than the lock lasts. */
async function passLock(id: string) {
  await runInDurableObject(stubFor(id), async (_obj: JourneyObject, state) => {
    const s = await state.storage.get<{ wrongCodeAt: number }>("state");
    await state.storage.put("state", { ...s, wrongCodeAt: Date.now() - JOURNEY_CODES.lockMs - 1 });
  });
}

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

    for (let i = 1; i < JOURNEY_CODES.wrongTries; i++) {
      const res = await enter(journey.id, "answer", "1111", cookie);
      expect(res.status).toBe(403);
      expect(await readError(res)).toBe("wrong_code");
    }

    expect((await enter(journey.id, "answer", "1111", cookie)).status).toBe(429);
    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("no_answer");
  });

  it("refuses even the safe code once too many wrong codes were entered, and keeps the alert", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await lockOut(journey.id, "answer", cookie);

    const res = await enter(journey.id, "answer", SAFE, cookie);
    expect(res.status).toBe(429);
    expect(await readError(res)).toBe("too_many_tries");
    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("no_answer");
  });

  it("refuses the duress PIN on a check-in while locked, the same as the safe code", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await lockOut(journey.id, "answer", cookie);

    const res = await enter(journey.id, "answer", DURESS, cookie);
    expect(res.status).toBe(429);
    expect(await readError(res)).toBe("too_many_tries");
    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("no_answer");
  });

  it("takes the safe code again once the lock has passed", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await lockOut(journey.id, "answer", cookie);
    await passLock(journey.id);

    expect((await enter(journey.id, "answer", SAFE, cookie)).status).toBe(204);
    expect((await stubFor(journey.id).circleView())?.alert).toBeNull();
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

const sos = (id: string, cookie: string) => api(`/journeys/${id}/sos`, { method: "POST", headers: { cookie } });

const alertCount = (id: string) =>
  countRows("select count(*) as n from alert_events where journey_id = ?", id);

describe("SOS", () => {
  it("needs a session", async () => {
    const { journey } = await startJourney();
    const res = await api(`/journeys/${journey.id}/sos`, { method: "POST" });

    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });

  it("alerts the circle at once, with no code, and shows the phone the alert", async () => {
    const { journey, cookie } = await startJourney();
    const res = await sos(journey.id, cookie);

    expect(res.status).toBe(200);
    expect(await readData(res, JourneyView)).toMatchObject({ status: "alerted" });
    expect((await travellerView(journey.id, cookie)).status).toBe("alerted");
    expect(await circleView(await linkFor(journey.id))).toMatchObject({ status: "alerted", alert: { reason: "sos" } });

    await flush(journey.id);
    expect(await alertCount(journey.id)).toBe(1);
  });

  it("alerts in the middle of a check-in too", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });

    expect((await sos(journey.id, cookie)).status).toBe(200);

    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("sos");
  });

  it("tells the circle once, however often it is pressed", async () => {
    const { journey, cookie } = await startJourney();
    await sos(journey.id, cookie);
    await flush(journey.id);

    expect((await sos(journey.id, cookie)).status).toBe(200);
    await flush(journey.id);

    expect(await alertCount(journey.id)).toBe(1);
  });

  it("raises a lost-contact alert to an SOS", async () => {
    const { journey, cookie } = await startJourney();
    await runInDurableObject(stubFor(journey.id), async (_obj: JourneyObject, state) => {
      const s = await state.storage.get<{ lastHeardAt: number }>("state");
      await state.storage.put("state", { ...s, lastHeardAt: Date.now() - TIMERS.staleUpdateMs - 1 });
    });
    await passDeadline(journey.id);
    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("lost_contact");

    expect((await sos(journey.id, cookie)).status).toBe(200);

    expect(await stubFor(journey.id).circleView()).toMatchObject({ status: "alerted", alert: { reason: "sos" } });
  });

  it("leaves a duress alert as it is", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    await enter(journey.id, "answer", DURESS, cookie);

    expect((await sos(journey.id, cookie)).status).toBe(200);

    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("duress");
  });

  it("answers someone else's journey and an ended one with 404", async () => {
    const { journey, cookie } = await startJourney();
    const other = await traveller();

    expect((await sos(journey.id, other)).status).toBe(404);

    await endJourney(journey.id);

    const res = await sos(journey.id, cookie);
    expect(res.status).toBe(404);
    expect(await readError(res)).toBe("not_found");
  });

  it("is cleared by the safe code, like any other alert", async () => {
    const { journey, cookie } = await startJourney();
    await sos(journey.id, cookie);

    expect((await enter(journey.id, "answer", SAFE, cookie)).status).toBe(204);

    expect(await stubFor(journey.id).circleView()).toMatchObject({ status: "active", alert: null });
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

  it("refuses the safe code and the duress PIN alike once too many wrong codes were entered", async () => {
    const { journey, cookie } = await startJourney();
    await lockOut(journey.id, "end", cookie);

    for (const code of [SAFE, DURESS]) {
      const res = await enter(journey.id, "end", code, cookie);
      expect(res.status).toBe(429);
      expect(await readError(res)).toBe("too_many_tries");
    }

    expect((await travellerView(journey.id, cookie)).status).toBe("active");
    expect((await stubFor(journey.id).circleView())?.alert).toBeNull();
  });

  it("shares the lock between check-ins and ending the journey", async () => {
    const { journey, cookie } = await startJourney();
    await lockOut(journey.id, "end", cookie);
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });

    expect((await enter(journey.id, "answer", SAFE, cookie)).status).toBe(429);
  });

  it("ends with the safe code once the lock has passed", async () => {
    const { journey, cookie } = await startJourney();
    await lockOut(journey.id, "end", cookie);
    await passLock(journey.id);

    expect((await enter(journey.id, "end", SAFE, cookie)).status).toBe(204);
    expect((await travellerView(journey.id, cookie)).status).toBe("ended");
  });

  it("doesn't lock a journey that started before the lock and has no time for its wrong codes", async () => {
    const { journey, cookie } = await startJourney();

    await runInDurableObject(stubFor(journey.id), async (_obj: JourneyObject, state) => {
      const { wrongCodeAt: _, ...s } = (await state.storage.get<Record<string, number | null>>("state"))!;
      await state.storage.put("state", { ...s, wrongCodes: JOURNEY_CODES.wrongTries });
    });

    expect((await enter(journey.id, "end", SAFE, cookie)).status).toBe(204);
  });

  it("starts counting wrong codes again once the lock time passes without one", async () => {
    const { journey, cookie } = await startJourney();

    for (let i = 1; i < JOURNEY_CODES.wrongTries; i++) await enter(journey.id, "end", "1111", cookie);
    await passLock(journey.id);

    const res = await enter(journey.id, "end", "1111", cookie);
    expect(res.status).toBe(403);
    expect(await readError(res)).toBe("wrong_code");
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

/** Moves the alert's 10-minute ladder timer to now and runs the alarm. */
async function passLadder(id: string) {
  const stub = stubFor(id);
  await runInDurableObject(stub, async (_obj: JourneyObject, state) => {
    const s = await state.storage.get<{ ladderAt: number | null }>("state");
    expect(s?.ladderAt).not.toBeNull();
    await state.storage.put("state", { ...s, ladderAt: Date.now() - 1 });
    await state.storage.setAlarm(Date.now());
  });
  await runDurableObjectAlarm(stub);
}

const ladderAt = async (id: string) =>
  runInDurableObject(stubFor(id), async (_obj: JourneyObject, state) =>
    (await state.storage.get<{ ladderAt: number | null }>("state"))?.ladderAt ?? null,
  );

const alertSteps = async (id: string) =>
  (
    await env.DB.prepare("select reason, step from alert_events where journey_id = ? order by rowid").bind(id).all<{
      reason: string;
      step: string;
    }>()
  ).results;

const messagesSent = (id: string) => countRows("select count(*) as n from demo_messages where journey_id = ?", id);

/** A journey whose check-in went unanswered, with the alert sent to the circle. */
async function unanswered() {
  const started = await startJourney();
  await api(`/journeys/${started.journey.id}/check-in`, { method: "POST", headers: { cookie: started.cookie } });
  await passDeadline(started.journey.id);

  return started;
}

describe("the escalation ladder", () => {
  it("resends the alert and moves to the hotline when nobody opens it within 10 minutes", async () => {
    const { journey } = await unanswered();
    expect(await ladderAt(journey.id)).toBeGreaterThanOrEqual(Date.now() + 600_000 - 5_000);
    const before = await messagesSent(journey.id);

    await passLadder(journey.id);

    expect(await messagesSent(journey.id)).toBe(before + 2);
    expect(await alertSteps(journey.id)).toEqual([
      { reason: "no_answer", step: "circle" },
      { reason: "no_answer", step: "hotline" },
    ]);
    expect((await circleView(await linkFor(journey.id))).alert?.step).toBe("hotline");
  });

  it("stays at the hotline step once it has climbed, even after someone opens the link", async () => {
    const { journey } = await unanswered();
    await passLadder(journey.id);
    const link = await linkFor(journey.id);
    await markOpened(link);

    expect((await circleView(link)).alert?.step).toBe("hotline");
  });

  it("stops climbing once someone in the circle opens their link", async () => {
    const { journey } = await unanswered();
    expect(await ladderAt(journey.id)).not.toBeNull();
    await markOpened(await linkFor(journey.id));

    expect(await ladderAt(journey.id)).toBeNull();
    expect(await alertSteps(journey.id)).toEqual([{ reason: "no_answer", step: "circle" }]);
  });

  it("never climbs past the circle on lost contact", async () => {
    const { journey } = await startJourney();
    await goQuiet(journey.id);
    await passDeadline(journey.id);

    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("lost_contact");
    expect(await ladderAt(journey.id)).toBeNull();
  });

  it("stops the ladder when the safe code cancels the alert", async () => {
    const { journey, cookie } = await unanswered();
    expect((await enter(journey.id, "answer", SAFE, cookie)).status).toBe(204);

    expect(await ladderAt(journey.id)).toBeNull();
  });

  it("keeps the ladder going after the duress PIN cancels the alert on the phone", async () => {
    const { journey, cookie } = await unanswered();
    expect((await enter(journey.id, "answer", DURESS, cookie)).status).toBe(204);
    await flush(journey.id);
    await passLadder(journey.id);

    expect(await alertSteps(journey.id)).toContainEqual({ reason: "duress", step: "hotline" });
  });

  it("stays at the hotline step when a stronger reason comes after the climb", async () => {
    const { journey, cookie } = await unanswered();
    await passLadder(journey.id);
    expect((await enter(journey.id, "answer", DURESS, cookie)).status).toBe(204);
    await flush(journey.id);

    expect((await circleView(await linkFor(journey.id))).alert).toMatchObject({ reason: "duress", step: "hotline" });
    expect(await ladderAt(journey.id)).toBeNull();
  });

  it("sends only the strongest alert when two are raised before the circle is told", async () => {
    const { journey, cookie } = await startJourney();
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });

    for (let i = 0; i < JOURNEY_CODES.wrongTries; i++) await enter(journey.id, "answer", "1111", cookie);
    await passLock(journey.id);
    expect((await enter(journey.id, "answer", DURESS, cookie)).status).toBe(204);
    await flush(journey.id);

    expect(await alertSteps(journey.id)).toEqual([{ reason: "duress", step: "circle" }]);
  });

  it("turns an alert into a duress alert when the duress PIN comes after it, and tells the circle", async () => {
    const { journey, cookie } = await unanswered();
    const link = await linkFor(journey.id);
    expect((await enter(journey.id, "answer", DURESS, cookie)).status).toBe(204);
    await flush(journey.id);

    expect((await travellerView(journey.id, cookie)).status).toBe("active");
    expect((await circleView(link)).alert?.reason).toBe("duress");
    expect(await alertSteps(journey.id)).toEqual([
      { reason: "no_answer", step: "circle" },
      { reason: "duress", step: "circle" },
    ]);
  });

  it("doesn't send the circle a second alert for the same reason", async () => {
    const { journey, cookie } = await startJourney();
    expect((await enter(journey.id, "end", DURESS, cookie)).status).toBe(204);
    await flush(journey.id);
    await api(`/journeys/${journey.id}/check-in`, { method: "POST", headers: { cookie } });
    expect((await enter(journey.id, "answer", DURESS, cookie)).status).toBe(204);
    await flush(journey.id);

    expect(await alertSteps(journey.id)).toEqual([{ reason: "duress", step: "circle" }]);
  });

  it("tells the circle's page whether the traveller turned police on", async () => {
    const { journey, cookie } = await unanswered();
    const link = await linkFor(journey.id);
    expect((await circleView(link)).policeEnabled).toBe(false);

    const res = await api("/me/settings", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ policeEnabled: true }),
    });

    expect(res.status).toBe(204);
    expect((await circleView(link)).policeEnabled).toBe(true);
  });
});

describe("the duress PIN outside a journey's own screens", () => {
  it("alerts the circle when it is entered to change the codes mid-journey", async () => {
    const { journey, cookie } = await startJourney();
    const res = await send("/me/codes", "PUT", { safe: "1357", duress: "1368", current: DURESS }, { cookie });
    expect(res.status).toBe(204);

    await vi.waitFor(async () => expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("duress"));
    expect((await travellerView(journey.id, cookie)).status).toBe("active");
    await flush(journey.id);
    expect(await alertSteps(journey.id)).toEqual([{ reason: "duress", step: "circle" }]);
  });

  it("alerts the circle when it is entered to sign out mid-journey", async () => {
    const { journey, cookie } = await startJourney();
    const res = await send("/me/sign-out", "POST", { code: DURESS }, { cookie });
    expect(res.status).toBe(204);

    await vi.waitFor(async () => expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("duress"));
    await flush(journey.id);
    expect(await alertSteps(journey.id)).toEqual([{ reason: "duress", step: "circle" }]);
  });

  it("leaves ended journeys alone", async () => {
    const { journey, cookie } = await startJourney();
    expect((await enter(journey.id, "end", SAFE, cookie)).status).toBe(204);
    expect((await send("/me/codes", "PUT", { safe: "1357", duress: "1368", current: DURESS }, { cookie })).status).toBe(204);

    // The alert runs after the answer; give it the time it takes for an open journey (see the tests above).
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await stubFor(journey.id).circleView())?.alert).toBeNull();
  });
});

/** A journey that lost contact, with its alert sent. */
async function lostContact() {
  const started = await startJourney();
  expect((await sendUpdate(started.journey.id, started.journeyToken)).status).toBe(200);
  await goQuiet(started.journey.id);
  await passDeadline(started.journey.id);
  expect((await stubFor(started.journey.id).circleView())?.status).toBe("lost_contact");

  return started;
}

const lastMessage = async (id: string) =>
  (
    await env.DB.prepare("select text from demo_messages where journey_id = ? order by rowid desc limit 1")
      .bind(id)
      .first<{ text: string }>()
  )?.text;

describe("coming back after lost contact", () => {
  it("goes back to active and tells the circle when updates resume", async () => {
    const { journey, journeyToken, cookie } = await lostContact();
    const before = await messagesSent(journey.id);

    const res = await sendUpdate(journey.id, journeyToken);
    expect((await readData(res, JourneyView)).status).toBe("active");
    await flush(journey.id);

    expect(await stubFor(journey.id).circleView()).toMatchObject({ status: "active", alert: null });
    expect((await travellerView(journey.id, cookie)).status).toBe("active");
    expect(await messagesSent(journey.id)).toBe(before + 2);
    expect(await lastMessage(journey.id)).toContain("kết nối lại");

    const row = await env.DB.prepare("select status from journeys where id = ?").bind(journey.id).first<{ status: string }>();
    expect(row?.status).toBe("active");
  });

  it("tells the circle only once, however many updates follow", async () => {
    const { journey, journeyToken } = await lostContact();
    await sendUpdate(journey.id, journeyToken);
    await flush(journey.id);
    const after = await messagesSent(journey.id);

    await sendUpdate(journey.id, journeyToken);
    await flush(journey.id);

    expect(await messagesSent(journey.id)).toBe(after);
  });

  it("keeps watching: the server checks in again after the buffer", async () => {
    const { journey, journeyToken, cookie } = await lostContact();

    // Long past the expected arrival, so the next check comes a buffer from now, not from the arrival time.
    await runInDurableObject(stubFor(journey.id), async (_obj: JourneyObject, state) => {
      const st = await state.storage.get<{ expectedArrivalAt: number }>("state");
      await state.storage.put("state", { ...st, expectedArrivalAt: Date.now() - 2 * 60 * 60_000 });
    });

    const before = Date.now();
    const view = await readData(await sendUpdate(journey.id, journeyToken), JourneyView);

    expect(view.nextDeadlineAt).toBeGreaterThanOrEqual(before + TIMERS.arrivalBufferMs);
    await passDeadline(journey.id);
    expect((await travellerView(journey.id, cookie)).status).toBe("check_in");
  });

  it("leaves a stronger alert alone when updates resume", async () => {
    const { journey, journeyToken, cookie } = await lostContact();
    expect((await api(`/journeys/${journey.id}/sos`, { method: "POST", headers: { cookie } })).status).toBe(200);

    await sendUpdate(journey.id, journeyToken);

    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("sos");
  });

  it("looks the same on the phone after a duress PIN entered meanwhile, while the circle keeps the alert", async () => {
    const { journey, journeyToken, cookie } = await lostContact();
    expect((await send("/me/codes", "PUT", { safe: "1357", duress: "1368", current: DURESS }, { cookie })).status).toBe(204);
    await vi.waitFor(async () => expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("duress"));

    const view = await readData(await sendUpdate(journey.id, journeyToken), JourneyView);

    expect(view.status).toBe("active");
    expect(view.nextDeadlineAt).not.toBeNull();
    expect((await stubFor(journey.id).circleView())?.alert?.reason).toBe("duress");
  });

  it("doesn't come back on the demo while the dashboard drives the traveller", async () => {
    const { journey, journeyToken } = await lostContact();
    await runInDurableObject(stubFor(journey.id), async (_obj: JourneyObject, state) => {
      const st = await state.storage.get<{ simulated: boolean }>("state");
      await state.storage.put("state", { ...st, simulated: true });
    });

    await sendUpdate(journey.id, journeyToken);

    expect((await stubFor(journey.id).circleView())?.status).toBe("lost_contact");
  });
});
