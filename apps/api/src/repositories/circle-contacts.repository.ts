import { circleContacts, type Db } from "@cage/db";
import { and, asc, eq } from "drizzle-orm";

export type CircleContactRow = typeof circleContacts.$inferSelect;

export type NewCircleContactRow = typeof circleContacts.$inferInsert;

/** D1 access for `circle_contacts`. Every query is scoped to one traveller. */
export function circleContactsRepository(db: Db) {
  return {
    /** The traveller's contacts, first to be alerted first. */
    list(userId: string): Promise<CircleContactRow[]> {
      return db
        .select()
        .from(circleContacts)
        .where(eq(circleContacts.userId, userId))
        .orderBy(asc(circleContacts.position), asc(circleContacts.createdAt));
    },

    find(userId: string, id: string): Promise<CircleContactRow | undefined> {
      return db
        .select()
        .from(circleContacts)
        .where(and(eq(circleContacts.userId, userId), eq(circleContacts.id, id)))
        .get();
    },

    /** Skips a number the traveller already has, so two taps at once can't add someone twice. */
    async insertMany(rows: NewCircleContactRow[]): Promise<void> {
      await db.insert(circleContacts).values(rows).onConflictDoNothing();
    },

    /** True when a row was deleted. */
    async delete(userId: string, id: string): Promise<boolean> {
      const deleted = await db
        .delete(circleContacts)
        .where(and(eq(circleContacts.userId, userId), eq(circleContacts.id, id)))
        .returning({ id: circleContacts.id });

      return deleted.length > 0;
    },

    /** Sets `position` to each id's index, in one batch. */
    async setOrder(userId: string, ids: readonly string[]): Promise<void> {
      const [first, ...rest] = ids.map((id, position) =>
        db
          .update(circleContacts)
          .set({ position })
          .where(and(eq(circleContacts.userId, userId), eq(circleContacts.id, id))),
      );

      if (first) await db.batch([first, ...rest]);
    },
  };
}
