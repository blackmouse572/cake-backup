import { formatTime, LOCALE_NAMES, LOCALES, type Locale } from "@cage/i18n";
import { HOTLINES, TIMERS, type CircleJourneyView } from "@cage/shared";
import { createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { JourneyMap } from "./journey-map";

const MINUTE_MS = 60_000;

/** True on the demo server: call and message buttons are off, so nobody real is ever rung. */
const DemoContext = createContext(false);

interface ViewProps {
  journey: CircleJourneyView;
  locale: Locale;
  now: number;
}

/**
 * The safety circle's live page for one journey (screens 22, 23, 24, 24b,
 * 15): a full-screen map under a sheet that changes with the journey's state.
 */
export function LiveJourney({ journey, locale, now }: ViewProps) {
  const { t } = useTranslation();
  const name = journey.travellerName;
  const alerting = journey.status === "alerted" || journey.status === "lost_contact";
  const at = journey.lastUpdate;

  return (
    <main className="live" lang={locale}>
      <JourneyMap
        destination={journey.destination}
        position={at ? { lat: at.lat, lng: at.lng } : null}
        alerting={alerting}
        positionLabel={t("web.live", { name })}
      />
      <LanguagePill locale={locale} />
      {journey.demo ? <span className="demo-pill">{t("demo.pill")}</span> : null}
      <section className="sheet">
        <span className="grab" />
        <DemoContext.Provider value={journey.demo}>
          <SheetContent journey={journey} locale={locale} now={now} />
        </DemoContext.Provider>
        {journey.demo ? <p className="foot">{t("demo.callsOff")}</p> : null}
      </section>
    </main>
  );
}

/** One tap to the other language (canvas 22, top left). */
function LanguagePill({ locale }: { locale: Locale }) {
  const other = LOCALES.find((l) => l !== locale) ?? locale;

  return (
    <a className="lng" href={`?lang=${other}`} hrefLang={other} lang={other}>
      <span className="cd-icon">translate</span>
      {LOCALE_NAMES[other]}
    </a>
  );
}

function SheetContent({ journey, locale, now }: ViewProps) {
  switch (journey.status) {
    case "check_in":
      return <CheckIn journey={journey} locale={locale} now={now} />;
    case "alerted":
      return journey.alert?.reason === "duress" ? (
        <Duress journey={journey} locale={locale} now={now} />
      ) : (
        <Alerted journey={journey} locale={locale} now={now} />
      );
    case "lost_contact":
      return <LostContact journey={journey} locale={locale} now={now} />;
    default:
      return <OnRoute journey={journey} locale={locale} now={now} />;
  }
}

function Head({ chip, chipClass, title, body }: { chip: string; chipClass: string; title: string; body: string }) {
  return (
    <>
      <div className="row">
        <span className={`cd-chip ${chipClass}`}>{chip}</span>
      </div>
      <h1 className="hp">{title}</h1>
      <p className="cap">{body}</p>
    </>
  );
}

function Stats({ journey, locale, now, third }: ViewProps & { third: { label: string; value: string } }) {
  const { t } = useTranslation();
  const last = journey.lastUpdate;
  let updated = "–";

  if (last) {
    const seconds = Math.max(0, Math.round((now - last.recordedAt) / 1000));
    updated = seconds < 120 ? t("common.seconds", { count: seconds }) : formatTime(last.recordedAt, locale);
  }

  return (
    <div className="stats">
      <div>
        <small>{t("web.updated")}</small>
        <b>{updated}</b>
      </div>
      <div>
        <small>{t("web.battery")}</small>
        <b>{last ? `${Math.round(last.battery * 100)}%` : "–"}</b>
      </div>
      <div>
        <small>{third.label}</small>
        <b>{third.value}</b>
      </div>
    </div>
  );
}

function Note({ icon, strong, rest, danger }: { icon: string; strong?: string; rest: string; danger?: boolean }) {
  return (
    <p className={danger ? "note note--danger" : "note"}>
      <span className="cd-icon">{icon}</span>
      <span>
        {strong ? <b>{strong} </b> : null}
        {rest}
      </span>
    </p>
  );
}

function Button({ href, icon, children, primary }: { href: string; icon: string; children: ReactNode; primary?: boolean }) {
  const demo = useContext(DemoContext);
  const className = `cd-btn cd-btn--lg ${primary ? "cd-btn--primary cd-btn--full" : "cd-btn--secondary"}`;

  // On the demo server the button stays where it is, greyed out, with no number behind it.
  if (demo) {
    return (
      <span className={`${className} is-off`} aria-disabled="true">
        <span className="cd-icon">{icon}</span>
        {children}
      </span>
    );
  }

  return (
    <a className={className} href={href}>
      <span className="cd-icon">{icon}</span>
      {children}
    </a>
  );
}

const tel = (n: string) => `tel:${n}`;

const sms = (n: string) => `sms:${n}`;

/** Screen 22: travelling, all well. */
function OnRoute({ journey, locale, now }: ViewProps) {
  const { t } = useTranslation();
  const name = journey.travellerName;
  const arrival = formatTime(journey.expectedArrivalAt, locale);

  return (
    <>
      <Head
        chip={t("journey.status.active")}
        chipClass="cd-chip--success"
        title={t("web.willArrive", { name, time: arrival })}
        body={t("web.toDestination", { destination: journey.destination.name })}
      />
      <Stats
        journey={journey}
        locale={locale}
        now={now}
        third={{ label: t("web.nextCheckIn"), value: journey.nextDeadlineAt ? formatTime(journey.nextDeadlineAt, locale) : "–" }}
      />
      <div className="pair">
        <Button href={tel(journey.travellerPhone)} icon="call">
          {t("web.call", { name })}
        </Button>
        <Button href={sms(journey.travellerPhone)} icon="chat">
          {t("web.message", { name })}
        </Button>
      </div>
      <p className="foot">
        <span className="cd-icon">timer_off</span>
        {t("web.linkStops", { name })}
      </p>
    </>
  );
}

/** Screen 23: Cage is asking the traveller; nothing for the circle to do yet. */
function CheckIn({ journey, locale, now }: ViewProps) {
  const { t } = useTranslation();
  const name = journey.travellerName;

  return (
    <>
      <Head
        chip={t("web.statusCheckIn")}
        chipClass="cd-chip--warning"
        title={t("web.checkInTitle", { name })}
        body={t("web.checkInBody", { name })}
      />
      <Stats
        journey={journey}
        locale={locale}
        now={now}
        third={{ label: t("web.answerBy"), value: journey.nextDeadlineAt ? formatTime(journey.nextDeadlineAt, locale) : "–" }}
      />
      <Button href={sms(journey.travellerPhone)} icon="chat">
        {t("web.message", { name })}
      </Button>
    </>
  );
}

/** When the hotline step starts: now, or ten minutes after the alert if nobody opened it. */
function hotlineValue(journey: CircleJourneyView, locale: Locale, now: string): string {
  if (!journey.alert || journey.alert.step === "hotline") return now;

  return formatTime(journey.alert.raisedAt + TIMERS.circleOpenTimeoutMs, locale);
}

/** Screen 24: no answer to the check-in, or SOS. */
function Alerted({ journey, locale, now }: ViewProps) {
  const { t } = useTranslation();
  const name = journey.travellerName;
  const raisedAt = journey.alert ? formatTime(journey.alert.raisedAt, locale) : "";
  const reason = journey.alert?.reason === "sos" ? "sos" : "no_answer";

  return (
    <>
      <Head
        chip={t("web.statusAlert", { time: raisedAt })}
        chipClass="cd-chip--danger"
        title={t(`web.alertTitle.${reason}`, { name })}
        body={t("web.alertBody", { name })}
      />
      <Stats
        journey={journey}
        locale={locale}
        now={now}
        third={{ label: t("web.hotline"), value: hotlineValue(journey, locale, t("web.hotlineNow")) }}
      />
      <Note icon="visibility_off" strong={t("web.messageFirst", { name })} rest={t("web.messageFirstWhy", { name })} />
      <Button href={tel(HOTLINES.national)} icon="support_agent" primary>
        {t("web.callHotline")}
      </Button>
      <div className="pair">
        <Button href={sms(journey.travellerPhone)} icon="chat">
          {t("web.message", { name })}
        </Button>
        {journey.policeEnabled ? <PoliceButton /> : <BlueDragonButton />}
      </div>
    </>
  );
}

/** Công an 113: offered only when the traveller turned police on (PRD, "Escalation ladder"). */
function PoliceButton() {
  const { t } = useTranslation();

  return (
    <Button href={tel(HOTLINES.police)} icon="local_police">
      {t("web.callPolice")}
    </Button>
  );
}

function BlueDragonButton() {
  const { t } = useTranslation();

  return (
    <Button href={tel(HOTLINES.blueDragon)} icon="volunteer_activism">
      {t("web.blueDragon")}
    </Button>
  );
}

/** Screen 24b: the duress PIN. Never suggest contacting the traveller. */
function Duress({ journey, locale, now }: ViewProps) {
  const { t } = useTranslation();
  const name = journey.travellerName;
  const raisedAt = journey.alert ? formatTime(journey.alert.raisedAt, locale) : "";

  return (
    <>
      <Head
        chip={t("web.statusDuress", { time: raisedAt })}
        chipClass="cd-chip--danger"
        title={t("web.alertTitle.duress", { name })}
        body={t("web.duressBody", { name })}
      />
      <Stats
        journey={journey}
        locale={locale}
        now={now}
        third={{ label: t("web.hotline"), value: hotlineValue(journey, locale, t("web.hotlineNow")) }}
      />
      <Note icon="do_not_disturb_on" strong={t("web.doNotContact", { name })} rest={t("web.doNotContactWhy")} danger />
      <Button href={tel(HOTLINES.national)} icon="support_agent" primary>
        {t("web.callHotline")}
      </Button>
      {journey.policeEnabled ? (
        <div className="pair">
          <BlueDragonButton />
          <PoliceButton />
        </div>
      ) : (
        <BlueDragonButton />
      )}
    </>
  );
}

/** Screen 15: the phone went quiet after the arrival time. Circle only, never police. */
function LostContact({ journey, locale, now }: ViewProps) {
  const { t } = useTranslation();
  const name = journey.travellerName;
  const last = journey.lastUpdate;
  const since = journey.alert ? Math.max(1, Math.round((now - journey.alert.raisedAt) / MINUTE_MS)) : 1;
  const arrival = formatTime(journey.expectedArrivalAt, locale);

  const body = last
    ? t("web.lostBody", {
        name,
        time: formatTime(last.recordedAt, locale),
        battery: `${Math.round(last.battery * 100)}%`,
        arrival,
      })
    : t("web.lostBodyNoUpdate", { name, arrival });

  return (
    <>
      <Head
        chip={t("web.statusLost", { duration: t("common.minutes", { count: since }) })}
        chipClass="cd-chip--warning"
        title={journey.likelyBatteryDied ? t("web.lostBatteryTitle", { name }) : t("web.lostTitle", { name })}
        body={body}
      />
      <div className="pair">
        <Button href={tel(journey.travellerPhone)} icon="call">
          {t("web.call", { name })}
        </Button>
        <Button href={tel(HOTLINES.national)} icon="support_agent">
          {t("web.callHotline")}
        </Button>
      </div>
    </>
  );
}
