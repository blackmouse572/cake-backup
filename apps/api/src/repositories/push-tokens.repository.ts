import { pushTokens, type Db } from "@cage/db";
import { eq, inArray } from "drizzle-orm";

export type PushTokenRow = typeof pushTokens.$inferSelect;

/** D1 access for `push_tokens`. No rules here; those live in the services. */
export function pushTokensRepository(db: Db) {
  return {
    /** Saves a phone's token. A token moved to another account (signed in as someone else) moves with it. */
    async save(userId: string, token: string, platform: PushTokenRow["platform"], at: Date): Promise<void> {
      await db
        .insert(pushTokens)
        .values({ token, userId, platform, updatedAt: at })
        .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform, updatedAt: at } });
    },

    forUser(userId: string): Promise<PushTokenRow[]> {
      return db.select().from(pushTokens).where(eq(pushTokens.userId, userId));
    },

    async delete(tokens: string[]): Promise<void> {
      if (tokens.length > 0) await db.delete(pushTokens).where(inArray(pushTokens.token, tokens));
    },

    async deleteForUser(userId: string): Promise<void> {
      await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
    },
  };
}
