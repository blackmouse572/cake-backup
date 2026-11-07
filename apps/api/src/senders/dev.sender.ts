import type { Db } from "@cage/db";
import { demoRepository } from "../repositories/demo.repository";
import type { MessageSender } from "../types";
import { messageText } from "../utils";

/** For local development only: prints the message instead of sending it. */
export const consoleSender: MessageSender = {
  async send({ to, locale, message, prefer }) {
    console.warn(`[${message.kind} via ${prefer ?? "zalo"}] to ${to}: ${messageText(message, locale)}`);

    return "sent";
  },
};

/** Sends nothing. Tests read the code from the `verification` table instead. */
export const silentSender: MessageSender = { async send() { return "sent"; } };

/**
 * Hackathon demo only: hands the message to `inner` (console or none, never a
 * real provider; the demo routes check) and keeps its text for the
 * dashboard's log (`GET /demo/journeys/:id/log`).
 */
export function loggingSender(inner: MessageSender, db: Db, journeyId: string): MessageSender {
  const demo = demoRepository(db);

  return {
    async send(outgoing) {
      const result = await inner.send(outgoing);
      const text = messageText(outgoing.message, outgoing.locale);
      await demo.logMessage({ id: crypto.randomUUID(), journeyId, to: outgoing.to, text, createdAt: new Date() });

      return result;
    },
  };
}
