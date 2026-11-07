import type { Db } from "@cage/db";
import type { CircleJourneyView, ReachedOutcome } from "@cage/shared";
import type { JourneyObject } from "../journey-object";
import { circleContactsRepository } from "../repositories/circle-contacts.repository";
import { circleLinksRepository } from "../repositories/circle-links.repository";
import { journeysRepository } from "../repositories/journeys.repository";
import { travellerSettingsRepository } from "../repositories/traveller-settings.repository";
import { usersRepository } from "../repositories/users.repository";
import { displayName, hashToken } from "../utils";

/**
 * Opening a circle link (#18). A link works while its journey runs and its
 * contact is still in the circle. Anything else, including a token that never
 * existed, gives the same "not found", which the website shows as "trip ended".
 */
export function circleLinksService(db: Db, objects: DurableObjectNamespace<JourneyObject>) {
  const links = circleLinksRepository(db);
  const journeys = journeysRepository(db);
  const users = usersRepository(db);
  const settings = travellerSettingsRepository(db);
  const contacts = circleContactsRepository(db);

  /** The link's row, journey, contact and journey object while the link works, else null. */
  async function resolve(token: string) {
    const link = await links.findByHash(await hashToken(token));

    if (!link) return null;
    const journey = await journeys.find(link.journeyId);
    // A removed contact is no longer found, so their links stop working.
    const contact = journey ? await contacts.find(journey.userId, link.contactId) : undefined;

    if (!journey || !contact) return null;

    return { link, journey, contact, stub: objects.get(objects.idFromName(journey.id)) };
  }

  return {
    /**
     * The journey for the contact's page. Fetching it doesn't count as
     * opening the link: messaging apps fetch links for their previews, and
     * that must not stop the climb to the hotline (`markOpened`).
     */
    async open(token: string, now = Date.now()): Promise<Omit<CircleJourneyView, "demo"> | null> {
      const found = await resolve(token);
      const view = found ? await found.stub.circleView(now) : null;

      if (!found || !view || view.status === "ended") return null;
      const { journey } = found;
      const [account, row] = await Promise.all([users.find(journey.userId), settings.find(journey.userId)]);
      const phone = account?.phoneNumber ?? "";

      return {
        ...view,
        travellerName: displayName(account?.name ?? "", phone),
        travellerPhone: phone,
        // Read on every open, so turning police on or off in settings shows at once.
        policeEnabled: row?.policeEnabled ?? false,
      };
    },

    /**
     * The contact's page loaded in a browser. Counts as the circle having
     * seen an alert, which stops the climb to the hotline, and notes who
     * opened it and when. False when the link doesn't work.
     */
    async markOpened(token: string, now = Date.now()): Promise<boolean> {
      const found = await resolve(token);
      const view = found ? await found.stub.circleView(now) : null;

      if (!found || !view || view.status === "ended") return false;
      await found.stub.markOpened(now);

      if (!found.link.openedAt) await links.recordOpened(found.link.tokenHash, new Date(now));

      return true;
    },

    /**
     * The contact reached the traveller and says how they are (#22). Shown to
     * the whole circle; the alert stays on. "no_alert" when there is nothing
     * to answer.
     */
    async markReached(token: string, outcome: ReachedOutcome, now = Date.now()): Promise<"ok" | "no_alert" | "not_found"> {
      const found = await resolve(token);
      const view = found ? await found.stub.circleView(now) : null;

      if (!found || !view || view.status === "ended") return "not_found";

      return found.stub.markReached(found.contact.id, found.contact.name, outcome, now);
    },
  };
}
