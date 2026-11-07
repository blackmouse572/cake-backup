import { Me } from "@cage/shared";
import { describe, expect, it } from "vitest";
import { api, readData, readError, send, signIn } from "./helpers";

type Settings = { locale?: string; policeEnabled?: boolean };

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
});
