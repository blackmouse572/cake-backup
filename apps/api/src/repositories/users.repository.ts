import { circleContacts, user, type Db } from "@cage/db";
import { count, eq } from "drizzle-orm";

/** D1 access for Better Auth's `user` table and what hangs off it. */
export function usersRepository(db: Db) {
  return {
    find(userId: string) {
      return db.query.user.findFirst({ where: eq(user.id, userId) });
    },

    /** A traveller made without sign-in. Only the demo uses this (`DEMO_MODE`). */
    async insert(row: typeof user.$inferInsert): Promise<void> {
      await db.insert(user).values(row);
    },

    async setName(userId: string, name: string): Promise<void> {
      await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId));
    },

    async circleSize(userId: string): Promise<number> {
      const [row] = await db.select({ n: count() }).from(circleContacts).where(eq(circleContacts.userId, userId));

      return row?.n ?? 0;
    },
  };
}
