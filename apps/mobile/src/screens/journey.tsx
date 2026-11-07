import { formatTime, isLocale, LOCALE_NAMES, LOCALES, type Locale } from "@cage/i18n";
import { CODE_LENGTH, TIMERS, type JourneyView } from "@cage/shared";
import { layout, space } from "@cage/ui-tokens";
import { useEffect, useReducer, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DEMO } from "../auth";
import { setLocale, useTranslation } from "../i18n";
import { currentJourney, enterCode, fetchJourney, forgetJourney, sendUpdate, startJourney } from "../services/journey.service";
import { allowLocation, findPlace, watchReadings } from "../services/places.service";
import { color, radius, text } from "../theme";
import { Caption, CodeDots, GhostButton, Keypad, Note, PrimaryButton, Screen, Title } from "../ui";
import { initialJourneyFlow, journeyReducer, type CodeEntry, type JourneyAction } from "./journey.reducer";

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
export function JourneyFlow({ onCircle }: { onCircle: () => void }) {
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

    const started = await startJourney({
      destination: { name: destination.trim(), ...place },
      expectedArrivalAt: Date.now() + minutes * MINUTE_MS,
      lostContactEnabled: true,
      locale,
    });

    if (started === "no_codes" || started === "error") return dispatch({ type: "startFailed", problem: "error" });
    dispatch({ type: "started", journey: started.journey, token: started.journeyToken });
  }

  switch (state.name) {
    case "plan":
      return <PlanView busy={state.busy} problem={state.problem} locale={locale} onStart={start} onCircle={onCircle} />;
    case "ended":
      return <EndedView onNewTrip={() => dispatch({ type: "newTrip" })} />;
    case "travelling":
      if (state.code) return <CodeView code={state.code} journey={state.journey} dispatch={dispatch} />;

      return <TravellingView journey={state.journey} locale={locale} dispatch={dispatch} />;
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
  locale,
  onStart,
  onCircle,
}: {
  busy: boolean;
  problem: "not_found" | "need_location" | "error" | null;
  locale: Locale;
  onStart: (destination: string, minutes: number) => void;
  onCircle: () => void;
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
        <View style={styles.topActions}>
          {LOCALES.map((l) => (
            <Pressable
              key={l}
              accessibilityRole="button"
              accessibilityState={{ selected: l === locale }}
              onPress={() => setLocale(l)}
              style={[styles.chip, l === locale && styles.chipOn]}
            >
              <Text style={[text("caption"), l === locale && { color: color.onFg }]}>{LOCALE_NAMES[l]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Title>{t("plan.title")}</Title>
      <View style={styles.field}>
        <Text style={[text("caption"), { color: color.fgSecondary }]}>{t("plan.destination")}</Text>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder={t("plan.destinationHint")}
          placeholderTextColor={color.fgTertiary}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>
      <Text style={[text("caption"), { color: color.fgSecondary, marginTop: space[5] }]}>{t("plan.arriveIn")}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
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
      <View style={styles.card}>
        <Text style={[text("body"), { fontWeight: "500" }]}>{t("plan.checkNote")}</Text>
        <Text style={[text("caption"), { color: color.fgSecondary }]}>{t("plan.checkNoteBody")}</Text>
      </View>
      {problem ? <Note tone="danger">{t(problems[problem])}</Note> : null}
      <GhostButton label={t("circle.name")} onPress={onCircle} />
    </Screen>
  );
}

/** Screens 02 (on route), 03 (are you safe?) and 04 (alert sent), by the server's status. */
function TravellingView({
  journey,
  locale,
  dispatch,
}: {
  journey: JourneyView;
  locale: Locale;
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
        <View style={[styles.chipStatus, { backgroundColor: color.warningTint }]}>
          <Text style={[text("caption"), { color: color.warningText }]}>{t("journey.status.check_in")}</Text>
        </View>
        <Title style={{ marginTop: space[4] }}>{t("checkIn.question")}</Title>
        <Caption>{t("ask.body")}</Caption>
        <View style={styles.countdown}>
          <Text style={styles.seconds}>{seconds}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[text("body"), { fontWeight: "500" }]}>{t("ask.secondsLeft")}</Text>
            <Text style={[text("caption"), { color: color.fgSecondary }]}>{t("ask.autoAlert")}</Text>
          </View>
        </View>
      </Screen>
    );
  }

  if (journey.status === "alerted" || journey.status === "lost_contact") {
    const lost = journey.status === "lost_contact";

    return (
      <Screen footer={<PrimaryButton label={t("checkIn.imSafe")} onPress={() => dispatch({ type: "openCode", purpose: "answer" })} />}>
        <View style={[styles.chipStatus, { backgroundColor: color.dangerTint }]}>
          <Text style={[text("caption"), { color: color.dangerText }]}>{t(`journey.status.${journey.status}`)}</Text>
        </View>
        <Title style={{ marginTop: space[4] }}>{t(lost ? "alerted.lostTitle" : "alerted.title")}</Title>
        <Caption>{lost ? t("alerted.lostBody") : t("alerted.body", { time: formatTime(now, locale) })}</Caption>
      </Screen>
    );
  }

  const minutesLeft = Math.max(0, Math.round((journey.expectedArrivalAt - now) / MINUTE_MS));

  return (
    <Screen footer={<PrimaryButton label={t("journey.end")} onPress={() => dispatch({ type: "openCode", purpose: "end" })} />}>
      <View style={[styles.chipStatus, { backgroundColor: color.successTint }]}>
        <Text style={[text("caption"), { color: color.successText }]}>{t("journey.status.active")}</Text>
      </View>
      <View style={styles.arrival}>
        <Text style={styles.arrivalTime}>{formatTime(journey.expectedArrivalAt, locale)}</Text>
        <Text style={[text("title"), { color: color.fgSecondary }]}>{t("onRoute.arrive")}</Text>
      </View>
      <Text style={[text("body"), { color: color.fgSecondary }]}>
        {journey.destination.name} · {t("onRoute.left", { minutes: minutesLeft })}
      </Text>
      <Note tone="info">{t("onRoute.sharing")}</Note>
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={() => dispatch({ type: "closeCode" })}
        hitSlop={12}
        style={styles.close}
      >
        <Text style={{ fontSize: 22, color: color.fgPrimary }}>✕</Text>
      </Pressable>
      <Title>{t(answering ? "enterCode.title" : "enterCode.endTitle")}</Title>
      <Caption>{t(answering ? "enterCode.body" : "enterCode.endBody")}</Caption>
      <View style={{ marginTop: space[7], alignItems: "center", gap: space[3] }}>
        <CodeDots length={CODE_LENGTH} filled={code.entry.length} />
        <Text style={[text("caption"), { color: color.fgSecondary }]}>
          {answering && journey.status === "check_in" ? t("enterCode.left", { count: seconds }) : t("enterCode.typeFour")}
        </Text>
      </View>
      {code.problem ? <Note tone="danger">{t(problems[code.problem])}</Note> : null}
    </Screen>
  );
}

function EndedView({ onNewTrip }: { onNewTrip: () => void }) {
  const { t } = useTranslation();

  return (
    <Screen footer={<PrimaryButton label={t("arrived.again")} onPress={onNewTrip} />}>
      <Title style={{ marginTop: space[7] }}>{t("arrived.title")}</Title>
      <Caption>{t("arrived.body")}</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space[5] },
  topActions: { flexDirection: "row", gap: space[2] },
  field: { marginTop: space[5], gap: space[2] },
  input: {
    height: layout.buttonHeight.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space[4],
    fontSize: 17,
    color: color.fgPrimary,
    backgroundColor: color.surface,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] },
  chip: { paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.sm, backgroundColor: color.chip },
  chipOn: { backgroundColor: color.surfaceInverse },
  chipStatus: { alignSelf: "flex-start", paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.sm },
  card: {
    marginTop: space[5],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: color.surfaceSunken,
    borderWidth: 1,
    borderColor: color.border,
    gap: 2,
  },
  arrival: { flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: space[4] },
  arrivalTime: { fontSize: 40, lineHeight: 48, fontWeight: "500", color: color.fgPrimary },
  countdown: { flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[6] },
  seconds: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 8,
    borderColor: color.blueTint,
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 80,
    fontSize: 34,
    color: color.fgPrimary,
  },
  close: { height: 44, justifyContent: "center", marginBottom: space[3] },
  forgot: { textAlign: "center", color: color.fgSecondary, fontSize: 14, marginBottom: space[3] },
});
