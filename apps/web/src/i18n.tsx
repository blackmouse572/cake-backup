import { i18nFor, LOCALE_NAMES, LOCALES, type Locale } from "@cage/i18n";
import type { ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

/** Gives a page its language. Each request may pick a different one, so each locale has its own instance. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nextProvider i18n={i18nFor(locale)}>{children}</I18nextProvider>;
}

/** Language links. Each language is named in itself. */
export function LanguageLinks() {
  const { i18n, t } = useTranslation();

  return (
    <nav className="lang" aria-label={t("common.language")}>
      {LOCALES.map((l) => (
        <a key={l} href={`?lang=${l}`} hrefLang={l} lang={l} aria-current={l === i18n.language ? "true" : undefined}>
          {LOCALE_NAMES[l]}
        </a>
      ))}
    </nav>
  );
}
