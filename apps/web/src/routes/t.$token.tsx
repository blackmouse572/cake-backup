import type { Locale } from "@cage/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import mapCss from "maplibre-gl/dist/maplibre-gl.css?url";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { LiveJourney } from "../components/circle-view";
import { LanguageLinks, LocaleProvider } from "../i18n";
import { getCircleJourney } from "../server/functions";

/** How often the open page asks for the latest position. */
const REFRESH_MS = 10_000;

/** The safety circle's view of a journey, by their own link (screens 22, 23, 24, 24b, 15). */
export const Route = createFileRoute("/t/$token")({
  validateSearch: z.object({ lang: z.string().optional() }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ params, deps }) => getCircleJourney({ data: { token: params.token, lang: deps.lang } }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }],
    links: [{ rel: "stylesheet", href: mapCss }],
  }),
  component: JourneyPage,
});

function JourneyPage() {
  const { journey, locale, now } = Route.useLoaderData();
  const router = useRouter();

  useEffect(() => {
    if (!journey) return;
    const timer = setInterval(() => void router.invalidate(), REFRESH_MS);

    return () => clearInterval(timer);
  }, [journey, router]);

  return (
    <LocaleProvider locale={locale}>
      {journey ? (
        <LiveJourney journey={journey} locale={locale} now={now} />
      ) : (
        <TripEnded locale={locale} />
      )}
    </LocaleProvider>
  );
}

function TripEnded({ locale }: { locale: Locale }) {
  const { t } = useTranslation();

  return (
    <main className="page" lang={locale}>
      <p className="cap">{t("web.linkEnded")}</p>
      <LanguageLinks />
    </main>
  );
}
