import { LOCALE_COOKIE, isLocale, resolveWebLocale, type Locale } from "@cage/i18n";
import { getCookie, setCookie } from "@tanstack/react-start/server";

/**
 * Resolve the viewer's language and remember an explicit `?lang=` choice.
 * Server only: call it from a server function.
 */
export function viewerLocale(query: string | undefined, traveller?: string): Locale {
  if (isLocale(query)) {
    setCookie(LOCALE_COOKIE, query, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: true });
  }

  return resolveWebLocale({ query, cookie: getCookie(LOCALE_COOKIE), traveller });
}
