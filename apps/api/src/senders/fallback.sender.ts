import type { ChannelResult, ChannelSender, DeliveryLogEntry, MessageSender, Outgoing } from "../types";

/**
 * Tries each channel in turn (the preferred one first) until one sends, and
 * logs what every channel did. With Zalo then SMS, a number without Zalo, a
 * missing template or a Zalo outage all end up as an SMS.
 */
export function fallbackSender(channels: ChannelSender[], log: (entry: DeliveryLogEntry) => void): MessageSender {
  return {
    async send(outgoing: Outgoing) {
      const ordered = channels.toSorted((a, b) => Number(b.channel === outgoing.prefer) - Number(a.channel === outgoing.prefer));

      for (const sender of ordered) {
        const result: ChannelResult = await sender.send(outgoing).catch(() => ({ status: "failed", reason: "error" }));
        log({ event: "message_delivery", kind: outgoing.message.kind, channel: sender.channel, locale: outgoing.locale, ...result });

        if (result.status === "sent") return "sent";
      }

      return "not_sent";
    },
  };
}
