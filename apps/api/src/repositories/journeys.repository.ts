import { journeys, type Db } from "@cage/db";
import { and, eq, ne } from "drizzle-orm";

export type NewJourney = typeof journeys.$inferInsert;

export type JourneyRow = typeof journeys.$inferSelect;

/** D1 access for `journeys`, the summary row kept beside each journey's Durable Object. */
export function journeysRepository(db: Db) {
  return {
    async insert(row: NewJourney): Promise<void> {
      await db.insert(journeys).values(row);
    },

    /** True when the journey exists and belongs to this traveller. */
    async isOwnedBy(id: string, userId: string): Promise<boolean> {
      const row = await db
        .select({ id: journeys.id })
        .from(journeys)
        .where(and(eq(journeys.id, id), eq(journeys.userId, userId)))
        .get();

      return row !== undefined;
    },

    find(id: string): Promise<JourneyRow | undefined> {
      return db.select().from(journeys).where(eq(journeys.id, id)).get();
    },

    /** Mirrors the Durable Object's status; `endedAt` is set when the journey ends. */
    async setStatus(id: string, status: JourneyRow["status"], endedAt?: Date): Promise<void> {
      await db
        .update(journeys)
        .set(endedAt ? { status, endedAt } : { status })
        .where(eq(journeys.id, id));
    },

    /** Ids of this traveller's journeys that the summary row doesn't mark as ended. */
    async notEndedIds(userId: string): Promise<string[]> {
      const rows = await db
        .select({ id: journeys.id })
        .from(journeys)
        .where(and(eq(journeys.userId, userId), ne(journeys.status, "ended")));

      return rows.map((r) => r.id);
    },
  };
}
