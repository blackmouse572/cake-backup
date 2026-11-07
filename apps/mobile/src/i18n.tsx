import AsyncStorage from "@react-native-async-storage/async-storage";
import { createI18n, isLocale, matchLocale, type Locale } from "@cage/i18n";
import { getLocales } from "expo-localization";
import { useEffect, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

const STORAGE_KEY = "cage.locale";

/** First launch follows the phone's language if it is vi or en, otherwise vi. */
export function deviceLocale(): Locale {
  return matchLocale(getLocales().map((l) => l.languageTag));
}

export const i18n = createI18n(deviceLocale());

/** Applies instantly and is saved on this device. */
export function setLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
  AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => {});
}

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (isLocale(saved) && saved !== i18n.language) void i18n.changeLanguage(saved);
      })
      .catch(() => {});
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export { useTranslation };
