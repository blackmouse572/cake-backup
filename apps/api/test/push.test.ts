import { createDb } from "@cage/db";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EXPO_PUSH_URL, expoPushSender } from "../src/push-sender";
import { checkInCallsService } from "../src/services/check-in-calls.service";
import { fakeFetch } from "./fake-providers";
import { api, send, signIn } from "./helpers";

const ExpoBody = z.array(
  z.object({
    to: z.string(),
    title: z.string(),
    body: z.string(),
    sound: z.string().nullable(),
    channelId: z.string(),
    ttl: z.number(),
    data: z.object({ kind: z.string(), journeyId: z.string(), call: z.number() }),
  }),
);

const userIdOf = async (phoneNumber: string) =>
  (await env.DB.prepare("select id from user where phone_number = ?").bind(phoneNumber).first<{ id: string }>())!.id;

async function travellerWithPhone(token: string) {
  const { cookie, phoneNumber } = await signIn();
  await send("/me/push-token", "PUT", { token, platform: "ios" }, { cookie });

  return { cookie, userId: await userIdOf(phoneNumber) };
}

describe("check-in call pushes", () => {
  it("looks like a call from the chosen caller and never names Cage", async () => {
    const token = `ExponentPushToken[ring-${crypto.randomUUID()}]`;
    const { cookie, userId } = await travellerWithPhone(token);
    await send("/me/settings", "PUT", { callerName: "Công ty" }, { cookie });
    const expo = fakeFetch({ [EXPO_PUSH_URL]: [{ json: { data: [{ status: "ok", id: "t1" }] } }] });

    await checkInCallsService(createDb(env.DB), expoPushSender(expo.fetch)).ring({ id: "j1", userId, locale: "vi" }, 2);

    const [push] = ExpoBody.parse(await expo.requests[0]!.json());
    expect(push).toMatchObject({ to: token, title: "Công ty", body: "Cuộc gọi đến", sound: "default", channelId: "call-ring", ttl: 60 });
    expect(push?.data).toEqual({ kind: "check_in_call", journeyId: "j1", call: 2 });
    expect(JSON.stringify(push)).not.toMatch(/cage/i);
  });

  it("calls from Mẹ by default, and vibrates only when asked", async () => {
    const token = `ExponentPushToken[quiet-${crypto.randomUUID()}]`;
    const { cookie, userId } = await travellerWithPhone(token);
    await api("/me/settings", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ callVibrateOnly: true }),
    });
    const expo = fakeFetch({ [EXPO_PUSH_URL]: [{ json: { data: [{ status: "ok", id: "t1" }] } }] });

    await checkInCallsService(createDb(env.DB), expoPushSender(expo.fetch)).ring({ id: "j1", userId, locale: "vi" }, 1);

    const [push] = ExpoBody.parse(await expo.requests[0]!.json());
    expect(push).toMatchObject({ title: "Mẹ", sound: null, channelId: "call-vibrate" });
  });

  it("forgets a token Expo says no longer reaches a phone", async () => {
    const token = `ExponentPushToken[gone-${crypto.randomUUID()}]`;
    const { userId } = await travellerWithPhone(token);

    const expo = fakeFetch({
      [EXPO_PUSH_URL]: [{ json: { data: [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }] } }],
    });

    await checkInCallsService(createDb(env.DB), expoPushSender(expo.fetch)).ring({ id: "j1", userId, locale: "vi" }, 1);

    const left = await env.DB.prepare("select count(*) as n from push_tokens where token = ?").bind(token).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("sends nothing to a traveller with no phone registered", async () => {
    const expo = fakeFetch({});

    await checkInCallsService(createDb(env.DB), expoPushSender(expo.fetch)).ring({ id: "j1", userId: "nobody", locale: "vi" }, 1);
    expect(expo.requests).toHaveLength(0);
  });
});
