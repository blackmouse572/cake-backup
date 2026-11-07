import { providerTokens, type Db } from "@cage/db";
import { and, eq } from "drizzle-orm";

export type ProviderToken = typeof providerTokens.$inferSelect;

export type Provider = ProviderToken["provider"];

/** D1 access for `provider_tokens`: the rotating OAuth tokens of message providers. */
export function providerTokensRepository(db: Db) {
  return {
    find(provider: Provider): Promise<ProviderToken | undefined> {
      return db.query.providerTokens.findFirst({ where: eq(providerTokens.provider, provider) });
    },

    /**
     * Saves a fresh token pair. With `replacing`, only overwrites the row if it
     * still holds that refresh token, so two refreshes at once keep the later
     * row instead of writing back an older pair.
     */
    async save(token: ProviderToken, replacing: string | null): Promise<void> {
      if (replacing === null) {
        await db.insert(providerTokens).values(token).onConflictDoNothing();

        return;
      }

      await db
        .update(providerTokens)
        .set(token)
        .where(and(eq(providerTokens.provider, token.provider), eq(providerTokens.refreshToken, replacing)));
    },
  };
}
