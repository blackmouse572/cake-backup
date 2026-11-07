import { alertEvents, circleContacts, demoMessages, journeys, user, type Db } from "@cage/db";
import { asc, count, desc, eq, gt, ne, and } from "drizzle-orm";

export type DemoMessageRow = typeof demoMessages.$inferSelect;

/** D1 reads and writes for the hackathon demo (`DEMO_MODE`): running trips, the message log, start again. */
export function demoRepository(db: Db) {
  return {
    /** Trips still running that started after `since`, newest first, with the traveller and the size of their circle. */
    running(since: Date) {
      return db
        .select({
          journeyId: journeys.id,
          userId: journeys.userId,
          name: user.name,
          phone: user.phoneNumber,
          destination: journeys.destinationName,
          status: journeys.status,
          startedAt: journeys.startedAt,
          circleSize: count(circleContacts.id),
        })
        .from(journeys)
        .innerJoin(user, eq(user.id, journeys.userId))
        .leftJoin(circleContacts, eq(circleContacts.userId, journeys.userId))
        .where(and(ne(journeys.status, "ended"), gt(journeys.startedAt, since)))
        .groupBy(journeys.id)
        .orderBy(desc(journeys.startedAt))
        .all();
    },

    async logMessage(row: typeof demoMessages.$inferInsert): Promise<void> {
      await db.insert(demoMessages).values(row);
    },

    messages(journeyId: string): Promise<DemoMessageRow[]> {
      return db.select().from(demoMessages).where(eq(demoMessages.journeyId, journeyId)).orderBy(asc(demoMessages.createdAt)).all();
    },

    /**
     * "Start again": deletes the trip, its links and logged messages. The
     * traveller's account and circle stay. Alert history doesn't cascade, so it goes first.
     */
    async deleteJourney(journeyId: string): Promise<void> {
      await db.delete(alertEvents).where(eq(alertEvents.journeyId, journeyId));
      await db.delete(journeys).where(eq(journeys.id, journeyId));
    },
  };
}
