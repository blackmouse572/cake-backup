import { formatTime, isLocale, type Locale } from "@cage/i18n";
import { CODE_LENGTH, TIMERS, type JourneyView, type Place } from "@cage/shared";
import { space } from "@cage/ui-tokens";
import { useCallback, useEffect, useReducer, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { DEMO } from "../auth";
import { useTranslation } from "../i18n";
import { currentJourney, enterCode, fetchJourney, forgetJourney, sendSos, sendUpdate, startJourney } from "../services/journey.service";
import { fetchMe } from "../services/auth.service";
import { allowLocation, watchReadings } from "../services/places.service";
import { dismissCalls, registerForCalls, useCallTaps, type CallPush } from "../services/push.service";
import { saveSettings } from "../services/settings.service";
import { color, text } from "../theme";
import { BackBar, Caption, CodeDots, Icon, IconButton, IconLine, Keypad, Note, PrimaryButton, Screen, Title } from "../ui";
import { CallDots, CallKeypad, InCall, IncomingCall } from "./call-screen";
import { FakeCallPicker, FakeCallScreen, useFakeCallClock } from "./fake-call";
import { fakeCallOff, fakeCallReducer, secondsUntilRing, type FakeCall, type FakeCallAction } from "./fake-call.reducer";
import { initialJourneyFlow, journeyReducer, type CallScreen, type CodeEntry, type JourneyAction, type SosState } from "./journey.reducer";
import { PlanView } from "./plan";
import { SosButton } from "./sos-button";

/** How often the open app asks the server what to show (a check-in, an alert). Quicker in the demo build, so the stage keeps up with the dashboard. */
const POLL_MS = DEMO ? 2_000 : 10_000;

/** How often the phone sends its position, and after how many metres. PRD: every 30 to 60 seconds. */
const UPDATE_MS = 30_000;

const UPDATE_DISTANCE_M = 25;

const MINUTE_MS = 60_000;

const SECOND_MS = 1_000;

/** A short buzz when a code on the call is wrong: the call screen can't show words. */
const WRONG_BUZZ_MS = 200;

/**
 * A journey on the traveller's phone: plan (01), on route (02), "are you
 * safe?" (03), alert sent (04) and the code screens (26, 26b). The flow is
 * `journeyReducer`; this file draws it and talks to the services.
 * Screen 01 (search, route, travel time) is `PlanView` in plan.tsx.
 * The fake call (02f and the call screens) is `fakeCallReducer`, and stays on the phone.
 */
export function JourneyFlow({ onSettings }: { onSettings: () => void }) {
  const { t, i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "vi";
  const [state, dispatch] = useReducer(journeyReducer, initialJourneyFlow);
  const travelling = state.name === "travelling" ? state : null;
  const id = travelling?.journey.id ?? null;
  const token = travelling?.token ?? null;
  const submit = travelling?.code?.submit ?? null;
  const purpose = travelling?.code?.purpose ?? null;
  const checkingIn = travelling?.journey.status === "check_in";
  const [callerName, setCallerName] = useState("");

  // Registers this phone for check-in calls, and learns who they look like they're from (screen 14).
  useEffect(() => {
    void registerForCalls({ ring: t("call.channelRing"), vibrate: t("call.channelVibrate") });
    void fetchMe()
      .then((me) => setCallerName(me.callerName))
      .catch(() => {});
  }, [t]);

  // A check-in call opened from the lock screen rings in the app; the poll then catches up with the server.
  const onCallTap = useCallback((call: CallPush) => dispatch({ type: "ring", call: call.call }), []);
  useCallTaps(onCallTap);

  // During a check-in, the clock decides when the second call rings on screen.
  useEffect(() => {
    if (!checkingIn) return;
    const timer = setInterval(() => dispatch({ type: "clock", now: Date.now() }), SECOND_MS);

    return () => clearInterval(timer);
  }, [checkingIn]);

  const [fakeCall, dispatchFakeCall] = useReducer(fakeCallReducer, fakeCallOff);
  // The fake call is for a calm trip. Once Cage asks or alerts, that screen comes first.
  const calm = travelling?.journey.status === "active";

  useFakeCallClock(fakeCall, dispatchFakeCall);

  useEffect(() => {
    if (!calm) dispatchFakeCall({ type: "stop" });
  }, [calm]);

  // Picks up a journey that was running when the app closed.
  useEffect(() => {
    void currentJourney().then(async (current) => {
      if (!current) return;
      const view = await fetchJourney(current.id);

      if (view === "gone" || (view !== "error" && view.status === "ended")) await forgetJourney();
      else if (view !== "error") dispatch({ type: "started", journey: view, token: current.token });
    });
  }, []);

  // Asks the server what to show: the server runs the timers, not the phone.
  useEffect(() => {
    if (!id) return;

    const timer = setInterval(() => {
      void fetchJourney(id).then((view) => {
        if (view === "gone") dispatch({ type: "gone" });
        else if (view !== "error") dispatch({ type: "view", journey: view });
      });
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [id]);

  // Sends the phone's position with the journey token while the trip runs.
  useEffect(() => {
    if (!id || !token) return;
    let stop: (() => void) | null = null;
    let stopped = false;

    void watchReadings(UPDATE_MS, UPDATE_DISTANCE_M, (reading) => {
      void sendUpdate({ id, token }, reading).then((view) => {
        if (view !== "error") dispatch({ type: "view", journey: view });
      });
    }).then((unsubscribe) => {
      if (stopped) unsubscribe();
      else stop = unsubscribe;
    });

    return () => {
      stopped = true;
      stop?.();
    };
  }, [id, token]);

  // Sends a code once four digits are in.
  useEffect(() => {
    if (!id || !submit || !purpose) return;

    void enterCode(id, purpose, submit).then(async (result) => {
      if (result === "ok" && purpose === "end") await forgetJourney();

      if (result === "ok") void dismissCalls();
      else if (result === "wrong_code") Vibration.vibrate(WRONG_BUZZ_MS);
      dispatch({ type: "codeResult", result });
    });
  }, [id, submit, purpose]);

  async function start(destination: Place, travelMs: number, route: string | null) {
    dispatch({ type: "start" });

    if (!(await allowLocation())) return dispatch({ type: "startFailed", problem: "need_location" });

    // The server picks the circle's language from settings, so it must know the one on screen now. Failing to say isn't a reason not to start.
    await saveSettings({ locale });

    const started = await startJourney({
      destination: { name: destination.name, lat: destination.lat, lng: destination.lng },
      expectedArrivalAt: Date.now() + travelMs,
      route: route || undefined,
      lostContactEnabled: true,
      locale,
    });

    if (started === "no_codes" || started === "error") return dispatch({ type: "startFailed", problem: "error" });
    dispatch({ type: "started", journey: started.journey, token: started.journeyToken });
  }

  /** Held for a second: the server alerts the circle, and the phone shows what it answers. A failure is shown, never swallowed. */
  async function raiseSos() {
    if (!id) return;
    dispatch({ type: "sosSending" });
    const view = await sendSos(id);

    if (view === "error") return dispatch({ type: "sosFailed" });

    if (view === "gone") return dispatch({ type: "gone" });
    dispatch({ type: "view", journey: view });
    dispatch({ type: "sosSent" });
  }

  switch (state.name) {
    case "plan":
      return <PlanView busy={state.busy} problem={state.problem} locale={locale} onStart={start} onSettings={onSettings} />;
    case "ended":
      return <EndedView onNewTrip={() => dispatch({ type: "newTrip" })} />;
    case "travelling":
      if (state.call) {
        return <CallView call={state.call} code={state.code} callerName={callerName || t("call.defaultCaller")} dispatch={dispatch} />;
      }

      if (calm && (fakeCall.name === "ringing" || fakeCall.name === "inCall")) return <FakeCallScreen state={fakeCall} dispatch={dispatchFakeCall} />;

      if (calm && fakeCall.name === "picking") return <FakeCallPicker state={fakeCall} dispatch={dispatchFakeCall} />;

      if (state.code) return <CodeView code={state.code} journey={state.journey} dispatch={dispatch} />;

      return (
        <TravellingView
          journey={state.journey}
          locale={locale}
          sos={state.sos}
          onSos={raiseSos}
          dispatch={dispatch}
          fakeCall={fakeCall}
          dispatchFakeCall={dispatchFakeCall}
        />
      );
  }
}

/**
 * The check-in call (12 ringing, 13 on the call). It looks like the phone's
 * own call screen; only the safe code (or the duress PIN, which looks the
 * same) ends the check-in. Declining or hanging up counts as no answer.
 */
function CallView({
  call,
  code,
  callerName,
  dispatch,
}: {
  call: CallScreen;
  code: CodeEntry | null;
  callerName: string;
  dispatch: (action: JourneyAction) => void;
}) {
  function hangUp() {
    void dismissCalls();
    dispatch({ type: "hangUp" });
  }

  if (call.phase === "ringing") {
    return <IncomingCall callerName={callerName} onAnswer={() => dispatch({ type: "answerCall", now: Date.now() })} onDecline={hangUp} />;
  }

  return (
    <InCall callerName={callerName} startedAt={call.startedAt} onHangUp={hangUp}>
      <CallDots length={CODE_LENGTH} filled={code?.entry.length ?? 0} />
      <CallKeypad onDigit={(digit) => dispatch({ type: "digit", digit })} />
    </InCall>
  );
}

/** The current time, ticking every second while `on`. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);

    return () => clearInterval(timer);
  }, [on]);

  return now;
}

/** Screens 02 (on route), 03 (are you safe?) and 04 (alert sent), by the server's status. */
function TravellingView({
  journey,
  locale,
  sos,
  onSos,
  dispatch,
  fakeCall,
  dispatchFakeCall,
}: {
  journey: JourneyView;
  locale: Locale;
  sos: SosState;
  onSos: () => void;
  dispatch: (action: JourneyAction) => void;
  fakeCall: FakeCall;
  dispatchFakeCall: (action: FakeCallAction) => void;
}) {
  const { t } = useTranslation();
  const asking = journey.status === "check_in";
  const now = useNow(true);

  if (asking) {
    // The answer window, before the one retry the server allows (TIMERS).
    const answerBy = (journey.nextDeadlineAt ?? now) - TIMERS.checkInRetryMs;
    const seconds = Math.max(0, Math.ceil((answerBy - now) / SECOND_MS));

    return (
      <Screen footer={<PrimaryButton label={t("checkIn.imSafe")} onPress={() => dispatch({ type: "openCode", purpose: "answer" })} />}>
        <Title style={{ marginTop: space[7] }}>{t("checkIn.question")}</Title>
        {journey.checkIn ? <Caption>{t(`checkIn.why.${journey.checkIn.reason}`)}</Caption> : null}
        <View style={styles.countdown}>
          <Text style={styles.seconds}>{seconds}</Text>
          <Text style={[text("title"), { color: color.fgSecondary }]}>{t("ask.seconds")}</Text>
        </View>
        <IconLine icon="notifications">{t("ask.autoAlert")}</IconLine>
        <SosButton state={sos} onSos={onSos} />
      </Screen>
    );
  }

  if (journey.status === "alerted" || journey.status === "lost_contact") {
    const lost = journey.status === "lost_contact";

    return (
      <Screen footer={<PrimaryButton label={t("checkIn.imSafe")} onPress={() => dispatch({ type: "openCode", purpose: "answer" })} />}>
        <View style={[styles.badge, { backgroundColor: color.dangerTint }]}>
          <Icon name={lost ? "wifi_off" : "notifications"} size={28} tint={color.dangerText} />
        </View>
        <Title style={{ marginTop: space[5] }}>{t(lost ? "alerted.lostTitle" : "alerted.title")}</Title>
        <Caption>{t(lost ? "alerted.lostBody" : "alerted.body")}</Caption>
        {/* Lost contact only told the circle calmly; SOS raises it. */}
        {lost ? <SosButton state={sos} onSos={onSos} /> : null}
      </Screen>
    );
  }

  const minutesLeft = Math.max(0, Math.round((journey.expectedArrivalAt - now) / MINUTE_MS));
  const ringIn = secondsUntilRing(fakeCall, now);

  return (
    <Screen footer={<PrimaryButton label={t("journey.end")} onPress={() => dispatch({ type: "openCode", purpose: "end" })} />}>
      <View style={styles.arrivalRow}>
        <View style={styles.arrival}>
          <Text style={styles.arrivalTime}>{formatTime(journey.expectedArrivalAt, locale)}</Text>
          <Text style={[text("title"), { color: color.fgSecondary }]}>{t("onRoute.arrive")}</Text>
        </View>
        <IconButton icon="call" label={t("fakeCall.open")} onPress={() => dispatchFakeCall({ type: "open" })} />
      </View>
      <Text style={[text("body"), { color: color.fgSecondary }]}>{t("onRoute.left", { minutes: minutesLeft })}</Text>
      <View style={styles.lines}>
        <IconLine icon="location_on">{journey.destination.name}</IconLine>
        <IconLine icon="group">{t("onRoute.sharing")}</IconLine>
        {fakeCall.name === "waiting" && ringIn !== null ? (
          <View style={styles.waiting}>
            <View style={{ flex: 1 }}>
              <IconLine icon="schedule">{t("fakeCall.waiting", { name: fakeCall.callerName, count: ringIn })}</IconLine>
            </View>
            <Pressable accessibilityRole="button" onPress={() => dispatchFakeCall({ type: "stop" })} hitSlop={12}>
              <Text style={[text("caption"), { color: color.fgPrimary }]}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <SosButton state={sos} onSos={onSos} />
    </Screen>
  );
}

/** Screens 26 (answer a check-in) and 26b (end the trip). */
function CodeView({
  code,
  journey,
  dispatch,
}: {
  code: CodeEntry;
  journey: JourneyView;
  dispatch: (action: JourneyAction) => void;
}) {
  const { t } = useTranslation();
  const answering = code.purpose === "answer";
  const now = useNow(answering);
  const answerBy = (journey.nextDeadlineAt ?? now) - TIMERS.checkInRetryMs;
  const seconds = Math.max(0, Math.ceil((answerBy - now) / SECOND_MS));
  const problems = { wrong_code: "enterCode.wrong", too_many_tries: "enterCode.tooMany", error: "plan.error" } as const;

  return (
    <Screen
      footer={
        <>
          {answering ? (
            <Text style={[text("caption"), styles.forgot]}>{t("enterCode.forgot")}</Text>
          ) : null}
          <Keypad onDigit={(d) => dispatch({ type: "digit", digit: d })} onDelete={() => dispatch({ type: "delete" })} />
        </>
      }
    >
      <BackBar close onBack={() => dispatch({ type: "closeCode" })} />
      <Title>{t(answering ? "enterCode.title" : "enterCode.endTitle")}</Title>
      {answering ? null : <Caption>{t("enterCode.endBody")}</Caption>}
      <View style={{ marginTop: space[7], alignItems: "center", gap: space[3] }}>
        <CodeDots length={CODE_LENGTH} filled={code.entry.length} />
        {answering && journey.status === "check_in" ? (
          <Text style={[text("caption"), { color: color.fgSecondary }]}>{t("enterCode.left", { count: seconds })}</Text>
        ) : null}
      </View>
      {code.problem ? <Note tone="danger">{t(problems[code.problem])}</Note> : null}
    </Screen>
  );
}

function EndedView({ onNewTrip }: { onNewTrip: () => void }) {
  const { t } = useTranslation();

  return (
    <Screen footer={<PrimaryButton label={t("arrived.again")} onPress={onNewTrip} />}>
      <View style={[styles.badge, { backgroundColor: color.successTint, marginTop: space[7] }]}>
        <Icon name="flag" size={28} tint={color.successText} />
      </View>
      <Title style={{ marginTop: space[5] }}>{t("arrived.title")}</Title>
      <Caption>{t("arrived.body")}</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: space[7] },
  arrivalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[7] },
  arrival: { flexDirection: "row", alignItems: "baseline", gap: space[2] },
  waiting: { flexDirection: "row", alignItems: "center", gap: space[3] },
  arrivalTime: { fontSize: 48, lineHeight: 56, fontWeight: "500", color: color.fgPrimary },
  lines: { marginTop: space[6], gap: space[3] },
  countdown: { flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: space[5], marginBottom: space[5] },
  seconds: { fontSize: 64, lineHeight: 72, fontWeight: "500", color: color.fgPrimary, fontVariant: ["tabular-nums"] },
  forgot: { textAlign: "center", color: color.fgSecondary, marginBottom: space[3] },
});
