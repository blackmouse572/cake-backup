import { CHANGE_CODES } from "../src/constants";
import { describe, expect, it, vi } from "vitest";
import { api, readError, send, signIn } from "./helpers";

const SAFE = "2580";

const DURESS = "2591";

/** A traveller who has set both codes. */
async function traveller(): Promise<string> {
  const { cookie } = await signIn();
  expect((await send("/me/codes", "PUT", { safe: SAFE, duress: DURESS }, { cookie })).status).toBe(204);

  return cookie;
}

const signOut = (cookie: string, body: { code?: string }) =>
  api("/me/sign-out", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const meStatus = async (cookie: string) => (await api("/me", { headers: { cookie } })).status;

describe("signing out needs the safe code", () => {
  it("needs a session", async () => {
    const res = await signOut("", { code: SAFE });

    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });

  it("ends the session when the safe code is right", async () => {
    const cookie = await traveller();

    expect((await signOut(cookie, { code: SAFE })).status).toBe(204);

    await vi.waitFor(async () => expect(await meStatus(cookie)).toBe(401));
  });

  it("answers the duress PIN exactly like the safe code, and keeps the session", async () => {
    const cookie = await traveller();
    const safe = await signOut(await traveller(), { code: SAFE });

    const duress = await signOut(cookie, { code: DURESS });

    expect(duress.status).toBe(safe.status);
    expect(await duress.text()).toBe(await safe.text());
    expect(await meStatus(cookie)).toBe(200);
  });

  it("refuses a wrong code and keeps the session", async () => {
    const cookie = await traveller();
    const res = await signOut(cookie, { code: "1357" });

    expect(res.status).toBe(403);
    expect(await readError(res)).toBe("wrong_code");
    expect(await meStatus(cookie)).toBe(200);
  });

  it("asks for the code when codes are set and none was sent", async () => {
    const cookie = await traveller();
    const res = await signOut(cookie, {});

    expect(res.status).toBe(400);
    expect(await readError(res)).toBe("current_required");
    expect(await meStatus(cookie)).toBe(200);
  });

  it(`stops guessing after ${CHANGE_CODES.tries} wrong codes, even for the right one`, async () => {
    const cookie = await traveller();

    for (let i = 0; i < CHANGE_CODES.tries; i++) expect((await signOut(cookie, { code: "1357" })).status).toBe(403);

    const res = await signOut(cookie, { code: SAFE });

    expect(res.status).toBe(429);
    expect(await readError(res)).toBe("too_many_tries");
    expect(await meStatus(cookie)).toBe(200);
  });

  it("lets a traveller with no codes yet sign out, since nothing is there to protect", async () => {
    const { cookie } = await signIn();

    expect((await signOut(cookie, {})).status).toBe(204);

    await vi.waitFor(async () => expect(await meStatus(cookie)).toBe(401));
  });
});

describe("the routes that end a session without a code", () => {
  it.each(["/auth/sign-out", "/auth/revoke-session", "/auth/revoke-sessions", "/auth/revoke-other-sessions"])(
    "%s answers 404 and leaves the session alone",
    async (path) => {
      const cookie = await traveller();
      const res = await api(path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });

      expect(res.status).toBe(404);
      expect(await readError(res)).toBe("not_found");
      expect(await meStatus(cookie)).toBe(200);
    },
  );
});
