import { createDb } from "@cage/db";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAuth } from "../src/auth";
import { ZALO_ZNS } from "../src/constants";
import { messageSenderFor } from "../src/message-sender";
import { fallbackSender } from "../src/senders/fallback.sender";
import { twilioSmsSender } from "../src/senders/twilio-sms.sender";
import { zaloZnsSender } from "../src/senders/zalo-zns.sender";
import { signInCodesService } from "../src/services/sign-in-codes.service";
import { zaloTokensService } from "../src/services/zalo-tokens.service";
import type { ChannelResult, ChannelSender, Channel, MessageSender, Outgoing } from "../src/types";
import {
  fakeFetch,
  fakeLog,
  twilioSent,
  TWILIO_SEND,
  zaloSent,
  zaloToken,
  ZALO_SEND,
  ZALO_TOKEN,
} from "./fake-providers";
import { newNumber } from "./helpers";

const db = createDb(env.DB);

const zaloApp = { appId: "app-1", appSecret: "app-secret", seedRefreshToken: "refresh-0" };

const outgoing = (to = "+84901234567", locale: Outgoing["locale"] = "vi"): Outgoing => ({
  to,
  locale,
  message: { kind: "code", code: "482913" },
});

const ZnsBody = z.object({
  phone: z.string(),
  template_id: z.string(),
  template_data: z.record(z.string(), z.string()),
  tracking_id: z.string(),
  mode: z.literal("development").optional(),
});

/** A channel that answers with a fixed result and counts its calls. */
function fixedChannel(channel: Channel, result: ChannelResult) {
  const calls: Outgoing[] = [];

  const sender: ChannelSender = {
    channel,
    async send(o) {
      calls.push(o);

      return result;
    },
  };

  return { sender, calls };
}

beforeEach(async () => {
  await env.DB.prepare("delete from provider_tokens").run();
});

describe("fallback between channels", () => {
  it("sends by SMS when Zalo fails, and logs both tries without the number or the code", async () => {
    const zalo = fixedChannel("zalo", { status: "failed", reason: "no_zalo_account" });
    const sms = fixedChannel("sms", { status: "sent", providerId: "SM1" });
    const { entries, log } = fakeLog();

    expect(await fallbackSender([zalo.sender, sms.sender], log).send(outgoing())).toBe("sent");
    expect(entries.map((e) => [e.channel, e.status])).toEqual([
      ["zalo", "failed"],
      ["sms", "sent"],
    ]);

    const logged = JSON.stringify(entries);
    expect(logged).not.toContain("84901234567");
    expect(logged).not.toContain("482913");
  });

  it("stops at the first channel that sends", async () => {
    const zalo = fixedChannel("zalo", { status: "sent", providerId: "z1" });
    const sms = fixedChannel("sms", { status: "sent", providerId: "SM1" });

    expect(await fallbackSender([zalo.sender, sms.sender], fakeLog().log).send(outgoing())).toBe("sent");
    expect(sms.calls).toHaveLength(0);
  });

  it("tries the preferred channel first", async () => {
    const zalo = fixedChannel("zalo", { status: "sent", providerId: "z1" });
    const sms = fixedChannel("sms", { status: "sent", providerId: "SM1" });

    await fallbackSender([zalo.sender, sms.sender], fakeLog().log).send({ ...outgoing(), prefer: "sms" });
    expect(zalo.calls).toHaveLength(0);
    expect(sms.calls).toHaveLength(1);
  });

  it("reports not_sent when every channel fails, including one that throws", async () => {
    const zalo = fixedChannel("zalo", { status: "failed", reason: "no_token" });

    const broken: ChannelSender = {
      channel: "sms",
      send: () => Promise.reject(new Error("boom")),
    };

    const { entries, log } = fakeLog();

    expect(await fallbackSender([zalo.sender, broken], log).send(outgoing())).toBe("not_sent");
    expect(entries.at(-1)).toMatchObject({ channel: "sms", status: "failed", reason: "error" });
  });
});

describe("Zalo ZNS", () => {
  const config = { codeTemplates: { vi: "tpl-vi" }, development: false };

  it("sends the code template to the number without the plus", async () => {
    const { fetch, requests } = fakeFetch({ [ZALO_TOKEN]: [zaloToken(1)], [ZALO_SEND]: [zaloSent] });
    const sender = zaloZnsSender(config, zaloTokensService(db, zaloApp, fetch), fetch);

    expect(await sender.send(outgoing())).toEqual({ status: "sent", providerId: "zalo-msg-1" });

    const send = requests.find((r) => r.url === ZALO_SEND)!;
    expect(send.headers.get("access_token")).toBe("access-1");
    const body = ZnsBody.parse(await send.json());
    expect(body).toMatchObject({ phone: "84901234567", template_id: "tpl-vi", template_data: { [ZALO_ZNS.codeParam]: "482913" } });
    expect(body.mode).toBeUndefined();
  });

  it("uses development mode when it is turned on", async () => {
    const { fetch, requests } = fakeFetch({ [ZALO_TOKEN]: [zaloToken(1)], [ZALO_SEND]: [zaloSent] });
    const sender = zaloZnsSender({ ...config, development: true }, zaloTokensService(db, zaloApp, fetch), fetch);

    await sender.send(outgoing());
    expect(ZnsBody.parse(await requests.at(-1)!.json()).mode).toBe("development");
  });

  it("skips a language without a template and a number outside Vietnam", async () => {
    const { fetch, requests } = fakeFetch({});
    const sender = zaloZnsSender(config, zaloTokensService(db, zaloApp, fetch), fetch);

    expect(await sender.send(outgoing("+84901234567", "en"))).toEqual({ status: "skipped", reason: "no_template" });
    expect(await sender.send(outgoing("+4915112345678"))).toEqual({ status: "skipped", reason: "not_vietnamese_number" });
    expect(requests).toHaveLength(0);
  });

  it("refreshes the token once when Zalo says it is invalid", async () => {
    const { fetch, requests } = fakeFetch({
      [ZALO_TOKEN]: [zaloToken(1), zaloToken(2)],
      [ZALO_SEND]: [{ json: { error: ZALO_ZNS.errors.invalidToken, message: "Access token is invalid" } }, zaloSent],
    });

    const sender = zaloZnsSender(config, zaloTokensService(db, zaloApp, fetch), fetch);

    expect((await sender.send(outgoing())).status).toBe("sent");
    expect(requests.filter((r) => r.url === ZALO_SEND).map((r) => r.headers.get("access_token"))).toEqual([
      "access-1",
      "access-2",
    ]);
  });

  it("fails on a number without Zalo, and when Zalo doesn't answer", async () => {
    const { fetch } = fakeFetch({
      [ZALO_TOKEN]: [zaloToken(1)],
      [ZALO_SEND]: [{ json: { error: ZALO_ZNS.errors.noZaloAccount, message: "User not existed" } }, "down"],
    });

    const sender = zaloZnsSender(config, zaloTokensService(db, zaloApp, fetch), fetch);

    expect(await sender.send(outgoing())).toEqual({ status: "failed", reason: "no_zalo_account" });
    expect(await sender.send(outgoing())).toEqual({ status: "failed", reason: "no_answer" });
  });
});

describe("Zalo OA tokens", () => {
  it("starts from the seed refresh token, then rotates the pair in D1", async () => {
    const { fetch, requests } = fakeFetch({ [ZALO_TOKEN]: [zaloToken(1), zaloToken(2)] });
    let now = Date.UTC(2026, 10, 4);
    const tokens = zaloTokensService(db, zaloApp, fetch, () => now);

    expect(await tokens.accessToken()).toBe("access-1");
    expect(await tokens.accessToken()).toBe("access-1");
    expect(requests).toHaveLength(1);

    const first = await requests[0]!.formData();
    expect(first.get("refresh_token")).toBe("refresh-0");
    expect(first.get("app_id")).toBe("app-1");
    expect(requests[0]!.headers.get("secret_key")).toBe("app-secret");

    // Close to the 25-hour expiry, it refreshes with the stored refresh token.
    now += 90_000 * 1000 - ZALO_ZNS.refreshMarginMs + 1;
    expect(await tokens.accessToken()).toBe("access-2");
    expect((await requests[1]!.formData()).get("refresh_token")).toBe("refresh-1");
  });

  it("gives no token when Zalo refuses the refresh", async () => {
    const { fetch } = fakeFetch({ [ZALO_TOKEN]: [{ json: { error: -14014, error_name: "Invalid refresh token" } }] });

    expect(await zaloTokensService(db, zaloApp, fetch).accessToken()).toBeNull();
  });
});

describe("Twilio SMS", () => {
  const config = { accountSid: "AC1", authToken: "token", from: "Xac thuc" };

  it("sends the code text in the traveller's language", async () => {
    const { fetch, requests } = fakeFetch({ [TWILIO_SEND]: [twilioSent] });

    expect(await twilioSmsSender(config, fetch).send(outgoing("+84901234567", "en"))).toEqual({
      status: "sent",
      providerId: "SM123",
    });

    const request = requests[0]!;
    expect(request.url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(request.headers.get("authorization")).toBe(`Basic ${btoa("AC1:token")}`);
    const form = await request.formData();
    expect(form.get("To")).toBe("+84901234567");
    expect(form.get("From")).toBe("Xac thuc");
    expect(form.get("Body")).toContain("482913");
    expect(form.get("Body")).not.toContain("Cage");
  });

  it("uses a messaging service when the sender is one", async () => {
    const { fetch, requests } = fakeFetch({ [TWILIO_SEND]: [twilioSent] });

    await twilioSmsSender({ ...config, from: "MG123" }, fetch).send(outgoing());
    expect((await requests[0]!.formData()).get("MessagingServiceSid")).toBe("MG123");
  });

  it("reports Twilio's error code", async () => {
    const { fetch } = fakeFetch({ [TWILIO_SEND]: [{ status: 400, json: { code: 21211, message: "Invalid 'To'" } }] });

    expect(await twilioSmsSender(config, fetch).send(outgoing())).toEqual({ status: "failed", reason: "twilio_21211" });
  });
});

describe("MESSAGE_SENDER", () => {
  const zaloEnv = {
    ZALO_APP_ID: "app-1",
    ZALO_APP_SECRET: "app-secret",
    ZALO_REFRESH_TOKEN: "refresh-0",
    ZALO_ZNS_CODE_TEMPLATE_VI: "tpl-vi",
  };

  const smsEnv = { SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "token", SMS_FROM: "Xac thuc" };

  it("zalo+sms: sends by SMS when Zalo is down", async () => {
    const { fetch, requests } = fakeFetch({ [ZALO_TOKEN]: ["down"], [TWILIO_SEND]: [twilioSent] });
    const { entries, log } = fakeLog();
    const sender = messageSenderFor({ ...env, ...zaloEnv, ...smsEnv, MESSAGE_SENDER: "zalo+sms" }, db, fetch, log);

    expect(await sender.send(outgoing())).toBe("sent");
    expect(entries.map((e) => [e.channel, e.status])).toEqual([
      ["zalo", "failed"],
      ["sms", "sent"],
    ]);
    expect(requests.at(-1)!.url.startsWith(TWILIO_SEND)).toBe(true);
  });

  it("sms: never calls Zalo", async () => {
    const { fetch, requests } = fakeFetch({ [TWILIO_SEND]: [twilioSent] });
    const sender = messageSenderFor({ ...env, ...smsEnv, MESSAGE_SENDER: "sms" }, db, fetch, fakeLog().log);

    expect(await sender.send(outgoing())).toBe("sent");
    expect(requests.every((r) => r.url.startsWith(TWILIO_SEND))).toBe(true);
  });

  it("refuses to start without the settings a channel needs", () => {
    expect(() => messageSenderFor({ ...env, ...zaloEnv, MESSAGE_SENDER: "zalo+sms" }, db)).toThrow(
      "MESSAGE_SENDER needs SMS settings: SMS_PROVIDER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SMS_FROM",
    );
    expect(() => messageSenderFor({ ...env, MESSAGE_SENDER: "carrier-pigeon" }, db)).toThrow("MESSAGE_SENDER must be one of");
  });
});

describe("sending a sign-in code", () => {
  const nobody: MessageSender = { send: async () => "not_sent" };

  it("reports not_sent when no channel delivered it", async () => {
    expect(await signInCodesService(db, nobody).send(newNumber(), "482913", undefined)).toBe("not_sent");
  });

  it("answers an error, not 'code sent', when the code can't go out", async () => {
    // A misconfigured sender: SMS without its settings.
    const auth = createAuth({ ...env, MESSAGE_SENDER: "sms" });

    const res = await auth.handler(
      new Request("http://localhost:8787/auth/phone-number/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.9.0.1" },
        body: JSON.stringify({ phoneNumber: newNumber() }),
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
