import { layout, space } from "@cage/ui-tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEMO } from "./auth";
import { useTranslation } from "./i18n";
import { color, radius, text } from "./theme";

/**
 * Small building blocks shared by the onboarding screens, after the canvas's
 * `cd-btn`, `.nav` + `.prog`, `.grp` / `.card` / `.it` and keypad.
 */

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.page}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      {DEMO ? <DemoPill /> : null}
    </SafeAreaView>
  );
}

/** The amber DEMO pill on every screen of the demo build, the same mark as on the dashboard and the circle page. */
function DemoPill() {
  const { t } = useTranslation();

  return (
    <View style={styles.demo} pointerEvents="none" accessibilityLabel={t("demo.pill")}>
      <Text style={styles.demoText}>{t("demo.pill")}</Text>
    </View>
  );
}

/** Back arrow, progress bars and "n/5", as on screens 08a–11. */
export function StepNav({ step, total = 5, onBack }: { step: number; total?: number; onBack?: () => void }) {
  const { t } = useTranslation();

  return (
    <View style={styles.nav}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </Pressable>
      ) : null}
      <View style={styles.prog} accessibilityLabel={t("common.step", { step, total })}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, i < step && styles.barOn]} />
        ))}
      </View>
      <Text style={[text("caption"), styles.count]}>{t("common.step", { step, total })}</Text>
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return (
    <Text accessibilityRole="header" style={[text("screenTitle"), style]}>
      {children}
    </Text>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return <Text style={[text("caption"), { color: color.fgSecondary, marginTop: space[2] }]}>{children}</Text>;
}

type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; busy?: boolean };

/** The one primary action of a screen: ink, never red or green. */
export function PrimaryButton({ label, onPress, disabled, busy }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.primary, (disabled || busy) && { opacity: 0.4 }]}
    >
      <Text style={[text("title"), { color: color.onFg }]}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.ghost}
    >
      <Text style={[text("body"), { color: color.fgSecondary }]}>{label}</Text>
    </Pressable>
  );
}

/** A tinted group holding a white card of rows (`.grp` > `.card` > `.it`). */
export function InfoGroup({ heading, rows }: { heading?: string; rows: { title: string; body: string; done?: boolean }[] }) {
  return (
    <View style={styles.group}>
      {heading ? <Text style={[text("body"), { paddingHorizontal: space[2], paddingBottom: 10 }]}>{heading}</Text> : null}
      <View style={styles.card}>
        {rows.map((row, i) => (
          <View key={row.title} style={[styles.row, i > 0 && styles.rowDivider]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[text("body"), { fontWeight: "500" }]}>{row.title}</Text>
              <Text style={[text("caption"), { color: color.fgSecondary, fontSize: 14, lineHeight: 19 }]}>
                {row.body}
              </Text>
            </View>
            {row.done ? <Text style={{ color: color.success, fontSize: 20 }}>✓</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A short status note: tone sets the status colour (warning for hints, danger for errors). */
export function Note({ tone, children }: { tone: "warning" | "danger" | "info"; children: ReactNode }) {
  const tones = {
    warning: [color.warningTint, color.warningText],
    danger: [color.dangerTint, color.dangerText],
    info: [color.infoTint, color.infoText],
  } as const;

  const [bg, fg] = tones[tone];

  return (
    <View accessibilityLiveRegion="polite" style={[styles.note, { backgroundColor: bg }]}>
      <Text style={[text("caption"), { color: fg, fontSize: 14 }]}>{children}</Text>
    </View>
  );
}

/** Four (or six) dots that fill as digits are typed. */
export function CodeDots({ length, filled }: { length: number; filled: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={[styles.dot, i < filled && styles.dotOn]} />
      ))}
    </View>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

/** The in-app number pad from screens 10, 10b and 26. */
export function Keypad({ onDigit, onDelete }: { onDigit: (d: string) => void; onDelete: () => void }) {
  const { t } = useTranslation();

  return (
    <View style={styles.keypad}>
      {KEYS.map((k, i) =>
        k === "" ? (
          <View key={i} style={styles.key} />
        ) : (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={k === "del" ? t("common.delete") : k}
            onPress={() => (k === "del" ? onDelete() : onDigit(k))}
            style={({ pressed }) => [styles.key, k !== "del" && styles.keyFilled, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ fontSize: 28, color: color.fgPrimary }}>{k === "del" ? "⌫" : k}</Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  demo: {
    position: "absolute",
    top: 52,
    right: layout.pageGutter,
    backgroundColor: color.warningText,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  demoText: { color: color.onFg, fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 1.3 },
  screen: { flex: 1, backgroundColor: color.bgPrimary },
  page: { flex: 1, paddingHorizontal: space[5], paddingTop: space[2] },
  footer: { paddingHorizontal: space[5], paddingBottom: space[2], gap: 6 },
  nav: { flexDirection: "row", alignItems: "center", gap: space[4], height: 44, marginBottom: space[3] },
  back: { fontSize: 24, color: color.fgPrimary },
  prog: { flex: 1, flexDirection: "row", gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.track },
  barOn: { backgroundColor: color.fgPrimary },
  count: { fontSize: 14, fontWeight: "500", color: color.fgSecondary },
  primary: {
    height: layout.buttonHeight.lg,
    borderRadius: radius.lg,
    backgroundColor: color.fgPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space[2],
  },
  ghost: { height: layout.buttonHeight.lg, alignItems: "center", justifyContent: "center" },
  group: { backgroundColor: color.surfaceHover, borderRadius: 28, padding: space[3], marginTop: space[5] },
  card: { backgroundColor: color.surface, borderRadius: radius.md, paddingHorizontal: space[4] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] },
  rowDivider: { borderTopWidth: 1, borderStyle: "dashed", borderTopColor: color.divider },
  note: { marginTop: space[4], paddingVertical: space[3], paddingHorizontal: 14, borderRadius: radius.sm },
  dots: { flexDirection: "row", gap: 18, justifyContent: "center" },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.borderStrong },
  dotOn: { backgroundColor: color.fgPrimary, borderColor: color.fgPrimary },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: space[2], paddingBottom: space[4] },
  key: { width: "31.5%", height: 64, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  keyFilled: { backgroundColor: color.surfaceHover },
});
