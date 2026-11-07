import { Me } from "@cage/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, readData, readError, send, signIn } from "./helpers";

type Settings = { locale?: string; policeEnabled?: boolean; callerName?: string; callVibrateOnly?: boolean };

const save = (cookie: string, body: Settings) =>
  api("/me/settings", {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const me = async (cookie: string) => readData(await api("/me", { headers: { cookie } }), Me);

describe("settings (screen 20)", () => {
  it("needs a session", async () => {
    const res = await save("", { locale: "en" });
    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
  });

  it("starts in Vietnamese with the police switched off", async () => {
    const { cookie } = await signIn();

    expect(await me(cookie)).toMatchObject({ locale: "vi", policeEnabled: false });
  });

  it("saves the language, and /me says so", async () => {
    const { cookie } = await signIn();

    expect((await save(cookie, { locale: "en" })).status).toBe(204);
    expect((await me(cookie)).locale).toBe("en");
  });

  it("saves the police switch, and /me says so", async () => {
    const { cookie } = await signIn();

    expect((await save(cookie, { policeEnabled: true })).status).toBe(204);
    expect((await me(cookie)).policeEnabled).toBe(true);
  });

  it("changes only what was sent", async () => {
    const { cookie } = await signIn();
    await save(cookie, { locale: "en", policeEnabled: true });

    await save(cookie, { locale: "vi" });

    expect(await me(cookie)).toMatchObject({ locale: "vi", policeEnabled: true });
  });

  it("keeps the settings when the codes are set afterwards", async () => {
    const { cookie } = await signIn();
    await save(cookie, { locale: "en", policeEnabled: true });

    expect((await send("/me/codes", "PUT", { safe: "2580", duress: "2591" }, { cookie })).status).toBe(204);

    expect(await me(cookie)).toMatchObject({ locale: "en", policeEnabled: true, hasCodes: true });
  });

  it("refuses a body that changes nothing", async () => {
    const { cookie } = await signIn();
    const res = await save(cookie, {});

    expect(res.status).toBe(400);
    expect(await readError(res)).toBe("invalid_request");
  });

  it("refuses a language the app does not have", async () => {
    const { cookie } = await signIn();
    const res = await save(cookie, { locale: "fr" });

    expect(res.status).toBe(400);
    expect(await readError(res)).toBe("invalid_request");
  });

  it("saves the check-in call's caller and ring (screen 14)", async () => {
    const { cookie } = await signIn();
    expect(await me(cookie)).toMatchObject({ callerName: "", callVibrateOnly: false });

    expect((await save(cookie, { callerName: "  Công ty ", callVibrateOnly: true })).status).toBe(204);
    expect(await me(cookie)).toMatchObject({ callerName: "Công ty", callVibrateOnly: true });

    // Empty goes back to the default for the language.
    await save(cookie, { callerName: "" });
    expect((await me(cookie)).callerName).toBe("");
  });

  it("refuses a caller name longer than a phone shows", async () => {
    const { cookie } = await signIn();
    expect((await save(cookie, { callerName: "x".repeat(31) })).status).toBe(400);
  });
});

const token = (n: number) => ({ token: `ExponentPushToken[test-${n}]`, platform: "android" });

const tokensOf = async (phoneNumber: string) =>
  (
    await env.DB.prepare("select count(*) as n from push_tokens t join user u on u.id = t.user_id where u.phone_number = ?")
      .bind(phoneNumber)
      .first<{ n: number }>()
  )?.n;

describe("push tokens (#20)", () => {
  it("saves the phone's token once, however often the app sends it", async () => {
    const { cookie, phoneNumber } = await signIn();
    expect((await send("/me/push-token", "PUT", token(1), { cookie })).status).toBe(204);
    expect((await send("/me/push-token", "PUT", token(1), { cookie })).status).toBe(204);
    expect(await tokensOf(phoneNumber)).toBe(1);
  });

  it("refuses anything that isn't an Expo push token", async () => {
    const { cookie } = await signIn();
    const res = await send("/me/push-token", "PUT", { token: "abc", platform: "android" }, { cookie });
    expect(res.status).toBe(400);
  });

  it("forgets the phones on sign-out", async () => {
    const { cookie, phoneNumber } = await signIn();
    await send("/me/push-token", "PUT", token(2), { cookie });
    expect((await send("/me/sign-out", "POST", {}, { cookie })).status).toBe(204);
    expect(await tokensOf(phoneNumber)).toBe(0);
  });
});
