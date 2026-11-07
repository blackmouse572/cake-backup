import { createDb } from "@cage/db";
import { Me, StartedJourney } from "@cage/shared";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { checkCode, codesService } from "../src/services/codes.service";
import { hashCode } from "../src/utils";
import { CHANGE_CODES, RESET_CODES } from "../src/constants";
import type { JourneyObject } from "../src/journey-object";
import { api, readData, readError, send, signIn, type JsonBody } from "./helpers";

const pepper = "test-pepper";
const noJourneys = { hasOpen: async () => false, alertDuress: async () => {} };

describe("checkCode", () => {
  it("tells the safe code, the duress PIN and a wrong code apart", async () => {
    const hashes = { safe: await hashCode(pepper, "2580"), duress: await hashCode(pepper, "2591") };
    expect(await checkCode(pepper, hashes, "2580")).toBe("safe");
    expect(await checkCode(pepper, hashes, "2591")).toBe("duress");
    expect(await checkCode(pepper, hashes, "1111")).toBe("wrong");
  });

  it("never matches without the pepper or without stored codes", async () => {
    const hashes = { safe: await hashCode(pepper, "2580"), duress: await hashCode(pepper, "2591") };
    expect(await checkCode("another-pepper", hashes, "2580")).toBe("wrong");
    expect(await checkCode(pepper, { safe: null, duress: null }, "2580")).toBe("wrong");
  });

  it("salts every hash, so equal codes don't look equal", async () => {
    expect(await hashCode(pepper, "2580")).not.toBe(await hashCode(pepper, "2580"));
  });
});

const setCodes = (cookie: string, body: JsonBody) => send("/me/codes", "PUT", body, { cookie });

describe("setting the safe code and duress PIN", () => {
  it("sets both codes the first time without a current code", async () => {
    const { cookie } = await signIn();
    expect((await setCodes(cookie, { safe: "2580", duress: "2591" })).status).toBe(204);
    const me = await readData(await api("/me", { headers: { cookie } }), Me);
    expect(me.hasCodes).toBe(true);
  });

  it("stores only hashes", async () => {
    const { cookie } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });
    const rows = await env.DB.prepare("select safe_code_hash, duress_code_hash from traveller_settings").all();

    for (const row of rows.results) expect(JSON.stringify(row)).not.toMatch(/2580|2591/);
  });

  it("refuses codes that break the rules", async () => {
    const { cookie } = await signIn();
    expect(await readError(await setCodes(cookie, { safe: "1234", duress: "2591" }))).toBe("too_simple");
    expect(await readError(await setCodes(cookie, { safe: "2580", duress: "2581" }))).toBe("too_close");
    const bad = await setCodes(cookie, { safe: "25", duress: "2591" });
    expect(bad.status).toBe(400);
    expect(await readError(bad)).toBe("invalid_request");
  });

  it("needs the current safe code to change them", async () => {
    const { cookie } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });
    expect(await readError(await setCodes(cookie, { safe: "1357", duress: "1368" }))).toBe("current_required");
    expect((await setCodes(cookie, { safe: "1357", duress: "1368", current: "0000" })).status).toBe(403);
    expect((await setCodes(cookie, { safe: "1357", duress: "1368", current: "2580" })).status).toBe(204);
  });

  it("answers the duress PIN exactly like the safe code but keeps the old codes", async () => {
    const { cookie, phoneNumber } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });

    const res = await setCodes(cookie, { safe: "1357", duress: "1368", current: "2591" });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    const userId = await env.DB.prepare("select id from user where phone_number = ?")
      .bind(phoneNumber)
      .first<string>("id");

    const codes = codesService(createDb(env.DB), pepper, noJourneys);
    expect(await codes.check(userId!, "2580")).toBe("safe");
    expect(await codes.check(userId!, "1357")).toBe("wrong");
  });

  it(`stops guessing after ${CHANGE_CODES.tries} wrong codes`, async () => {
    const { cookie } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });

    for (let i = 0; i < CHANGE_CODES.tries; i++) {
      expect((await setCodes(cookie, { safe: "1357", duress: "1368", current: "0000" })).status).toBe(403);
    }

    // Even the right code waits now.
    expect((await setCodes(cookie, { safe: "1357", duress: "1368", current: "2580" })).status).toBe(429);
  });
});

const resetCodes = (cookie: string, body: JsonBody) => send("/me/codes/reset", "PUT", body, { cookie });

async function userIdOf(phoneNumber: string): Promise<string> {
  const id = await env.DB.prepare("select id from user where phone_number = ?").bind(phoneNumber).first<string>("id");
  expect(id).not.toBeNull();

  return id!;
}

/** Moves every session of a number back in time, as if it was signed in long ago. */
async function ageSessions(phoneNumber: string): Promise<void> {
  const old = Date.now() - RESET_CODES.freshSessionMs - 60_000;
  await env.DB.prepare("update session set created_at = ? where user_id = ?")
    .bind(old, await userIdOf(phoneNumber))
    .run();
}

async function startJourney(cookie: string): Promise<string> {
  const body = {
    destination: { name: "Nhà nghỉ Bờ Sông", lat: 10.7769, lng: 106.7009 },
    expectedArrivalAt: Date.now() + 22 * 60_000,
  };

  const res = await api("/journeys", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

  expect(res.status).toBe(201);

  return (await readData(res, StartedJourney)).journey.id;
}

async function endJourney(id: string): Promise<void> {
  await runInDurableObject(env.JOURNEY.get(env.JOURNEY.idFromName(id)), async (_obj: JourneyObject, state) => {
    const s = await state.storage.get<{ status: string }>("state");
    await state.storage.put("state", { ...s, status: "ended", shownStatus: "ended" });
  });
}

describe("forgot code (Quên mã?)", () => {
  it("replaces both codes without the current one, right after a sign-in code", async () => {
    const { cookie, phoneNumber } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });

    expect((await resetCodes(cookie, { safe: "1357", duress: "1368" })).status).toBe(204);

    const codes = codesService(createDb(env.DB), pepper, noJourneys);
    const userId = await userIdOf(phoneNumber);
    expect(await codes.check(userId, "1357")).toBe("safe");
    expect(await codes.check(userId, "1368")).toBe("duress");
    expect(await codes.check(userId, "2580")).toBe("wrong");
    expect(await codes.check(userId, "2591")).toBe("wrong");
  });

  it("needs a fresh sign-in code when the session is old", async () => {
    const { cookie, phoneNumber } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });
    await ageSessions(phoneNumber);

    const res = await resetCodes(cookie, { safe: "1357", duress: "1368" });
    expect(res.status).toBe(403);
    expect(await readError(res)).toBe("reverify_required");

    // A new code to the same phone makes a fresh session, and that one may reset.
    const fresh = await signIn(phoneNumber);
    expect((await resetCodes(fresh.cookie, { safe: "1357", duress: "1368" })).status).toBe(204);
  });

  it("is refused while a journey is open, and works once it has ended", async () => {
    const { cookie } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });
    const journeyId = await startJourney(cookie);

    const res = await resetCodes(cookie, { safe: "1357", duress: "1368" });
    expect(res.status).toBe(409);
    expect(await readError(res)).toBe("journey_open");

    await endJourney(journeyId);
    expect((await resetCodes(cookie, { safe: "1357", duress: "1368" })).status).toBe(204);
  });

  it("checks the same rules as setting codes", async () => {
    const { cookie } = await signIn();
    expect(await readError(await resetCodes(cookie, { safe: "1234", duress: "2591" }))).toBe("too_simple");
    expect(await readError(await resetCodes(cookie, { safe: "2580", duress: "2581" }))).toBe("too_close");
  });

  it("clears the wrong-try lock", async () => {
    const { cookie } = await signIn();
    await setCodes(cookie, { safe: "2580", duress: "2591" });

    for (let i = 0; i < CHANGE_CODES.tries; i++) {
      await setCodes(cookie, { safe: "1357", duress: "1368", current: "0000" });
    }

    expect((await resetCodes(cookie, { safe: "1357", duress: "1368" })).status).toBe(204);
    expect((await setCodes(cookie, { safe: "4826", duress: "4837", current: "1357" })).status).toBe(204);
  });

  it("needs a session", async () => {
    expect((await send("/me/codes/reset", "PUT", { safe: "1357", duress: "1368" })).status).toBe(401);
  });
});
