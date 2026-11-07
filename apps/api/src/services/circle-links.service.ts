import type { Db } from "@cage/db";
import type { CircleJourneyView } from "@cage/shared";
import type { JourneyObject } from "../journey-object";
import { circleLinksRepository } from "../repositories/circle-links.repository";
import { journeysRepository } from "../repositories/journeys.repository";
import { usersRepository } from "../repositories/users.repository";
import { displayName, hashToken } from "../utils";
import { circleService } from "./circle.service";

/**
 * Opening a circle link (#18). A link works while its journey runs and its
 * contact is still in the circle. Anything else, including a token that never
 * existed, gives the same "not found", which the website shows as "trip ended".
 */
export function circleLinksService(db: Db, objects: DurableObjectNamespace<JourneyObject>) {
  const links = circleLinksRepository(db);
  const journeys = journeysRepository(db);
  const users = usersRepository(db);
  const circle = circleService(db);

  return {
    /** Also counts as the contact having seen an alert, for the 10-minute rule, and notes who opened it. */
    async open(token: string, now = Date.now()): Promise<Omit<CircleJourneyView, "demo"> | null> {
      const link = await links.findByHash(await hashToken(token));

      if (!link) return null;
      const journey = await journeys.find(link.journeyId);

      if (!journey || !(await circle.isMember(journey.userId, link.contactId))) return null;

      const stub = objects.get(objects.idFromName(journey.id));
      const view = await stub.circleView(now);

      if (!view || view.status === "ended") return null;
      await stub.markOpened(now);
      await links.markOpened(link.tokenHash, new Date(now));
      const account = await users.find(journey.userId);

      const phone = account?.phoneNumber ?? "";

      return { ...view, travellerName: displayName(account?.name ?? "", phone), travellerPhone: phone };
    },
  };
}
