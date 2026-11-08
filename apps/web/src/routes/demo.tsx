import { formatDistance, formatTime, type Locale } from "@cage/i18n";
import {
  besideRoute,
  fallbackStart,
  metresBetween,
  metresLeft,
  TIMERS,
  walkRoute,
  type DemoJourneyView,
  type DemoMessage,
  type DemoTraveller,
  type LatLng,
} from "@cage/shared";
import { createFileRoute } from "@tanstack/react-router";
import mapCss from "maplibre-gl/dist/maplibre-gl.css?url";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Mark } from "../brand";
import { LiveJourney } from "../components/circle-view";
import { DemoRouteMap } from "../components/demo-route-map";
import { LocaleProvider } from "../i18n";
import { demoControl, demoTravellers, demoTrip, getLocale, type DemoRefusal } from "../server/functions";

/** How often the dashboard refreshes, and how often it moves the traveller along the fake route. */
const TICK_MS = 3_000;

/** Steps on the fake route at 1× speed: about three minutes from start to door. */
const ROUTE_STEPS = 60;

const SPEEDS = [1, 2, 5] as const;

/** Battery used per step, so the circle sees it go down. */
const BATTERY_DRAIN = 0.002;

const START_BATTERY = 0.64;

const SECOND_MS = 1_000;

const KEY_STORE = "cage.demo.key";

const Stored = z.object({ key: z.string() });

/**
 * The hackathon demo dashboard (canvas page "Demo dashboard", D1 to D4).
 * The traveller starts a real trip on their own phone; this page picks that
 * trip and sets its states: a fake route instead of the phone's GPS, the
 * check-in, no answer and the phone going quiet. Codes are only ever typed
 * on the phone. Works only against an API with DEMO_MODE and a demo key.
 */
export const Route = createFileRoute("/demo")({
  validateSearch: z.object({ lang: z.string().optional() }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ deps }) => getLocale({ data: deps }),
  head: () => ({
    meta: [{ title: "Cage demo" }, { name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }],
    links: [{ rel: "stylesheet", href: mapCss }],
  }),
  // The demo key lives in this tab's session storage, which the server can't see.
  ssr: false,
  component: DemoPage,
});

function DemoPage() {
  const { locale } = Route.useLoaderData();

  return (
    <LocaleProvider locale={locale}>
      <Dashboard locale={locale} />
    </LocaleProvider>
  );
}

type Unlocked = { key: string };

function readStored(): Unlocked | null {
  try {
    const stored = Stored.safeParse(JSON.parse(sessionStorage.getItem(KEY_STORE) ?? "null"));

    return stored.success ? stored.data : null;
  } catch {
    return null;
  }
}

function store(value: Unlocked | null) {
  try {
    if (value) sessionStorage.setItem(KEY_STORE, JSON.stringify(value));
    else sessionStorage.removeItem(KEY_STORE);
  } catch {
    // Private windows can refuse storage; the page then asks for the key again after a reload.
  }
}

/** The current time, ticking every second. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);

    return () => clearInterval(timer);
  }, []);

  return now;
}

/** "0:42": minutes and seconds left until `until`. */
function left(until: number, now: number): string {
  const ms = Math.max(0, until - now);

  return `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1_000)).padStart(2, "0")}`;
}

function Dashboard({ locale }: { locale: Locale }) {
  // The route renders only in the browser (`ssr: false`), so the stored key can be read straight away.
  const [unlocked, setUnlocked] = useState<Unlocked | null>(readStored);
  const [tripId, setTripId] = useState<string | null>(null);

  const lock = useCallback(() => {
    store(null);
    setUnlocked(null);
    setTripId(null);
  }, []);

  function unlock(key: string) {
    const value = { key };
    store(value);
    setUnlocked(value);
  }

  return (
    <div className="dash" lang={locale}>
      <Band />
      {unlocked && tripId ? (
        <Drive
          demoKey={unlocked.key}
          id={tripId}
          locale={locale}
          onSwitch={() => setTripId(null)}
          onLock={lock}
        />
      ) : (
        <Pick unlocked={unlocked} onUnlock={unlock} onPick={setTripId} onLock={lock} />
      )}
    </div>
  );
}

/** The DEMO band on every screen of the dashboard: a separate server, nothing sent, no calls. */
function Band() {
  const { t } = useTranslation();

  return (
    <div className="band">
      <b>{t("demo.pill")}</b>
      <span className="cd-icon">science</span>
      <span className="band__text">{t("demo.band")}</span>
    </div>
  );
}

function Top({ title, chip, children }: { title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <header className="top">
      <span className="brand">
        <Mark size={26} />
        Cage
      </span>
      <span className="vr" />
      <h1 className="ttl">{title}</h1>
      {chip}
      <span className="sp" />
      {children}
    </header>
  );
}

function LockButton({ onLock }: { onLock: () => void }) {
  const { t } = useTranslation();

  return (
    <button className="cd-btn cd-btn--ghost cd-btn--md" onClick={onLock}>
      <span className="cd-icon">lock</span>
      {t("demo.lock")}
    </button>
  );
}

const refusals = { off: "demo.off", wrong_key: "demo.wrongKey", locked: "demo.locked" } as const;

/** D1: unlock with the demo key, then choose who is travelling. */
function Pick({
  unlocked,
  onUnlock,
  onPick,
  onLock,
}: {
  unlocked: Unlocked | null;
  onUnlock: (key: string) => void;
  onPick: (id: string) => void;
  onLock: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [refused, setRefused] = useState<DemoRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const [travellers, setTravellers] = useState<DemoTraveller[]>([]);
  const key = unlocked?.key ?? null;

  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = new AbortController();

    const load = () =>
      void demoTravellers({ data: { key } }).then((r) => {
        if (stop.signal.aborted) return;

        if ("refused" in r) return onLock();
        setTravellers(r.travellers);
        timer = setTimeout(load, TICK_MS);
      });

    load();

    return () => {
      stop.abort();
      clearTimeout(timer);
    };
  }, [key, onLock]);

  async function tryKey() {
    setBusy(true);
    const r = await demoTravellers({ data: { key: typed.trim() } });
    setBusy(false);

    if ("refused" in r) return setRefused(r.refused);
    setRefused(null);
    setTravellers(r.travellers);
    onUnlock(typed.trim());
  }

  return (
    <>
      <Top title={t("demo.title")}>{unlocked ? <LockButton onLock={onLock} /> : null}</Top>
      <main className="pick">
        <section className="pick__side">
          {unlocked ? (
            <div className="card row">
              <span className="cd-icon ok">check_circle</span>
              <b>{t("demo.unlocked")}</b>
            </div>
          ) : (
            <form
              className="card unlock"
              onSubmit={(e) => {
                e.preventDefault();
                void tryKey();
              }}
            >
              <label className="field">
                <span className="small">{t("demo.keyLabel")}</span>
                <input type="password" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </label>
              {refused ? <p className="cap bad">{t(refusals[refused])}</p> : null}
              <button className="cd-btn cd-btn--primary cd-btn--md" disabled={busy || typed.trim().length === 0}>
                <span className="cd-icon">lock_open</span>
                {t("demo.unlock")}
              </button>
            </form>
          )}
        </section>
        <section className={`pick__main ${unlocked ? "" : "is-off"}`}>
          <h2 className="hp">{t("demo.pickTitle")}</h2>
          <p className="cap">{t("demo.pickBody")}</p>
          <div className="people">
            {travellers.length === 0 ? <p className="card cap">{t("demo.nobody")}</p> : null}
            {travellers.map((p) => (
              <button key={p.journeyId} className="person" onClick={() => onPick(p.journeyId)}>
                <span className="av">{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="person__text">
                  <b>{p.name}</b>
                  <span className="small">
                    {t("demo.pickRow", { destination: p.destination, time: formatTime(p.startedAt, "vi") })}
                  </span>
                </span>
                <StatusChip status={p.status} small />
                <span className="cd-icon">chevron_right</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function StatusChip({ status, small }: { status: DemoTraveller["status"]; small?: boolean }) {
  const { t } = useTranslation();
  const tone = status === "active" ? "success" : status === "check_in" ? "warning" : "danger";

  return (
    <span className={`cd-chip cd-chip--${tone} ${small ? "cd-chip--sm" : ""}`}>
      <span className={`dot dot--${tone}`} />
      {t(`journey.status.${status}`)}
    </span>
  );
}

type Trip = { journey: DemoJourneyView; log: DemoMessage[]; now: number };

type LocalEntry = { at: number; text: string };

type Control = Parameters<typeof demoControl>[0]["data"]["control"];

/** D2 to D4: one traveller's trip, its states and what the circle sees. */
function Drive({
  demoKey,
  id,
  locale,
  onSwitch,
  onLock,
}: {
  demoKey: string;
  id: string;
  locale: Locale;
  onSwitch: () => void;
  onLock: () => void;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [gone, setGone] = useState(false);
  const [route, setRoute] = useState<LatLng[] | null>(null);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(SPEEDS[1]);
  const [off, setOff] = useState<LatLng | null>(null);
  const [local, setLocal] = useState<LocalEntry[]>([]);
  const battery = useRef(START_BATTERY);

  const note = useCallback((text: string) => setLocal((l) => [{ at: Date.now(), text }, ...l]), []);

  const control = useCallback(
    (c: Control) => demoControl({ data: { key: demoKey, id, control: c } }),
    [demoKey, id],
  );

  // Refreshes the trip, its log and the circle's page.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = new AbortController();

    const load = () =>
      void demoTrip({ data: { key: demoKey, id } }).then((next) => {
        if (stop.signal.aborted) return;

        if (!next) return setGone(true);
        setTrip(next);
        // The fake route starts where the phone first reported (or near the destination if it never did).
        setRoute((known) => {
          if (known) return known;
          battery.current = next.journey.lastUpdate?.battery ?? START_BATTERY;

          return walkRoute(next.journey.lastUpdate ?? fallbackStart(next.journey.destination), next.journey.destination, ROUTE_STEPS);
        });
        timer = setTimeout(load, TICK_MS);
      });

    load();

    return () => {
      stop.abort();
      clearTimeout(timer);
    };
  }, [demoKey, id]);

  const journey = trip?.journey ?? null;

  // Walks the traveller along, or holds them where they left the route, every tick.
  const status = journey?.status ?? "active";
  const danger = status === "alerted" || status === "lost_contact";

  useEffect(() => {
    if (!route || status === "ended") return;

    const timer = setInterval(() => {
      const next = paused || off ? step : Math.min(step + speed, route.length - 1);
      const at = off ?? route[next]!;
      battery.current = Math.max(0.05, battery.current - BATTERY_DRAIN);
      setStep(next);
      void control({ kind: "move", move: { ...at, battery: battery.current } });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [route, step, speed, paused, off, status, control]);

  if (gone) {
    return (
      <>
        <Top title={t("demo.title")}>
          <LockButton onLock={onLock} />
        </Top>
        <main className="pick">
          <p className="card cap">{t("demo.gone")}</p>
          <button className="cd-btn cd-btn--secondary cd-btn--md" onClick={onSwitch}>
            <span className="cd-icon">group</span>
            {t("demo.switch")}
          </button>
        </main>
      </>
    );
  }

  if (!trip || !journey || !route) return <Top title={t("demo.title")}>{null}</Top>;

  const name = journey.travellerName;
  const toGo = off ? 0 : metresLeft(route, step);
  const heard = Math.max(0, Math.round((trip.now - journey.lastHeardAt) / SECOND_MS));

  async function goOff() {
    if (!route) return;
    setOff(besideRoute(route, step));
    note(t("demo.logOff"));
    await control({ kind: "check-in" });
    note(t("demo.logAsk"));
  }

  async function act(kind: "check-in" | "skip" | "lose-contact", text: string) {
    await control({ kind });
    note(text);
  }

  async function restart() {
    if (!window.confirm(t("demo.restartConfirm"))) return;
    await control({ kind: "delete" });
    onSwitch();
  }

  return (
    <>
      <Top title={t("demo.tripOf", { name })} chip={<HeadChip journey={journey} offRoute={off !== null} now={now} />}>
        <span className="cd-chip">
          <span className="cd-icon">smartphone</span>
          {t("demo.heard", { seconds: heard })}
        </span>
        <button className="cd-btn cd-btn--secondary cd-btn--md" onClick={onSwitch}>
          <span className="cd-icon">group</span>
          {t("demo.switch")}
        </button>
        <button className="cd-btn cd-btn--secondary cd-btn--md" onClick={() => void restart()}>
          <span className="cd-icon">restart_alt</span>
          {t("demo.restart")}
        </button>
        <LockButton onLock={onLock} />
      </Top>
      <main className="grid">
        <section className="col">
          <Panel icon="route" title={t("demo.route")}>
            <DemoRouteMap route={route} step={step} off={off} danger={danger} />
            <div className="row" style={{ marginTop: 12 }}>
              {off ? (
                <span className="cap bad">
                  {t("demo.routeOff", { distance: formatDistance(metresBetween(off, route[step]!), locale) })}
                </span>
              ) : (
                <span className="cap ink">{t("demo.routeFrom", { name, destination: journey.destination.name })}</span>
              )}
              <span className="sp" />
              <span className="small">
                {off
                  ? t("demo.routeOffNote")
                  : t("demo.routeLeft", {
                      distance: formatDistance(toGo, locale),
                      time: formatTime(journey.expectedArrivalAt, locale),
                    })}
              </span>
            </div>
            <div className="prog">
              <i style={{ width: `${(step / (route.length - 1)) * 100}%` }} />
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="cd-btn cd-btn--secondary cd-btn--md" onClick={() => setPaused((p) => !p)}>
                <span className="cd-icon">{paused ? "play_arrow" : "pause"}</span>
                {paused ? t("demo.resume") : t("demo.pause")}
              </button>
              <span className="seg" role="radiogroup">
                {SPEEDS.map((s) => (
                  <button key={s} role="radio" aria-checked={s === speed} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>
                    {s}×
                  </button>
                ))}
              </span>
              <span className="sp" />
              {off ? (
                <button
                  className="cd-btn cd-btn--secondary cd-btn--md"
                  disabled={status !== "active"}
                  onClick={() => {
                    setOff(null);
                    note(t("demo.logOn"));
                  }}
                >
                  <span className="cd-icon">u_turn_left</span>
                  {t("demo.backOn")}
                </button>
              ) : (
                <button className="cd-btn cd-btn--secondary cd-btn--md" disabled={status !== "active"} onClick={() => void goOff()}>
                  <span className="cd-icon">alt_route</span>
                  {t("demo.goOff")}
                </button>
              )}
            </div>
          </Panel>
          <Panel icon="tune" title={t("demo.states")}>
            <div className="states">
              <Tile on={status === "active"} tone="success" title={t("demo.stateSafe")}>
                <TileButton
                  icon="directions_walk"
                  disabled={!off || status !== "active"}
                  onClick={() => {
                    setOff(null);
                    note(t("demo.logOn"));
                  }}
                >
                  {t("demo.backOn")}
                </TileButton>
              </Tile>
              <Tile on={status === "check_in"} tone="warning" title={t("demo.stateCall")}>
                <TileButton icon="ring_volume" disabled={status !== "active"} onClick={() => void act("check-in", t("demo.logAsk"))}>
                  {t("demo.askNow")}
                </TileButton>
              </Tile>
              <Tile on={danger} tone="danger" title={t("demo.stateDanger")}>
                <TileButton icon="phone_missed" disabled={status !== "check_in"} onClick={() => void act("skip", t("demo.logSkip"))}>
                  {t("demo.noAnswer")}
                </TileButton>
                <TileButton
                  icon="signal_disconnected"
                  disabled={status !== "active" && status !== "check_in"}
                  onClick={() => void act("lose-contact", t("demo.logQuiet"))}
                >
                  {t("demo.goQuiet")}
                </TileButton>
              </Tile>
            </div>
          </Panel>
          <Panel
            icon="receipt_long"
            title={t("demo.log")}
            grow
            aside={
              <span className="cd-chip cd-chip--sm cd-chip--warning">
                <span className="cd-icon">block</span>
                {t("demo.notSent")}
              </span>
            }
          >
            <Log messages={trip.log} local={local} locale={locale} />
          </Panel>
        </section>
        <section className="col">
          <p className="lab">{t("demo.circleSees")}</p>
          <div className="phone">
            <LiveJourney journey={journey} locale={locale} now={trip.now} />
          </div>
          <p className="lab">{t("demo.trip")}</p>
          <TripCard journey={journey} locale={locale} />
          <Panel icon="group" title={t("demo.circle")} aside={<span className="small">{t("demo.people", { count: journey.circle.length })}</span>}>
            {journey.circle.map((c) => (
              <div className="ct" key={`${c.name}${c.phone}`}>
                <span className="av">{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="ct__text">
                  <b>{c.name}</b>
                  <span className="small">{c.phone}</span>
                </span>
              </div>
            ))}
          </Panel>
        </section>
      </main>
    </>
  );
}

function HeadChip({ journey, offRoute, now }: { journey: DemoJourneyView; offRoute: boolean; now: number }) {
  const { t } = useTranslation();
  const at = journey.alert ? formatTime(journey.alert.raisedAt, journey.locale) : "";

  switch (journey.status) {
    case "check_in": {
      const answerBy = (journey.nextDeadlineAt ?? now) - TIMERS.checkInRetryMs;

      return (
        <span className="cd-chip cd-chip--warning">
          <span className="dot dot--warning" />
          {t("demo.chipCheckIn", { time: left(answerBy, now) })}
        </span>
      );
    }

    case "alerted":
    case "lost_contact": {
      const text =
        journey.status === "lost_contact"
          ? t("demo.chipLost", { time: at })
          : journey.alert?.reason === "duress"
            ? t("demo.chipDuress", { time: at })
            : t("demo.chipNoAnswer", { time: at });

      return (
        <span className="cd-chip cd-chip--danger">
          <span className="dot dot--danger" />
          {text}
        </span>
      );
    }

    case "active":
      return (
        <span className="cd-chip cd-chip--success">
          <span className="dot dot--success" />
          {offRoute ? t("demo.chipSafeOff") : t("demo.chipSafe")}
        </span>
      );

    case "ended":
      return <span className="cd-chip">{t("journey.status.ended")}</span>;
  }
}

function Panel({
  icon,
  title,
  aside,
  grow,
  children,
}: {
  icon: string;
  title: string;
  aside?: ReactNode;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`panel ${grow ? "panel--grow" : ""}`}>
      <div className="panel__h">
        <span className="cd-icon">{icon}</span>
        {title}
        <span className="sp" />
        {aside}
      </div>
      <div className="panel__b">{children}</div>
    </div>
  );
}

function Tile({ on, tone, title, children }: { on: boolean; tone: string; title: string; children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className={`st ${on ? "cur" : ""}`}>
      {on ? <span className="now">{t("demo.running")}</span> : null}
      <span className="st__h">
        <span className={`dot dot--${tone}`} />
        {title}
      </span>
      {children}
    </div>
  );
}

function TileButton({
  icon,
  disabled,
  onClick,
  children,
}: {
  icon: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className="cd-btn cd-btn--secondary cd-btn--sm" disabled={disabled} onClick={onClick}>
      <span className="cd-icon">{icon}</span>
      {children}
    </button>
  );
}

function TripCard({ journey, locale }: { journey: DemoJourneyView; locale: Locale }) {
  const { t } = useTranslation();
  const next = journey.nextDeadlineAt ? formatTime(journey.nextDeadlineAt, locale) : "–";
  const battery = journey.lastUpdate ? `${Math.round(journey.lastUpdate.battery * 100)}%` : "–";

  return (
    <div className="panel">
      <div className="panel__b">
        <p className="hp">{t("demo.to", { destination: journey.destination.name })}</p>
        <dl className="kv">
          <dt>{t("demo.started")}</dt>
          <dd>{formatTime(journey.startedAt, locale)}</dd>
          <dt>{t("demo.arrive")}</dt>
          <dd>{formatTime(journey.expectedArrivalAt, locale)}</dd>
          {journey.alert ? (
            <>
              <dt>{t("demo.alarm")}</dt>
              <dd className="bad">{formatTime(journey.alert.raisedAt, locale)}</dd>
            </>
          ) : (
            <>
              <dt>{t("demo.check")}</dt>
              <dd>{journey.status === "check_in" ? t("demo.checkWaiting", { time: next }) : next}</dd>
            </>
          )}
          <dt>{t("demo.battery")}</dt>
          <dd>
            <span className="cd-icon ink">battery_5_bar</span> {battery}
          </dd>
        </dl>
      </div>
    </div>
  );
}

function Log({ messages, local, locale }: { messages: DemoMessage[]; local: LocalEntry[]; locale: Locale }) {
  const { t } = useTranslation();

  const rows = [
    ...messages.map((m) => ({ at: m.sentAt, text: t("demo.logSms", { name: m.to, text: m.text }), sms: true })),
    ...local.map((l) => ({ at: l.at, text: l.text, sms: false })),
  ].toSorted((a, b) => b.at - a.at);

  return (
    <ul className="log">
      {rows.map((r, i) => (
        <li key={`${r.at}-${i}`}>
          <time>{formatTime(r.at, locale)}</time>
          <span className="t" title={r.text}>
            {r.text}
          </span>
          <span className="cd-icon" aria-label={t(r.sms ? "demo.logOnlyLogged" : "demo.byDashboard")}>
            {r.sms ? "sms" : "tune"}
          </span>
        </li>
      ))}
    </ul>
  );
}
