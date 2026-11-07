import type { Db } from "@cage/db";
import { z } from "zod";
import type { Bindings } from "./bindings";
import { consoleSender, silentSender } from "./senders/dev.sender";
import { fallbackSender } from "./senders/fallback.sender";
import { twilioSmsSender } from "./senders/twilio-sms.sender";
import { zaloZnsSender } from "./senders/zalo-zns.sender";
import { zaloTokensService } from "./services/zalo-tokens.service";
import type { ChannelSender, DeliveryLogEntry, Fetch, MessageSender } from "./types";
import { logDelivery } from "./utils";

/**
 * `MESSAGE_SENDER`: "zalo+sms" in production (Zalo ZNS, then SMS), "sms" to
 * turn Zalo off, "zalo" to try Zalo alone on staging before an SMS provider
 * is set up, "console" for `wrangler dev` and "none" for tests.
 */
export const SenderName = z.enum(["zalo+sms", "zalo", "sms", "console", "none"]);

export type SenderName = z.infer<typeof SenderName>;

const required = z.string().trim().min(1);

const ZaloEnv = z.object({
  ZALO_APP_ID: required,
  ZALO_APP_SECRET: required,
  ZALO_REFRESH_TOKEN: required,
  ZALO_ZNS_CODE_TEMPLATE_VI: required,
  ZALO_ZNS_CODE_TEMPLATE_EN: required.optional(),
  ZALO_ZNS_DEVELOPMENT: z.enum(["true", "false"]).default("false"),
});

/** Only Twilio for now; a Vietnamese brandname provider joins once one is picked (#8). */
const SmsEnv = z.object({
  SMS_PROVIDER: z.literal("twilio"),
  TWILIO_ACCOUNT_SID: required,
  TWILIO_AUTH_TOKEN: required,
  SMS_FROM: required,
});

/** Parses the settings a channel needs. The error names the settings, never their values. */
function settings<T extends z.ZodType>(schema: T, env: Bindings, channel: string): z.output<T> {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`MESSAGE_SENDER needs ${channel} settings: ${names}`);
  }

  return parsed.data;
}

function zaloChannel(env: Bindings, db: Db, fetch: Fetch): ChannelSender {
  const zalo = settings(ZaloEnv, env, "Zalo");

  const tokens = zaloTokensService(
    db,
    { appId: zalo.ZALO_APP_ID, appSecret: zalo.ZALO_APP_SECRET, seedRefreshToken: zalo.ZALO_REFRESH_TOKEN },
    fetch,
  );

  return zaloZnsSender(
    {
      codeTemplates: { vi: zalo.ZALO_ZNS_CODE_TEMPLATE_VI, en: zalo.ZALO_ZNS_CODE_TEMPLATE_EN },
      development: zalo.ZALO_ZNS_DEVELOPMENT === "true",
    },
    tokens,
    fetch,
  );
}

function smsChannel(env: Bindings, fetch: Fetch): ChannelSender {
  const sms = settings(SmsEnv, env, "SMS");

  return twilioSmsSender(
    { accountSid: sms.TWILIO_ACCOUNT_SID, authToken: sms.TWILIO_AUTH_TOKEN, from: sms.SMS_FROM },
    fetch,
  );
}

/**
 * The sender `MESSAGE_SENDER` names, built from the Worker's vars and secrets.
 * Throws on a missing setting, so a bad deploy fails on the first message
 * instead of sending nothing.
 */
export function messageSenderFor(
  env: Bindings,
  db: Db,
  fetch: Fetch = globalThis.fetch,
  log: (entry: DeliveryLogEntry) => void = logDelivery,
): MessageSender {
  const name = SenderName.safeParse(env.MESSAGE_SENDER);

  if (!name.success) throw new Error(`MESSAGE_SENDER must be one of ${SenderName.options.join(", ")}`);

  switch (name.data) {
    case "console":
      return consoleSender;
    case "none":
      return silentSender;
    case "zalo":
      return fallbackSender([zaloChannel(env, db, fetch)], log);
    case "sms":
      return fallbackSender([smsChannel(env, fetch)], log);
    case "zalo+sms":
      return fallbackSender([zaloChannel(env, db, fetch), smsChannel(env, fetch)], log);
  }
}
