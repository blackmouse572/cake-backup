import { demoLockouts, type Db } from "@cage/db";
import { eq } from "drizzle-orm";

export type DemoLockoutRow = typeof demoLockouts.$inferSelect;

/** D1 access for `demo_lockouts`: wrong demo-key tries, by a hash of the caller's IP. */
export function demoLockoutsRepository(db: Db) {
  return {
    find(clientHash: string): Promise<DemoLockoutRow | undefined> {
      return db.select().from(demoLockouts).where(eq(demoLockouts.clientHash, clientHash)).get();
    },

    async save(row: DemoLockoutRow): Promise<void> {
      await db
        .insert(demoLockouts)
        .values(row)
        .onConflictDoUpdate({
          target: demoLockouts.clientHash,
          set: { failures: row.failures, lockedUntil: row.lockedUntil, updatedAt: row.updatedAt },
        });
    },

    async clear(clientHash: string): Promise<void> {
      await db.delete(demoLockouts).where(eq(demoLockouts.clientHash, clientHash));
    },
  };
}
