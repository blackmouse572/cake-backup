import { travellerSettings, type Db } from "@cage/db";
import { eq } from "drizzle-orm";

export type TravellerSettings = typeof travellerSettings.$inferSelect;

/** D1 access for `traveller_settings`. No rules here; those live in the services. */
export function travellerSettingsRepository(db: Db) {
  return {
    find(userId: string): Promise<TravellerSettings | undefined> {
      return db.query.travellerSettings.findFirst({ where: eq(travellerSettings.userId, userId) });
    },

    async saveCodeHashes(userId: string, hashes: { safeCodeHash: string; duressCodeHash: string }): Promise<void> {
      const values = { ...hashes, codeFailures: 0, codeFailedAt: null };
      await db
        .insert(travellerSettings)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: travellerSettings.userId, set: values });
    },

    async recordCodeFailure(userId: string, failures: number, at: Date): Promise<void> {
      await db
        .update(travellerSettings)
        .set({ codeFailures: failures, codeFailedAt: at })
        .where(eq(travellerSettings.userId, userId));
    },
  };
}
