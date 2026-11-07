import { createInstance, type i18n } from "i18next";
import en from "../languages/en.json";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import type { Messages } from "./types";
import vi from "../languages/vi.json";

// `satisfies` makes the type check fail when en.json misses or adds a key.
export const resources = {
  vi: { translation: vi },
  en: { translation: en satisfies Messages },
} satisfies Record<Locale, { translation: Messages }>;

/** A new, initialised i18next instance. Use one per app; change its language with `changeLanguage`. */
export function createI18n(locale: Locale = DEFAULT_LOCALE): i18n {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: ["vi", "en"],
    resources,
    // React escapes output already; the server never builds HTML from strings.
    interpolation: { escapeValue: false },
    // Resources are bundled, so initialise synchronously.
    initAsync: false,
    returnNull: false,
  });

  return instance;
}

const fixed = new Map<Locale, i18n>();

/**
 * A shared instance pinned to one locale, for server rendering where each
 * request may want a different language. Never call `changeLanguage` on it.
 */
export function i18nFor(locale: Locale): i18n {
  let instance = fixed.get(locale);

  if (!instance) {
    instance = createI18n(locale);
    fixed.set(locale, instance);
  }

  return instance;
}
