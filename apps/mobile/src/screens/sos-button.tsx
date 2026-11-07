import { space } from "@cage/ui-tokens";
import { useEffect, useReducer, useRef } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { useTranslation } from "../i18n";
import { color, radius, text } from "../theme";
import { Note } from "../ui";
import { holdReducer, idleHold } from "./hold.reducer";
import type { SosState } from "./journey.reducer";

/** How often the progress bar and the one-second check update while the finger is down. */
const TICK_MS = 50;

const START_BUZZ_MS = 30;

const FIRE_BUZZ_MS = 250;

/**
 * "Giữ để báo SOS" on screens 02 and 03: hold for a second, with a progress
 * bar and a buzz, and the safety circle is alerted with no code. The hold is
 * `holdReducer`; this only draws it, buzzes and calls `onSos` once per hold.
 */
export function SosButton({ state, onSos }: { state: SosState; onSos: () => void }) {
  const { t } = useTranslation();
  const [hold, dispatch] = useReducer(holdReducer, idleHold);
  const holding = hold.startedAt !== null;
  const latest = useRef(onSos);
  const sending = state === "sending";

  useEffect(() => {
    latest.current = onSos;
  });

  useEffect(() => {
    if (!holding) return;
    const timer = setInterval(() => dispatch({ type: "tick", at: Date.now() }), TICK_MS);

    return () => clearInterval(timer);
  }, [holding]);

  // Once per hold: the flag stays up until the finger lifts.
  useEffect(() => {
    if (!hold.fired) return;
    Vibration.vibrate(FIRE_BUZZ_MS);
    latest.current();
  }, [hold.fired]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("onRoute.sos")}
        accessibilityHint={t("onRoute.sosHint")}
        accessibilityState={{ busy: sending }}
        disabled={sending}
        onPressIn={() => {
          Vibration.vibrate(START_BUZZ_MS);
          dispatch({ type: "press", at: Date.now() });
        }}
        onPressOut={() => dispatch({ type: "release" })}
        style={styles.button}
      >
        <View style={[styles.fill, { width: `${Math.round(hold.progress * 100)}%` }]} />
        <Text style={text("title")}>{t(sending ? "onRoute.sosSending" : "onRoute.sos")}</Text>
      </Pressable>
      {state === "failed" ? <Note tone="danger">{t("onRoute.sosFailed")}</Note> : null}
    </View>
  );
}

// Ink, never red: red means status only, and buttons are never red.
const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.fgPrimary,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginTop: space[6],
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: color.track },
});
