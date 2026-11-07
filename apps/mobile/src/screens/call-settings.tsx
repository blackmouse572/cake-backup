import { layout, space } from "@cage/ui-tokens";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "../i18n";
import { saveSettings } from "../services/settings.service";
import { color, radius, text } from "../theme";
import { BackBar, Icon, IconLine, Note, Screen, Title } from "../ui";

/** What the check-in call looks like: who it seems to come from, and whether it rings. */
export interface CallLook {
  /** Empty means the default caller for the language ("Mẹ"). */
  callerName: string;
  vibrateOnly: boolean;
}

/** The longest caller name the server takes; a phone's call screen shows little more. */
const CALLER_MAX = 30;

const PRESETS = ["call.presets.mom", "call.presets.sister", "call.presets.work", "call.presets.delivery"] as const;

/**
 * Screen 14: the check-in call's caller name and ring. Each change is saved
 * at once, like the police switch; a failed save puts the old value back.
 */
export function CallSettingsView({ look, onChange, onBack }: { look: CallLook; onChange: (look: CallLook) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [problem, setProblem] = useState(false);
  const [saving, setSaving] = useState(false);
  const presets = PRESETS.map((key) => t(key));
  const shown = look.callerName || t("call.defaultCaller");
  const custom = !presets.includes(shown);
  const [typing, setTyping] = useState(custom);

  async function save(next: CallLook) {
    if (saving) return;
    const before = look;
    setSaving(true);
    setProblem(false);
    onChange(next);
    const result = await saveSettings({ callerName: next.callerName, callVibrateOnly: next.vibrateOnly });

    setSaving(false);

    if (result !== "ok") {
      onChange(before);
      setProblem(true);
    }
  }

  // The default caller is saved as empty, so it follows the language.
  const pick = (name: string) => {
    setTyping(false);
    void save({ ...look, callerName: name === t("call.defaultCaller") ? "" : name });
  };

  const form = useForm({
    defaultValues: { name: custom ? shown : "" },
    onSubmit: ({ value }) => {
      const name = value.name.trim();

      if (name) void save({ ...look, callerName: name });
    },
  });

  return (
    <Screen>
      <BackBar onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space[7] }}>
        <Title>{t("settings.checkInCall")}</Title>
        <Preview name={shown} />

        <Text style={styles.label}>{t("settings.call.caller")}</Text>
        <View style={styles.chips}>
          {presets.map((name) => (
            <Chip key={name} label={name} on={!typing && shown === name} onPress={() => pick(name)} />
          ))}
          <Chip label={t("settings.call.custom")} icon="edit" on={typing} onPress={() => setTyping(true)} />
        </View>
        {typing ? (
          <form.Field name="name">
            {(field) => (
              <TextInput
                accessibilityLabel={t("settings.call.caller")}
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={() => void form.handleSubmit()}
                onSubmitEditing={() => void form.handleSubmit()}
                placeholder={t("settings.call.customPlaceholder")}
                placeholderTextColor={color.fgTertiary}
                maxLength={CALLER_MAX}
                returnKeyType="done"
                autoFocus={!custom}
                style={styles.field}
              />
            )}
          </form.Field>
        ) : null}

        <Text style={styles.label}>{t("settings.call.ring")}</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          <Segment label={t("settings.call.ringOn")} icon="volume_up" on={!look.vibrateOnly} onPress={() => void save({ ...look, vibrateOnly: false })} />
          <Segment label={t("settings.call.vibrateOnly")} icon="vibration" on={look.vibrateOnly} onPress={() => void save({ ...look, vibrateOnly: true })} />
        </View>

        <View style={{ marginTop: space[6] }}>
          <IconLine icon="call">{t("settings.call.howItWorks")}</IconLine>
        </View>
        {problem ? <Note tone="danger">{t("settings.error")}</Note> : null}
      </ScrollView>
    </Screen>
  );
}

/** A small dark card showing how the call will look, as on screen 14. */
function Preview({ name }: { name: string }) {
  const { t } = useTranslation();

  return (
    <View style={styles.preview} accessible accessibilityLabel={`${t("call.incoming")}: ${name}`}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{name.trim().charAt(0).toLocaleUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.previewLabel}>{t("call.incoming")}</Text>
        <Text style={styles.previewName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={[styles.previewButton, { backgroundColor: PREVIEW.decline }]}>
        <Icon name="call_end" size={20} tint={PREVIEW.fg} />
      </View>
      <View style={[styles.previewButton, { backgroundColor: PREVIEW.accept }]}>
        <Icon name="call" size={20} tint={PREVIEW.fg} />
      </View>
    </View>
  );
}

function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: "edit" }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.7 }]}
    >
      {icon ? <Icon name={icon} size={16} tint={on ? color.onFg : color.fgPrimary} /> : null}
      <Text style={[text("body"), on && { color: color.onFg }]}>{label}</Text>
    </Pressable>
  );
}

function Segment({ label, icon, on, onPress }: { label: string; icon: "volume_up" | "vibration"; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.segmentItem, on && styles.segmentOn]}
    >
      <Icon name={icon} size={18} tint={color.fgPrimary} />
      <Text style={[text("body"), !on && { color: color.fgSecondary }]}>{label}</Text>
    </Pressable>
  );
}

/** The preview imitates the call screen, so it takes the call screen's colours (call-screen.tsx), not Cage's. */
const PREVIEW = { bg: "#0d1016", avatar: "#4a5463", fg: "#ffffff", fgSoft: "rgba(255,255,255,0.68)", accept: "#12a150", decline: "#e5484d" } as const;

const styles = StyleSheet.create({
  preview: {
    marginTop: space[5],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: PREVIEW.bg,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: PREVIEW.avatar, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, color: PREVIEW.fg },
  previewLabel: { fontSize: 13, lineHeight: 16, color: PREVIEW.fgSoft },
  previewName: { fontSize: 22, lineHeight: 28, color: PREVIEW.fg },
  previewButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  label: { ...text("caption"), color: color.fgSecondary, marginTop: space[6], marginBottom: space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: layout.buttonHeight.md,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.fgPrimary, borderColor: color.fgPrimary },
  field: {
    marginTop: space[3],
    height: layout.buttonHeight.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space[4],
    fontSize: 17,
    color: color.fgPrimary,
  },
  segment: { flexDirection: "row", padding: 4, gap: 4, borderRadius: radius.pill, backgroundColor: color.chip },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: layout.buttonHeight.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOn: { backgroundColor: color.surface },
});
