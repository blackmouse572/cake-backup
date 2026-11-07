import type { Db } from "@cage/db";
import type { Locale } from "@cage/i18n";
import type { AlertReason } from "@cage/shared";
import { alertEventsRepository } from "../repositories/alert-events.repository";
import { circleContactsRepository } from "../repositories/circle-contacts.repository";
import { circleLinksRepository } from "../repositories/circle-links.repository";
import { usersRepository } from "../repositories/users.repository";
import type { Message, MessageSender } from "../types";
import { displayName, hashToken, newCircleLinkToken } from "../utils";

/** What the journey object hands over to be sent to the circle. */
export type CircleNotice =
  | { kind: "journey_started"; destination: string; arriveAt: number }
  | { kind: "alert"; reason: AlertReason }
  | { kind: "safe_now" };

export interface JourneyRef {
  id: string;
  userId: string;
  locale: Locale;
}

/**
 * Messages to the traveller's safety circle, in the traveller's language
 * (ADR 0003). Every message that points at the journey carries a fresh link
 * for that one contact (#18), so removing a contact cuts off only their links.
 */
export function circleMessagesService(db: Db, sender: MessageSender, webUrl: string) {
  const contacts = circleContactsRepository(db);
  const links = circleLinksRepository(db);
  const users = usersRepository(db);
  const events = alertEventsRepository(db);

  async function newLink(): Promise<{ url: string; tokenHash: string }> {
    const token = newCircleLinkToken();

    return { url: `${webUrl.replace(/\/$/, "")}/t/${token}`, tokenHash: await hashToken(token) };
  }

  return {
    /** Sends one notice to every contact, in alert order. Returns how many were sent. */
    async send(journey: JourneyRef, notice: CircleNotice): Promise<number> {
      const [circle, account] = await Promise.all([contacts.list(journey.userId), users.find(journey.userId)]);
      const name = displayName(account?.name ?? "", account?.phoneNumber ?? "");

      if (notice.kind === "alert") {
        await events.insert({ id: crypto.randomUUID(), journeyId: journey.id, reason: notice.reason, step: "circle" });
      }

      let sent = 0;

      for (const contact of circle) {
        if (notice.kind === "safe_now") {
          const ok = await sender.send({ to: contact.phone, locale: journey.locale, message: { kind: "safe_now", name } });
          sent += ok === "sent" ? 1 : 0;
          continue;
        }

        const link = await newLink();
        await links.insertMany([{ tokenHash: link.tokenHash, journeyId: journey.id, contactId: contact.id }]);

        const message: Message =
          notice.kind === "alert"
            ? { kind: "alert", reason: notice.reason, name, url: link.url }
            : { kind: "journey_started", name, destination: notice.destination, arriveAt: notice.arriveAt, url: link.url };

        const ok = await sender.send({ to: contact.phone, locale: journey.locale, message });
        sent += ok === "sent" ? 1 : 0;
      }

      return sent;
    },
  };
}
