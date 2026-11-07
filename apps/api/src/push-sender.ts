import { z } from "zod";
import type { Bindings } from "./bindings";
import type { Fetch } from "./types";

/**
 * Pushes to the traveller's own phone (#20): the check-in call, which has to
 * reach the phone while the app is closed and the screen is locked.
 *
 * `PUSH_SENDER`: "expo" sends through Expo's push service (it holds the APNs
 * and FCM keys for the app's EAS project), "console" prints for
 * `wrangler dev`, "none" (or unset) sends nothing, for tests.
 */
export const PushSenderName = z.enum(["expo", "console", "none"]);

/** One push to one phone. Nothing in it may give Cage away: it looks like a call from `title`. */
export interface Push {
  /** An Expo push token. */
  to: string;
  title: string;
  body: string;
  data: { kind: "check_in_call"; journeyId: string; call: 1 | 2 };
  /** False for vibrate-only: no sound, and the Android channel that only vibrates. */
  ring: boolean;
  /** Seconds the push is worth delivering: a call that arrives after it stopped ringing would only confuse. */
  ttlS: number;
}

export interface PushResult {
  /** Tokens the push service says no longer reach a phone (app removed, signed out). Delete them. */
  deadTokens: string[];
}

export interface PushSender {
  send(pushes: Push[]): Promise<PushResult>;
}

/** Android notification channels the app creates (apps/mobile/src/services/push.service.ts). Keep in step. */
export const CALL_CHANNEL = { ring: "call-ring", vibrate: "call-vibrate" } as const;

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const ExpoTicket = z.union([
  z.object({ status: z.literal("ok") }),
  z.object({ status: z.literal("error"), details: z.object({ error: z.string().optional() }).optional() }),
]);

const ExpoAnswer = z.object({ data: z.array(ExpoTicket) });

/** Expo's push service. `accessToken` only when the EAS project turned on enhanced push security. */
export function expoPushSender(fetch: Fetch, accessToken?: string): PushSender {
  return {
    async send(pushes) {
      if (pushes.length === 0) return { deadTokens: [] };

      const headers = new Headers({ "content-type": "application/json", accept: "application/json" });

      if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

      const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(pushes.map(expoMessage)) });

      if (!res.ok) throw new Error(`expo push failed: ${res.status}`);
      const tickets = ExpoAnswer.parse(await res.json()).data;

      // Tickets come back in the order the pushes went out.
      const deadTokens = pushes
        .filter((_, i) => {
          const ticket = tickets[i];

          return ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered";
        })
        .map((push) => push.to);

      return { deadTokens };
    },
  };
}

function expoMessage(push: Push) {
  return {
    to: push.to,
    title: push.title,
    body: push.body,
    data: push.data,
    priority: "high",
    ttl: push.ttlS,
    sound: push.ring ? "default" : null,
    channelId: push.ring ? CALL_CHANNEL.ring : CALL_CHANNEL.vibrate,
    // iOS: breaks through a Focus that allows time-sensitive apps.
    interruptionLevel: "time-sensitive",
  };
}

/** For local development only: prints the push instead of sending it. Never prints the token. */
export const consolePushSender: PushSender = {
  async send(pushes) {
    for (const push of pushes) {
      console.warn(`[push ${push.data.kind} call ${push.data.call}${push.ring ? "" : ", vibrate only"}] ${push.title}: ${push.body}`);
    }

    return { deadTokens: [] };
  },
};

export const silentPushSender: PushSender = { async send() { return { deadTokens: [] }; } };

/** The sender `PUSH_SENDER` names. Unset means "none", so a Worker without push set up still runs every timer. */
export function pushSenderFor(env: Bindings, fetch: Fetch = globalThis.fetch): PushSender {
  const name = PushSenderName.safeParse(env.PUSH_SENDER ?? "none");

  if (!name.success) throw new Error(`PUSH_SENDER must be one of ${PushSenderName.options.join(", ")}`);

  switch (name.data) {
    case "expo":
      return expoPushSender(fetch, env.EXPO_ACCESS_TOKEN);
    case "console":
      return consolePushSender;
    case "none":
      return silentPushSender;
  }
}
