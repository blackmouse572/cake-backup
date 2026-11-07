import type { Db } from "@cage/db";
import type { Locale } from "@cage/i18n";
import type { AlertReason } from "@cage/shared";
import { alertEventsRepository } from "../repositories/alert-events.repository";
import { circleContactsRepository } from "../repositories/circle-contacts.repository";
import { circleLinksRepository } from "../repositories/circle-links.repository";
import { travellerSettingsRepository } from "../repositories/traveller-settings.repository";
import { usersRepository } from "../repositories/users.repository";
import { logError } from "../middleware/request-log";
import type { Message, MessageSender } from "../types";
import { displayName, hashToken, newCircleLinkToken } from "../utils";

/** What the journey object hands over to be sent to the circle. */
export type CircleNotice =
  | { kind: "journey_started"; destination: string; arriveAt: number }
  | { kind: "alert"; reason: AlertReason; likelyBatteryDied?: boolean }
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
  const settings = travellerSettingsRepository(db);

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
            ? { kind: "alert", reason: notice.reason, likelyBatteryDied: notice.likelyBatteryDied, name, url: link.url }
            : { kind: "journey_started", name, destination: notice.destination, arriveAt: notice.arriveAt, url: link.url };

        const ok = await sender.send({ to: contact.phone, locale: journey.locale, message });
        sent += ok === "sent" ? 1 : 0;
      }

      return sent;
    },

    /**
     * A quiet heads-up after "Quên mã?" reset the codes (#35, PRD "Forgot
     * code"): someone holding the phone and SIM could do it too, so the circle
     * hearing about it is the only signal left. No link, since no journey is
     * open. Sent to everyone at once, because it runs in the short time a
     * Worker has after its response, and one contact's failure never stops
     * the others. Returns how many were sent.
     */
    async codesReset(userId: string): Promise<number> {
      const [circle, account, row] = await Promise.all([contacts.list(userId), users.find(userId), settings.find(userId)]);
      const message: Message = { kind: "codes_reset", name: displayName(account?.name ?? "", account?.phoneNumber ?? "") };
      const locale = row?.locale ?? "vi";
      const results = await Promise.allSettled(circle.map((c) => sender.send({ to: c.phone, locale, message })));

      for (const result of results) {
        if (result.status === "rejected") {
          const err = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
          logError(err, "circle-messages.codesReset");
        }
      }

      return results.filter((r) => r.status === "fulfilled" && r.value === "sent").length;
    },
  };
}
