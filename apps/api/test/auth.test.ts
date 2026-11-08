import { Me } from "@cage/shared";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SIGN_IN_CODE } from "../src/constants";
import { api, newNumber, pendingCode, readData, readError, send, signIn } from "./helpers";

describe("sign-in with a phone number", () => {
  it("registers a new number and returns a session", async () => {
    const { cookie, phoneNumber } = await signIn();
    const res = await api("/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const me = await readData(res, Me);
    expect(me).toEqual({
      phoneNumber,
      name: "",
      hasCodes: false,
      circleSize: 0,
      locale: "vi",
      policeEnabled: false,
      callerName: "",
      callVibrateOnly: false,
    });
  });

  it("signs an existing number back into the same account", async () => {
    const phoneNumber = newNumber();
    await signIn(phoneNumber);
    await signIn(phoneNumber);

    const users = await env.DB.prepare("select count(*) as n from user where phone_number = ?")
      .bind(phoneNumber)
      .first<{ n: number }>();

    expect(users?.n).toBe(1);
  });

  it("refuses a wrong code", async () => {
    const phoneNumber = newNumber();
    await send("/auth/phone-number/send-otp", "POST", { phoneNumber });
    const code = await pendingCode(phoneNumber);
    const wrong = code === "000000" ? "111111" : "000000";
    const res = await send("/auth/phone-number/verify", "POST", { phoneNumber, code: wrong });
    expect(res.status).toBe(400);
  });

  it("refuses something that is not a phone number", async () => {
    const res = await send("/auth/phone-number/send-otp", "POST", { phoneNumber: "0912" });
    expect(res.status).toBe(400);
  });

  it(`sends at most ${SIGN_IN_CODE.perNumberPerHour} codes to a number per hour`, async () => {
    const phoneNumber = newNumber();

    for (let i = 0; i < SIGN_IN_CODE.perNumberPerHour; i++) {
      // A different caller each time, so only the per-number limit applies.
      const res = await send("/auth/phone-number/send-otp", "POST", { phoneNumber }, { "cf-connecting-ip": `10.0.0.${i}` });
      expect(res.status).toBe(200);
    }

    const res = await send("/auth/phone-number/send-otp", "POST", { phoneNumber }, { "cf-connecting-ip": "10.0.1.1" });
    expect(res.status).toBe(429);
  });

  it("keeps account routes closed without a session", async () => {
    const res = await api("/me");
    expect(res.status).toBe(401);
    expect(await readError(res)).toBe("unauthorized");
    expect((await send("/me/codes", "PUT", { safe: "2580", duress: "2591" })).status).toBe(401);
  });
});

describe("only the sign-in routes of Better Auth are open", () => {
  it.each([
    ["POST", "/auth/sign-in/phone-number"],
    ["POST", "/auth/phone-number/request-password-reset"],
    ["POST", "/auth/phone-number/reset-password"],
    ["POST", "/auth/update-user"],
    ["POST", "/auth/change-password"],
    ["POST", "/auth/delete-user"],
    ["GET", "/auth/list-sessions"],
    ["GET", "/auth/phone-number/verify"],
    ["POST", "/auth/phone-number/verify/"],
  ])("%s %s answers 404", async (method, path) => {
    const { cookie } = await signIn();

    const res = await api(path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ name: "x", phoneNumber: newNumber() }),
    });

    expect(res.status).toBe(404);
    expect(await readError(res)).toBe("not_found");
  });

  it("keeps the session readable", async () => {
    const { cookie } = await signIn();
    const res = await api("/auth/get-session", { headers: { cookie } });

    expect(res.status).toBe(200);
  });

  it("never moves a signed-in account to another number", async () => {
    const { cookie, phoneNumber } = await signIn();
    const other = newNumber();
    const ip = { "cf-connecting-ip": "10.9.9.9" };
    expect((await send("/auth/phone-number/send-otp", "POST", { phoneNumber: other }, ip)).status).toBe(200);
    const code = await pendingCode(other);

    const res = await api("/auth/phone-number/verify", {
      method: "POST",
      // The app sends its origin like this (Better Auth's Expo plugin).
      headers: { cookie, "content-type": "application/json", "expo-origin": "cage://", ...ip },
      body: JSON.stringify({ phoneNumber: other, code, updatePhoneNumber: true }),
    });

    expect(res.status).toBe(400);
    const me = await readData(await api("/me", { headers: { cookie } }), Me);
    expect(me.phoneNumber).toBe(phoneNumber);
  });
});
