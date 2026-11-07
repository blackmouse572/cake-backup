import { z } from "zod";
import { PROVIDER_TIMEOUT_MS, TWILIO } from "../constants";
import type { ChannelResult, ChannelSender, Fetch, Outgoing } from "../types";
import { messageText } from "../utils";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  /** A Twilio number, an approved alphanumeric sender id (a Vietnamese brandname), or a messaging service (MG...). */
  from: string;
};

const SendResponse = z.union([
  z.object({ sid: z.string() }),
  z.object({ code: z.number(), message: z.string().optional() }),
]);

/** SMS through Twilio's Messages API. */
export function twilioSmsSender(config: TwilioConfig, fetch: Fetch): ChannelSender {
  const url = `${TWILIO.apiBase}/Accounts/${config.accountSid}/Messages.json`;
  const auth = `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`;
  const sender = config.from.startsWith("MG") ? "MessagingServiceSid" : "From";

  return {
    channel: "sms",

    async send({ to, locale, message }: Outgoing): Promise<ChannelResult> {
      const body = new URLSearchParams({ To: to, [sender]: config.from, Body: messageText(message, locale) });

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { authorization: auth, "content-type": "application/x-www-form-urlencoded" },
          body,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });

        const parsed = SendResponse.safeParse(await res.json());

        if (!parsed.success) return { status: "failed", reason: `twilio_http_${res.status}` };

        if ("sid" in parsed.data) return { status: "sent", providerId: parsed.data.sid };

        return { status: "failed", reason: `twilio_${parsed.data.code}` };
      } catch {
        return { status: "failed", reason: "no_answer" };
      }
    },
  };
}
