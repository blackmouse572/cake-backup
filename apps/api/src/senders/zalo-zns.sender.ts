import type { Locale } from "@cage/i18n";
import { z } from "zod";
import { PROVIDER_TIMEOUT_MS, ZALO_ZNS } from "../constants";
import type { ZaloTokens } from "../services/zalo-tokens.service";
import type { ChannelResult, ChannelSender, Fetch, Outgoing } from "../types";
import { zaloPhone } from "../utils";

export type ZaloZnsConfig = {
  /** Approved ZNS template ids for the code message, per language. A language without one goes by SMS. */
  codeTemplates: Partial<Record<Locale, string>>;
  /** Development mode: Zalo only delivers to the OA's admins, and templates need no approval yet. */
  development: boolean;
};

/** The body of a ZNS send. */
type ZnsPayload = {
  phone: string;
  template_id: string;
  template_data: Record<string, string>;
  tracking_id: string;
  mode?: "development";
};

/** Zalo's answer to a ZNS send. `error` is 0 on success. */
const SendResponse = z.object({
  error: z.number(),
  message: z.string().optional(),
  data: z.object({ msg_id: z.string() }).optional(),
});

/** Zalo ZNS: an approved template message to the Zalo account behind a Vietnamese number. */
export function zaloZnsSender(config: ZaloZnsConfig, tokens: ZaloTokens, fetch: Fetch): ChannelSender {
  async function post(token: string, body: string): Promise<z.infer<typeof SendResponse> | null> {
    try {
      const res = await fetch(ZALO_ZNS.sendUrl, {
        method: "POST",
        headers: { "content-type": "application/json", access_token: token },
        body,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });

      const parsed = SendResponse.safeParse(await res.json());

      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  return {
    channel: "zalo",

    async send({ to, locale, message }: Outgoing): Promise<ChannelResult> {
      const phone = zaloPhone(to);

      // Only the code message has an approved ZNS template so far; circle messages go by SMS.
      if (message.kind !== "code") return { status: "skipped", reason: "no_template" };
      const templateId = config.codeTemplates[locale];

      if (!phone) return { status: "skipped", reason: "not_vietnamese_number" };

      if (!templateId) return { status: "skipped", reason: "no_template" };

      const payload: ZnsPayload = {
        phone,
        template_id: templateId,
        template_data: { [ZALO_ZNS.codeParam]: message.code },
        tracking_id: crypto.randomUUID(),
      };

      if (config.development) payload.mode = "development";
      const body = JSON.stringify(payload);

      let token = await tokens.accessToken();

      if (!token) return { status: "failed", reason: "no_token" };
      let answer = await post(token, body);

      if (answer?.error === ZALO_ZNS.errors.invalidToken) {
        token = await tokens.accessToken(true);

        if (!token) return { status: "failed", reason: "no_token" };
        answer = await post(token, body);
      }

      if (!answer) return { status: "failed", reason: "no_answer" };

      if (answer.error === 0 && answer.data) return { status: "sent", providerId: answer.data.msg_id };

      if (answer.error === ZALO_ZNS.errors.noZaloAccount) return { status: "failed", reason: "no_zalo_account" };

      return { status: "failed", reason: `zalo_${answer.error}` };
    },
  };
}
