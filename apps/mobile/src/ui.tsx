import { layout, space } from "@cage/ui-tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import symbolsFont from "../assets/fonts/material-symbols.ttf";
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

/** The Material Symbols Outlined subset in `assets/fonts` (weight 300, 20 pt), loaded in App.tsx. */
export const ICON_FONT = { MaterialSymbols: symbolsFont };

/** Codepoints of the glyphs in that subset. Add a name here and to the font together. */
const GLYPHS = {
  arrow_back: 0xe5c4,
  arrow_downward: 0xe5db,
  arrow_upward: 0xe5d8,
  backspace: 0xe14a,
  check: 0xe668,
  check_circle: 0xf0be,
  close: 0xe5cd,
  contacts: 0xe0ba,
  dialpad: 0xe0bc,
  error: 0xf8b6,
  flag: 0xf0c6,
  group: 0xea21,
  info: 0xe88e,
  location_on: 0xf1db,
  lock: 0xe899,
  notifications: 0xe7f5,
  person_add: 0xea4d,
  schedule: 0xefd6,
  translate: 0xe8e2,
  wifi_off: 0xe648,
} as const;

export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 20, tint = color.fgTertiary }: { name: IconName; size?: number; tint?: string }) {
  return (
    <Text
      accessible={false}
      style={{ fontFamily: "MaterialSymbols", fontSize: size, lineHeight: size, width: size, color: tint }}
    >
      {String.fromCodePoint(GLYPHS[name])}
    </Text>
  );
}

/** A round icon-only button for top bars and rows; `label` is what a screen reader says. */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, (disabled || pressed) && { opacity: disabled ? 0.3 : 0.6 }]}
    >
      <Icon name={icon} size={22} tint={color.fgPrimary} />
    </Pressable>
  );
}

/** Back arrow and progress bars, as on screens 08a–11. */
export function StepNav({ step, total = 5, onBack }: { step: number; total?: number; onBack?: () => void }) {
  const { t } = useTranslation();

  return (
    <View style={styles.nav}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={onBack} hitSlop={12}>
          <Icon name="arrow_back" size={24} tint={color.fgPrimary} />
        </Pressable>
      ) : null}
      <View style={styles.prog} accessible accessibilityLabel={t("common.step", { step, total })}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, i < step && styles.barOn]} />
        ))}
      </View>
    </View>
  );
}

/** A top bar with a back arrow, for screens opened from home. */
export function BackBar({ onBack, close = false }: { onBack: () => void; close?: boolean }) {
  const { t } = useTranslation();

  return (
    <View style={styles.nav}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(close ? "common.close" : "common.back")}
        onPress={onBack}
        hitSlop={12}
      >
        <Icon name={close ? "close" : "arrow_back"} size={24} tint={color.fgPrimary} />
      </Pressable>
    </View>
  );
}

/** One line of quiet information with an icon in front, instead of a tinted box. */
export function IconLine({ icon, children, tint = color.fgSecondary }: { icon: IconName; children: ReactNode; tint?: string }) {
  return (
    <View style={styles.iconLine}>
      <Icon name={icon} tint={tint} />
      <Text style={[text("caption"), { flex: 1, color: tint }]}>{children}</Text>
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

/** Something went wrong (danger) or a choice needs a word (info): one short line with an icon. */
export function Note({ tone, children }: { tone: "danger" | "info"; children: ReactNode }) {
  const danger = tone === "danger";

  return (
    <View accessibilityLiveRegion="polite" style={styles.note}>
      <IconLine icon={danger ? "error" : "info"} tint={danger ? color.dangerText : color.fgSecondary}>
        {children}
      </IconLine>
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
            {k === "del" ? (
              <Icon name="backspace" size={26} tint={color.fgPrimary} />
            ) : (
              <Text style={{ fontSize: 28, color: color.fgPrimary }}>{k}</Text>
            )}
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
  prog: { flex: 1, flexDirection: "row", gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.track },
  barOn: { backgroundColor: color.fgPrimary },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.chip,
  },
  iconLine: { flexDirection: "row", alignItems: "center", gap: space[2] },
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
  note: { marginTop: space[4] },
  dots: { flexDirection: "row", gap: 18, justifyContent: "center" },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.borderStrong },
  dotOn: { backgroundColor: color.fgPrimary, borderColor: color.fgPrimary },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: space[2], paddingBottom: space[4] },
  key: { width: "31.5%", height: 64, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  keyFilled: { backgroundColor: color.surfaceHover },
});
