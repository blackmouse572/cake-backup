import { LOCALES, isLocale, LOCALE_NAMES, type Locale } from "@cage/i18n";
import { CODE_LENGTH, type Me } from "@cage/shared";
import { space } from "@cage/ui-tokens";
import { useEffect, useReducer, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { setLocale, useTranslation } from "../i18n";
import { fetchMe } from "../services/auth.service";
import { saveSettings, signOutWithCode } from "../services/settings.service";
import { color, radius, text } from "../theme";
import { BackBar, Caption, CodeDots, Icon, IconLine, Keypad, Note, PrimaryButton, Screen, Title, type IconName } from "../ui";
import { CallSettingsView, type CallLook } from "./call-settings";
import { initialSettings, settingsReducer } from "./settings.reducer";

/**
 * Settings (screen 20) with its language screen (20b, 20c), the codes screen
 * (20a) and signing out with the safe code. It reads the account itself, so
 * coming back from the safety circle shows the new count. The flow is
 * `settingsReducer`; the safety circle (05) and changing the codes open
 * their own screens through the callbacks.
 *
 * The disguise (18) row shows "coming soon" until that screen exists (#26).
 */
export function SettingsFlow(props: SettingsProps) {
  // A new key starts the loader again after a failure.
  const [attempt, setAttempt] = useState(0);

  return <AccountLoader key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />;
}

interface SettingsProps {
  onBack: () => void;
  onCircle: () => void;
  onChangeCodes: () => void;
  onSignedOut: () => void;
}

function AccountLoader({
  onBack,
  onCircle,
  onChangeCodes,
  onSignedOut,
  onRetry,
}: SettingsProps & { onRetry: () => void }) {
  const { t } = useTranslation();
  const [me, setMe] = useState<Me | "loading" | "error">("loading");

  useEffect(() => {
    let current = true;

    fetchMe()
      .then((account) => current && setMe(account))
      .catch(() => current && setMe("error"));

    return () => {
      current = false;
    };
  }, []);

  if (me === "loading") {
    return (
      <Screen>
        <BackBar onBack={onBack} />
        <ActivityIndicator color={color.fgPrimary} style={{ marginTop: space[7] }} />
      </Screen>
    );
  }

  if (me === "error") {
    return (
      <Screen footer={<PrimaryButton label={t("common.retry")} onPress={onRetry} />}>
        <BackBar onBack={onBack} />
        <Note tone="danger">{t("settings.error")}</Note>
      </Screen>
    );
  }

  return (
    <SettingsScreens me={me} onBack={onBack} onCircle={onCircle} onChangeCodes={onChangeCodes} onSignedOut={onSignedOut} />
  );
}

function SettingsScreens({ me, onBack, onCircle, onChangeCodes, onSignedOut }: SettingsProps & { me: Me }) {
  const { t, i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "vi";
  const [state, dispatch] = useReducer(settingsReducer, { policeEnabled: me.policeEnabled }, initialSettings);
  const { view, submit, signedOut } = state;
  const [look, setLook] = useState<CallLook>({ callerName: me.callerName, vibrateOnly: me.callVibrateOnly });

  // Sends the code once four digits are in.
  useEffect(() => {
    if (submit === null) return;

    void signOutWithCode(submit).then((result) => dispatch({ type: "signOutResult", result }));
  }, [submit]);

  useEffect(() => {
    if (signedOut) onSignedOut();
  }, [signedOut, onSignedOut]);

  async function togglePolice() {
    if (state.savingPolice) return;
    dispatch({ type: "togglePolice" });
    const result = await saveSettings({ policeEnabled: !state.policeEnabled });

    dispatch({ type: result === "ok" ? "policeSaved" : "policeFailed" });
  }

  switch (view) {
    case "language":
      return <LanguageView locale={locale} onChoose={chooseLanguage} onBack={() => dispatch({ type: "back" })} />;
    case "codes":
      return <CodesView onChange={onChangeCodes} onBack={() => dispatch({ type: "back" })} />;
    case "call":
      return <CallSettingsView look={look} onChange={setLook} onBack={() => dispatch({ type: "back" })} />;
    case "signOut":
      return (
        <Screen
          footer={<Keypad onDigit={(d) => dispatch({ type: "digit", digit: d })} onDelete={() => dispatch({ type: "delete" })} />}
        >
          <BackBar onBack={() => dispatch({ type: "back" })} />
          <Title>{t("settings.signOutScreen.title")}</Title>
          <Caption>{t("settings.signOutScreen.body")}</Caption>
          <View style={{ marginTop: space[7], alignItems: "center", gap: space[3] }}>
            <CodeDots length={CODE_LENGTH} filled={state.entry.length} />
          </View>
          {state.problem ? <Note tone="danger">{t(SIGN_OUT_PROBLEMS[state.problem])}</Note> : null}
        </Screen>
      );
    case "list":
      return (
        <Screen>
          <BackBar onBack={onBack} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space[7] }}>
            <Title>{t("settings.title")}</Title>

            <Section title={t("settings.sections.safety")}>
              <Row icon="group" label={t("circle.name")} value={t("settings.people", { count: me.circleSize })} onPress={onCircle} />
              <Row
                icon="call"
                label={t("settings.checkInCall")}
                value={look.callerName || t("call.defaultCaller")}
                onPress={() => dispatch({ type: "open", view: "call" })}
              />
              <Row icon="dialpad" label={t("settings.codes")} onPress={() => dispatch({ type: "open", view: "codes" })} />
              <Row
                icon="flag"
                label={t("settings.police")}
                trailing={
                  <Switch
                    accessibilityLabel={t("settings.police")}
                    value={state.policeEnabled}
                    onValueChange={() => void togglePolice()}
                    disabled={state.savingPolice}
                    trackColor={{ false: color.track, true: color.fgPrimary }}
                    thumbColor={color.surface}
                  />
                }
              />
            </Section>
            <View style={{ marginTop: space[2] }}>
              <IconLine icon="info">{t("settings.policeWhy")}</IconLine>
            </View>
            {state.problem ? <Note tone="danger">{t("settings.error")}</Note> : null}

            <Section title={t("settings.sections.privacy")}>
              <Row icon="lock" label={t("settings.disguise")} value={t("settings.soon")} />
            </Section>

            <Section title={t("settings.sections.general")}>
              <Row icon="translate" label={t("settings.language")} value={LOCALE_NAMES[locale]} onPress={() => dispatch({ type: "open", view: "language" })} />
              <Row icon="close" label={t("settings.signOut")} onPress={() => dispatch({ type: "open", view: "signOut" })} />
            </Section>
          </ScrollView>
        </Screen>
      );
  }
}

/** A tap switches the whole app at once; the server hears about it so the circle's messages follow. */
function chooseLanguage(next: Locale) {
  setLocale(next);
  void saveSettings({ locale: next });
}

const SIGN_OUT_PROBLEMS = {
  wrong_code: "enterCode.wrong",
  too_many_tries: "enterCode.tooMany",
  error: "settings.error",
} as const;

/** Screens 20b and 20c: a tap switches the app at once, with no Save button. */
function LanguageView({ locale, onChoose, onBack }: { locale: Locale; onChoose: (l: Locale) => void; onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <Screen>
      <BackBar onBack={onBack} />
      <Title>{t("settings.language")}</Title>
      <Caption>{t("settings.languageScreen.body")}</Caption>
      <Section title={t("settings.languageScreen.list")}>
        {LOCALES.map((l) => {
          // The name in the current language, left out when it would only repeat the name.
          const inCurrent = t(l === "vi" ? "settings.languageScreen.inVi" : "settings.languageScreen.inEn");

          return (
            <Pressable
              key={l}
              accessibilityRole="radio"
              accessibilityState={{ selected: l === locale }}
              onPress={() => onChoose(l)}
              style={styles.row}
            >
              <View style={{ flex: 1 }}>
                <Text style={text("body")}>{LOCALE_NAMES[l]}</Text>
                {inCurrent === LOCALE_NAMES[l] ? null : (
                  <Text style={[text("caption"), { color: color.fgSecondary }]}>{inCurrent}</Text>
                )}
              </View>
              <View style={[styles.radio, l === locale && styles.radioOn]}>
                {l === locale ? <Icon name="check" size={16} tint={color.onFg} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Section>
      <Text style={[styles.sectionTitle, { marginTop: space[6] }]}>{t("settings.languageScreen.changes")}</Text>
      <View style={{ gap: space[3], marginTop: space[2] }}>
        <IconLine icon="info">{t("settings.languageScreen.app")}</IconLine>
        <IconLine icon="notifications">{t("settings.languageScreen.messages")}</IconLine>
        <IconLine icon="lock">{t("settings.languageScreen.disguise")}</IconLine>
      </View>
    </Screen>
  );
}

/**
 * Screen 20a. Both codes change together: the server takes them as a pair,
 * so either "Đổi" starts the same flow, which asks for the current safe code
 * first.
 */
function CodesView({ onChange, onBack }: { onChange: () => void; onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <Screen>
      <BackBar onBack={onBack} />
      <Title>{t("settings.codesScreen.title")}</Title>
      <Section>
        <Row icon="check_circle" label={t("settings.codesScreen.safe")} note={t("settings.codesScreen.safeNote")} value={t("settings.codesScreen.change")} onPress={onChange} />
        <Row icon="notifications" label={t("settings.codesScreen.duress")} note={t("settings.codesScreen.duressNote")} value={t("settings.codesScreen.change")} onPress={onChange} />
      </Section>
      <View style={{ marginTop: space[4] }}>
        <Note tone="info">{t("settings.codesScreen.info")}</Note>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: space[5] }}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** One line of a settings card. With `onPress` it is a button; without, it shows `value` or `trailing` as it is. */
function Row({
  icon,
  label,
  note,
  value,
  trailing,
  onPress,
}: {
  icon: IconName;
  label: string;
  note?: string;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.rowIcon}>
        <Icon name={icon} tint={color.fgPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={text("body")}>{label}</Text>
        {note ? <Text style={[text("caption"), { color: color.fgSecondary }]}>{note}</Text> : null}
      </View>
      {value ? <Text style={[text("body"), { color: color.fgSecondary }]}>{value}</Text> : null}
      {trailing}
      {onPress ? (
        <View style={{ transform: [{ rotate: "180deg" }] }}>
          <Icon name="arrow_back" size={18} tint={color.fgTertiary} />
        </View>
      ) : null}
    </>
  );

  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...text("caption"), color: color.fgSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: space[2], marginLeft: space[1] },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, paddingHorizontal: space[4] },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  rowIcon: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: color.chip, alignItems: "center", justifyContent: "center" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: color.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: color.fgPrimary, borderColor: color.fgPrimary },
});
