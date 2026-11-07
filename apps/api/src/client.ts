import { hc } from "hono/client";
import type { AppType } from "./app";

export type { AppType };

type ClientOptions = NonNullable<Parameters<typeof hc>[1]>;

export interface ApiClientOptions extends Omit<ClientOptions, "headers"> {
  /**
   * The traveller's session cookie, read fresh for every request (the app
   * passes Better Auth's `authClient.getCookie`). Needed for `/me` and for
   * starting or reading a journey.
   */
  session?: () => string | Promise<string>;
}

/**
 * Typed RPC client for the app and the website.
 *
 * Location updates don't use the session: pass the journey token from
 * `POST /journeys` per call, e.g.
 * `api.journeys[":id"].updates.$post({ param, json }, { headers: journeyTokenHeaders(token) })`.
 */
export function createApiClient(baseUrl: string, { session, ...init }: ApiClientOptions = {}) {
  return hc<AppType>(baseUrl, {
    ...init,
    headers: async (): Promise<Record<string, string>> => (session ? { cookie: await session() } : {}),
  });
}

/** Headers that carry a journey token on `POST /journeys/:id/updates`. */
export function journeyTokenHeaders(journeyToken: string) {
  return { authorization: `Bearer ${journeyToken}` };
}
