import type { Db } from "@cage/db";
import { z } from "zod";
import { PROVIDER_TIMEOUT_MS, ZALO_ZNS } from "../constants";
import { providerTokensRepository } from "../repositories/provider-tokens.repository";
import type { Fetch } from "../types";

export type ZaloAppConfig = {
  appId: string;
  appSecret: string;
  /** The first refresh token, from the Zalo console. Only used while D1 has none. */
  seedRefreshToken: string;
};

/** Zalo's answer to a refresh; `expires_in` is in seconds and sometimes a string. */
const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.coerce.number().positive(),
});

/**
 * The Zalo OA access token. It lasts about a day and each refresh token works
 * once, so the pair lives in D1 and rotates here. Returns null when Zalo won't
 * give a token; the caller then falls back to SMS.
 */
export function zaloTokensService(db: Db, config: ZaloAppConfig, fetch: Fetch, now = () => Date.now()) {
  const tokens = providerTokensRepository(db);

  async function refresh(refreshToken: string): Promise<z.infer<typeof TokenResponse> | null> {
    try {
      const res = await fetch(ZALO_ZNS.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", secret_key: config.appSecret },
        body: new URLSearchParams({ app_id: config.appId, refresh_token: refreshToken, grant_type: "refresh_token" }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });

      const parsed = TokenResponse.safeParse(await res.json());

      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  return {
    /** A usable access token. `fresh` skips the stored one, after Zalo said it was invalid. */
    async accessToken(fresh = false): Promise<string | null> {
      const stored = await tokens.find("zalo");
      const at = now();

      if (stored && !fresh && stored.expiresAt.getTime() - ZALO_ZNS.refreshMarginMs > at) return stored.accessToken;

      const next = await refresh(stored?.refreshToken ?? config.seedRefreshToken);

      if (!next) {
        // Another request may have rotated the pair a moment ago, using up ours.
        const latest = await tokens.find("zalo");
        const rotated = latest && latest.refreshToken !== stored?.refreshToken;

        return rotated && latest.expiresAt.getTime() > at ? latest.accessToken : null;
      }

      await tokens.save(
        {
          provider: "zalo",
          accessToken: next.access_token,
          refreshToken: next.refresh_token,
          expiresAt: new Date(at + next.expires_in * 1000),
          updatedAt: new Date(at),
        },
        stored?.refreshToken ?? null,
      );

      return next.access_token;
    },
  };
}

export type ZaloTokens = ReturnType<typeof zaloTokensService>;
