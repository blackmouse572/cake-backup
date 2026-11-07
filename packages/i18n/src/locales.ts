import { z } from "zod";

export const LOCALES = ["vi", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "vi";

/** Each language is named in itself, in every locale (language switcher). */
export const LOCALE_NAMES: Record<Locale, string> = { vi: "Tiếng Việt", en: "English" };

export const LocaleSchema = z.enum(LOCALES);

/** Parses a language code from outside (query string, cookie, storage). */
export function isLocale(value: unknown): value is Locale {
  return LocaleSchema.safeParse(value).success;
}

/**
 * The app's first-launch language: the first of the phone's languages
 * (expo-localization, best first) that we support, otherwise Vietnamese.
 */
export function matchLocale(languageTags: readonly string[]): Locale {
  for (const tag of languageTags) {
    const base = tag.toLowerCase().split(/[-_]/)[0];

    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}

/**
 * Language for the safety circle's web view (cage.vn/t/…): a `?lang=`
 * override first, then the viewer's remembered choice (cookie), then the
 * traveller's language.
 */
export function resolveWebLocale(input: {
  query?: string | null;
  cookie?: string | null;
  traveller?: string | null;
}): Locale {
  for (const candidate of [input.query, input.cookie, input.traveller]) {
    if (isLocale(candidate)) return candidate;
  }

  return DEFAULT_LOCALE;
}

export const LOCALE_COOKIE = "cage_lang";
