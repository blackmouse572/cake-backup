import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Mark } from "../brand";
import { LanguageLinks, LocaleProvider } from "../i18n";
import { getLocale } from "../server/functions";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ lang: z.string().optional() }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ deps }) => getLocale({ data: deps }),
  component: Home,
});

function Home() {
  const { locale } = Route.useLoaderData();

  return (
    <LocaleProvider locale={locale}>
      <HomeContent />
    </LocaleProvider>
  );
}

function HomeContent() {
  const { t, i18n } = useTranslation();

  return (
    <main className="page" lang={i18n.language}>
      <span className="brand">
        <Mark />
        {t("app.name")}
      </span>
      <h1 className="hp">{t("app.tagline")}</h1>
      <LanguageLinks />
    </main>
  );
}
