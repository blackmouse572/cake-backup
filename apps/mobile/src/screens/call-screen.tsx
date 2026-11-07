import { space } from "@cage/ui-tokens";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "../i18n";
import { Icon, type IconName } from "../ui";

/**
 * The call-style screens (canvas 12 incoming, 13 in call). They imitate the
 * phone's own call screen, so they break the app's usual rules on purpose:
 * dark, red and green round buttons, and none of the logo, serif, route blue
 * or the words "Cage", "an toàn", "cảnh báo" and "công an" (tests on the
 * `call.*` strings enforce the words).
 *
 * Only drawing here: no server calls and no timers beyond the call clock.
 * The check-in call (#20) and the fake call (#21) both use these.
 */

/** Colours of a phone's call screen, not of Cage. Kept here so nothing else picks them up. */
const CALL = {
  bg: "#0d1016",
  avatar: "#4a5463",
  fg: "#ffffff",
  fgSoft: "rgba(255,255,255,0.68)",
  key: "rgba(255,255,255,0.12)",
  keyPressed: "rgba(255,255,255,0.32)",
  dotOff: "rgba(255,255,255,0.3)",
  accept: "#12a150",
  decline: "#e5484d",
} as const;

const SECOND_MS = 1_000;

/** Screen 12: someone is calling. The caller name is the traveller's choice ("Mẹ", "Công ty"). */
export function IncomingCall({
  callerName,
  onAnswer,
  onDecline,
}: {
  callerName: string;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.who}>
        <View style={styles.label}>
          <Icon name="call" size={16} tint={CALL.fgSoft} />
          <Text style={styles.labelText}>{t("call.incoming")}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial(callerName)}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
          {callerName}
        </Text>
        <Text style={styles.sub}>{t("call.mobile")}</Text>
      </View>
      <View style={styles.actions}>
        <RoundButton icon="call_end" tint={CALL.decline} label={t("call.decline")} onPress={onDecline} />
        <RoundButton icon="call" tint={CALL.accept} label={t("call.accept")} onPress={onAnswer} />
      </View>
    </SafeAreaView>
  );
}

/**
 * Screen 13: on the call. Caller name and a call clock at the top, the
 * hang-up button at the bottom; `children` fills the middle (the check-in
 * puts its code dots and keypad there, the fake call leaves it empty).
 */
export function InCall({
  callerName,
  startedAt,
  onHangUp,
  children,
}: {
  callerName: string;
  /** When the call was answered, epoch milliseconds. */
  startedAt: number;
  onHangUp: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const elapsed = useElapsed(startedAt);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
          {callerName}
        </Text>
        <Text style={styles.sub}>{clock(elapsed)}</Text>
      </View>
      <View style={styles.middle}>{children}</View>
      <View style={styles.hangUp}>
        <RoundButton icon="call_end" tint={CALL.decline} label={t("call.hangUp")} onPress={onHangUp} hideLabel />
      </View>
    </SafeAreaView>
  );
}

/** The in-call code dots: white on the dark call screen. */
export function CallDots({ length, filled }: { length: number; filled: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={[styles.dot, i < filled && styles.dotOn]} />
      ))}
    </View>
  );
}

const KEYS = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
] as const;

/** The phone's own in-call keypad (screen 13). `*` and `#` are there to look right and type nothing. */
export function CallKeypad({ onDigit }: { onDigit: (digit: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYS.map(([key, letters]) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key}
          onPress={() => {
            if (/^\d$/.test(key)) onDigit(key);
          }}
          style={({ pressed }) => [styles.key, pressed && { backgroundColor: CALL.keyPressed }]}
        >
          <Text style={styles.keyText}>{key}</Text>
          {letters ? <Text style={styles.keyLetters}>{letters}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function RoundButton({
  icon,
  tint,
  label,
  onPress,
  hideLabel = false,
}: {
  icon: IconName;
  tint: string;
  label: string;
  onPress: () => void;
  hideLabel?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.round, { backgroundColor: tint }]}>
        <Icon name={icon} size={34} tint={CALL.fg} />
      </View>
      {hideLabel ? null : <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

/** Seconds since `startedAt`, ticking. */
function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);

    return () => clearInterval(timer);
  }, []);

  return Math.max(0, Math.floor((now - startedAt) / SECOND_MS));
}

/** "00:07", as a phone shows a call's length. */
export function clock(seconds: number): string {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function initial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase() || "?";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CALL.bg },
  who: { alignItems: "center", marginTop: 96, paddingHorizontal: space[5] },
  label: { flexDirection: "row", alignItems: "center", gap: 6 },
  labelText: { fontSize: 15, lineHeight: 20, color: CALL.fgSoft },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    marginTop: 28,
    marginBottom: space[5],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CALL.avatar,
  },
  avatarText: { fontSize: 44, color: CALL.fg },
  name: { fontSize: 44, lineHeight: 52, letterSpacing: -0.44, color: CALL.fg, textAlign: "center" },
  sub: { marginTop: 6, fontSize: 17, lineHeight: 22, color: CALL.fgSoft, textAlign: "center", fontVariant: ["tabular-nums"] },
  actions: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 96,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  action: { alignItems: "center", gap: space[3] },
  actionText: { fontSize: 15, lineHeight: 20, color: CALL.fgSoft },
  round: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", marginTop: 64, paddingHorizontal: space[5] },
  middle: { flex: 1, justifyContent: "center", paddingHorizontal: 44 },
  hangUp: { alignItems: "center", paddingBottom: space[7] },
  dots: { flexDirection: "row", gap: 22, justifyContent: "center", marginBottom: space[7] },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: CALL.dotOff },
  dotOn: { backgroundColor: CALL.fg },
  keypad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16 },
  key: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CALL.key,
  },
  keyText: { fontSize: 32, lineHeight: 38, color: CALL.fg },
  keyLetters: { fontSize: 10, lineHeight: 12, letterSpacing: 1.5, color: CALL.fgSoft },
});
