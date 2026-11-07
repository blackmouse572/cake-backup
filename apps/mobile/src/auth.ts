import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/** The API's address. Set EXPO_PUBLIC_API_URL for a device; localhost works in a simulator. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";

/**
 * The hackathon demo build (EXPO_PUBLIC_DEMO=on), pointed at the demo server:
 * every screen carries a DEMO pill and the app asks the server what to show
 * more often, so the stage keeps up with the demo dashboard.
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === "on";

/**
 * The disguised build (the `development-disguise` profile, APP_VARIANT=disguise):
 * called "Ghi chú+" on the home screen, and its settings don't name Cage or
 * the disguise. The flag comes from the same configuration that renames
 * the app (`disguise.config.ts`), so the two can't disagree.
 */
export const DISGUISE = Constants.expoConfig?.extra?.disguise === true;

/**
 * Staging sits behind Cloudflare Access (docs/deploy.md).
 * Development builds carry its service token (EAS environment variables, see
 * docs/deploy.md) and send it on every request. Unset everywhere else.
 */
export const accessHeaders: Record<string, string> =
  process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_ID && process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET
    ? {
        "CF-Access-Client-Id": process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_ID,
        "CF-Access-Client-Secret": process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET,
      }
    : {};

/**
 * Better Auth's client (ADR 0002). The session cookie lives in the device's
 * secure storage and lasts a year, so the app stays signed in. Screens don't
 * call this directly; they go through `services/`.
 */
export const authClient = createAuthClient({
  baseURL: `${API_URL}/auth`,
  fetchOptions: { headers: accessHeaders },
  plugins: [
    expoClient({ scheme: "cage", storagePrefix: "cage", storage: SecureStore }),
    phoneNumberClient(),
  ],
});
