import { space } from "@cage/ui-tokens";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, TextInput, Vibration, View } from "react-native";
import { useTranslation } from "../i18n";
import { color, radius, text } from "../theme";
import { BackBar, Caption, PrimaryButton, Screen, Title } from "../ui";
import { InCall, IncomingCall } from "./call-screen";
import {
  CALLER_NAME_MAX,
  CALLER_PRESETS,
  RING_DELAYS_MS,
  callerName,
  type FakeCall,
  type FakeCallAction,
} from "./fake-call.reducer";

/** How often the wait and the ring are checked. A second is as fine as the countdown on screen 02. */
const TICK_MS = 1_000;

/** Buzz, pause, buzz: the rhythm of an incoming call when the phone is on silent. */
const RING_PATTERN = [0, 800, 1_200];

const SECOND_MS = 1_000;

const MINUTE_MS = 60_000;

/**
 * Runs the fake call's clock while a call is on its way or ringing, and buzzes
 * while it rings. Only works with the app open: a timer in the app stops when
 * the phone sleeps, and this never asks the server to ring the phone.
 */
export function useFakeCallClock(state: FakeCall, dispatch: (action: FakeCallAction) => void) {
  const ticking = state.name === "waiting" || state.name === "ringing";
  const ringing = state.name === "ringing";

  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => dispatch({ type: "tick", at: Date.now() }), TICK_MS);

    return () => clearInterval(timer);
  }, [ticking, dispatch]);

  useEffect(() => {
    if (!ringing) return;
    Vibration.vibrate(RING_PATTERN, true);

    return () => Vibration.cancel();
  }, [ringing]);
}

/** Screen 02f: who calls, and when. */
export function FakeCallPicker({
  state,
  dispatch,
}: {
  state: Extract<FakeCall, { name: "picking" }>;
  dispatch: (action: FakeCallAction) => void;
}) {
  const { t } = useTranslation();
  const name = callerName(state, (preset) => t(`fakeCall.callers.${preset}`));

  return (
    <Screen
      footer={
        <PrimaryButton
          label={t("fakeCall.schedule")}
          disabled={name === ""}
          onPress={() => dispatch({ type: "schedule", callerName: name, at: Date.now() })}
        />
      }
    >
      <BackBar close onBack={() => dispatch({ type: "stop" })} />
      <Title>{t("fakeCall.title")}</Title>
      <Caption>{t("fakeCall.body")}</Caption>

      <Text style={styles.label}>{t("fakeCall.caller")}</Text>
      <View style={styles.chips}>
        {CALLER_PRESETS.map((preset) => (
          <Chip
            key={preset}
            label={t(`fakeCall.callers.${preset}`)}
            on={state.typed.trim() === "" && state.preset === preset}
            onPress={() => dispatch({ type: "pickPreset", preset })}
          />
        ))}
      </View>
      <TextInput
        accessibilityLabel={t("fakeCall.typed")}
        value={state.typed}
        onChangeText={(typed) => dispatch({ type: "type", text: typed })}
        placeholder={t("fakeCall.typed")}
        placeholderTextColor={color.fgTertiary}
        maxLength={CALLER_NAME_MAX}
        autoCorrect={false}
        style={styles.field}
      />

      <Text style={styles.label}>{t("fakeCall.delay")}</Text>
      <View style={styles.chips}>
        {RING_DELAYS_MS.map((delayMs) => (
          <Chip
            key={delayMs}
            label={
              delayMs < MINUTE_MS
                ? t("common.seconds", { count: delayMs / SECOND_MS })
                : t("common.minutes", { count: delayMs / MINUTE_MS })
            }
            on={state.delayMs === delayMs}
            onPress={() => dispatch({ type: "pickDelay", delayMs })}
          />
        ))}
      </View>
    </Screen>
  );
}

/** The ring and the call itself, drawn by the check-in call's screens so both look like the phone's own. */
export function FakeCallScreen({
  state,
  dispatch,
}: {
  state: Extract<FakeCall, { name: "ringing" | "inCall" }>;
  dispatch: (action: FakeCallAction) => void;
}) {
  if (state.name === "ringing") {
    return (
      <IncomingCall
        callerName={state.callerName}
        onAnswer={() => dispatch({ type: "answer", at: Date.now() })}
        onDecline={() => dispatch({ type: "stop" })}
      />
    );
  }

  return <InCall callerName={state.callerName} startedAt={state.startedAt} onHangUp={() => dispatch({ type: "stop" })} />;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[text("body"), on && { color: color.onFg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    ...text("sectionLabel"),
    textTransform: "uppercase",
    color: color.fgTertiary,
    marginTop: space[7],
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[3] },
  chip: { paddingHorizontal: space[4], paddingVertical: 10, borderRadius: radius.sm, backgroundColor: color.chip },
  chipOn: { backgroundColor: color.fgPrimary },
  field: {
    ...text("body"),
    marginTop: space[3],
    height: 48,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
  },
});
