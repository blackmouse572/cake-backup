import { formatTime, isLocale, type Locale } from "@cage/i18n";
import { CODE_LENGTH, TIMERS, type JourneyView } from "@cage/shared";
import { layout, space } from "@cage/ui-tokens";
import { useEffect, useReducer, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DEMO } from "../auth";
import { useTranslation } from "../i18n";
import { currentJourney, enterCode, fetchJourney, forgetJourney, sendSos, sendUpdate, startJourney } from "../services/journey.service";
import { allowLocation, findPlace, watchReadings } from "../services/places.service";
import { saveSettings } from "../services/settings.service";
import { color, radius, text } from "../theme";
import { BackBar, Caption, CodeDots, Icon, IconLine, Keypad, Note, PrimaryButton, Screen, Title } from "../ui";
import { initialJourneyFlow, journeyReducer, type CodeEntry, type JourneyAction, type SosState } from "./journey.reducer";
import { SosButton } from "./sos-button";

/** How often the open app asks the server what to show (a check-in, an alert). Quicker in the demo build, so the stage keeps up with the dashboard. */
const POLL_MS = DEMO ? 2_000 : 10_000;

/** How often the phone sends its position, and after how many metres. PRD: every 30 to 60 seconds. */
const UPDATE_MS = 30_000;

const UPDATE_DISTANCE_M = 25;

/** Arrival choices on screen 01, in minutes. Route times come with the map provider (#15). */
const ARRIVAL_CHOICES = [15, 30, 45, 60] as const;

const MINUTE_MS = 60_000;

const SECOND_MS = 1_000;

/**
 * A journey on the traveller's phone: plan (01), on route (02), "are you
 * safe?" (03), alert sent (04) and the code screens (26, 26b). The flow is
 * `journeyReducer`; this file draws it and talks to the services.
 *
 * Without a map provider yet (#15), screen 01 takes a typed address and an
 * arrival time, and the phone's own geocoder finds it.
 */
export function JourneyFlow({ onSettings }: { onSettings: () => void }) {
  const { i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "vi";
  const [state, dispatch] = useReducer(journeyReducer, initialJourneyFlow);
  const travelling = state.name === "travelling" ? state : null;
  const id = travelling?.journey.id ?? null;
  const token = travelling?.token ?? null;
  const submit = travelling?.code?.submit ?? null;
  const purpose = travelling?.code?.purpose ?? null;

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
      dispatch({ type: "codeResult", result });
    });
  }, [id, submit, purpose]);

  async function start(destination: string, minutes: number) {
    dispatch({ type: "start" });

    if (!(await allowLocation())) return dispatch({ type: "startFailed", problem: "need_location" });
    const place = await findPlace(destination);

    if (!place) return dispatch({ type: "startFailed", problem: "not_found" });

    // The server picks the circle's language from settings, so it must know the one on screen now. Failing to say isn't a reason not to start.
    await saveSettings({ locale });

    const started = await startJourney({
      destination: { name: destination.trim(), ...place },
      expectedArrivalAt: Date.now() + minutes * MINUTE_MS,
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

    dispatch(view === "error" ? { type: "sosFailed" } : { type: "view", journey: view });
  }

  switch (state.name) {
    case "plan":
      return <PlanView busy={state.busy} problem={state.problem} onStart={start} onSettings={onSettings} />;
    case "ended":
      return <EndedView onNewTrip={() => dispatch({ type: "newTrip" })} />;
    case "travelling":
      if (state.code) return <CodeView code={state.code} journey={state.journey} dispatch={dispatch} />;

      return <TravellingView journey={state.journey} locale={locale} sos={state.sos} onSos={raiseSos} dispatch={dispatch} />;
  }
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

/** Screen 01, without the map: where to, and when you'll get there. */
function PlanView({
  busy,
  problem,
  onStart,
  onSettings,
}: {
  busy: boolean;
  problem: "not_found" | "need_location" | "error" | null;
  onStart: (destination: string, minutes: number) => void;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState("");
  const [minutes, setMinutes] = useState<number>(ARRIVAL_CHOICES[1]);

  const problems = { not_found: "plan.notFound", need_location: "plan.needLocation", error: "plan.error" } as const;

  return (
    <Screen
      footer={
        <PrimaryButton
          label={t("journey.start")}
          busy={busy}
          disabled={destination.trim().length === 0}
          onPress={() => onStart(destination, minutes)}
        />
      }
    >
      <View style={styles.top}>
        <Text style={text("brandHeader")}>{t("app.name")}</Text>
        {/* A text button until the icon font has a gear. */}
        <Pressable accessibilityRole="button" onPress={onSettings} hitSlop={8}>
          <Text style={text("body")}>{t("settings.title")}</Text>
        </Pressable>
      </View>
      <Title>{t("plan.title")}</Title>
      <View style={styles.input}>
        <Icon name="location_on" tint={color.fgSecondary} />
        <TextInput
          accessibilityLabel={t("plan.destination")}
          value={destination}
          onChangeText={setDestination}
          placeholder={t("plan.destinationHint")}
          placeholderTextColor={color.fgTertiary}
          style={styles.inputText}
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>
      <View style={[styles.chips, { marginTop: space[5] }]} accessibilityRole="radiogroup" accessibilityLabel={t("plan.arriveIn")}>
        <Icon name="schedule" tint={color.fgSecondary} />
        {ARRIVAL_CHOICES.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityState={{ selected: m === minutes }}
            onPress={() => setMinutes(m)}
            style={[styles.chip, m === minutes && styles.chipOn]}
          >
            <Text style={[text("body"), m === minutes && { color: color.onFg }]}>{t("common.minutes", { count: m })}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: space[6] }}>
        <IconLine icon="notifications">{t("plan.checkNote")}</IconLine>
      </View>
      {problem ? <Note tone="danger">{t(problems[problem])}</Note> : null}
    </Screen>
  );
}

/** Screens 02 (on route), 03 (are you safe?) and 04 (alert sent), by the server's status. */
function TravellingView({
  journey,
  locale,
  sos,
  onSos,
  dispatch,
}: {
  journey: JourneyView;
  locale: Locale;
  sos: SosState;
  onSos: () => void;
  dispatch: (action: JourneyAction) => void;
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

  return (
    <Screen footer={<PrimaryButton label={t("journey.end")} onPress={() => dispatch({ type: "openCode", purpose: "end" })} />}>
      <View style={styles.arrival}>
        <Text style={styles.arrivalTime}>{formatTime(journey.expectedArrivalAt, locale)}</Text>
        <Text style={[text("title"), { color: color.fgSecondary }]}>{t("onRoute.arrive")}</Text>
      </View>
      <Text style={[text("body"), { color: color.fgSecondary }]}>{t("onRoute.left", { minutes: minutesLeft })}</Text>
      <View style={styles.lines}>
        <IconLine icon="location_on">{journey.destination.name}</IconLine>
        <IconLine icon="group">{t("onRoute.sharing")}</IconLine>
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
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space[5] },
  input: {
    marginTop: space[5],
    height: layout.buttonHeight.lg + 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space[4],
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  inputText: { flex: 1, height: "100%", fontSize: 17, color: color.fgPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  chip: { paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.sm, backgroundColor: color.chip },
  chipOn: { backgroundColor: color.surfaceInverse },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: space[7] },
  arrival: { flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: space[7] },
  arrivalTime: { fontSize: 48, lineHeight: 56, fontWeight: "500", color: color.fgPrimary },
  lines: { marginTop: space[6], gap: space[3] },
  countdown: { flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: space[5], marginBottom: space[5] },
  seconds: { fontSize: 64, lineHeight: 72, fontWeight: "500", color: color.fgPrimary, fontVariant: ["tabular-nums"] },
  forgot: { textAlign: "center", color: color.fgSecondary, marginBottom: space[3] },
});
