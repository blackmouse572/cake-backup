import { circleLinks, type Db } from "@cage/db";
import { and, eq, isNull } from "drizzle-orm";

export type CircleLinkRow = typeof circleLinks.$inferSelect;

export type NewCircleLinkRow = typeof circleLinks.$inferInsert;

/** D1 access for `circle_links`. Rows hold the token's hash, never the token. */
export function circleLinksRepository(db: Db) {
  return {
    async insertMany(rows: NewCircleLinkRow[]): Promise<void> {
      if (rows.length > 0) await db.insert(circleLinks).values(rows);
    },

    findByHash(tokenHash: string): Promise<CircleLinkRow | undefined> {
      return db.select().from(circleLinks).where(eq(circleLinks.tokenHash, tokenHash)).get();
    },

    /** Keeps the first time: a link already marked is left alone. */
    async markOpened(tokenHash: string, at: Date): Promise<void> {
      await db
        .update(circleLinks)
        .set({ openedAt: at })
        .where(and(eq(circleLinks.tokenHash, tokenHash), isNull(circleLinks.openedAt)));
    },

    async deleteForJourney(journeyId: string): Promise<void> {
      await db.delete(circleLinks).where(eq(circleLinks.journeyId, journeyId));
    },
  };
}
