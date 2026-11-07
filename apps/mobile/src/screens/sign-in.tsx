import { formatPhone, toE164, type Me } from "@cage/shared";
import { space } from "@cage/ui-tokens";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "../i18n";
import {
  sendCode,
  verifyCode,
  type CodeChannel,
  type SendCodeResult,
  type VerifyCodeResult,
} from "../services/auth.service";
import { color, radius, text } from "../theme";
import { Caption, GhostButton, InfoGroup, Note, PrimaryButton, Screen, StepNav, Title } from "../ui";

/** Field errors are the failed results the validators return; these narrow them to copy keys. */
const isSendError = (e: unknown): e is Exclude<SendCodeResult, "ok"> =>
  e === "invalid" || e === "too_many" || e === "error";

const isVerifyError = (e: unknown): e is Exclude<VerifyCodeResult, "ok"> =>
  e === "wrong" || e === "too_many" || e === "error";

/** The values on screen 08a: the number as typed, and where to send the code. */
interface PhoneForm {
  phone: string;
  channel: CodeChannel;
}

/** Screen 08a: phone number, then a code by Zalo or SMS. */
export function PhoneScreen({
  onBack,
  onSent,
}: {
  onBack?: () => void;
  onSent: (phoneNumber: string, channel: CodeChannel) => void;
}) {
  const { t, i18n } = useTranslation();

  const defaultValues: PhoneForm = { phone: "", channel: "zalo" };

  const form = useForm({
    defaultValues,
    validators: {
      // Errors are keys under signIn.phone.errors.
      onSubmitAsync: async ({ value }) => {
        const e164 = toE164(value.phone);

        if (!e164) return { fields: { phone: "invalid" } };
        const result = await sendCode(e164, value.channel, i18n.language);

        return result === "ok" ? undefined : { fields: { phone: result } };
      },
    },
    onSubmit: ({ value }) => onSent(toE164(value.phone)!, value.channel),
  });

  const send = (channel: CodeChannel) => {
    form.setFieldValue("channel", channel);
    void form.handleSubmit();
  };

  return (
    <form.Subscribe selector={(s) => [toE164(s.values.phone) !== null, s.isSubmitting] as const}>
      {([valid, submitting]) => (
        <Screen
          footer={
            <>
              <PrimaryButton
                label={t("signIn.phone.sendZalo")}
                onPress={() => send("zalo")}
                disabled={!valid}
                busy={submitting}
              />
              <GhostButton
                label={t("signIn.phone.sendSms")}
                onPress={() => send("sms")}
                disabled={!valid || submitting}
              />
            </>
          }
        >
          <StepNav step={1} onBack={onBack} />
          <Title>{t("signIn.phone.title")}</Title>
          <Caption>{t("signIn.phone.body")}</Caption>
          <form.Field name="phone">
            {(field) => (
              <>
                <View style={styles.field}>
                  <Text style={[text("body"), styles.country]}>VN +84</Text>
                  <TextInput
                    accessibilityLabel={t("signIn.phone.label")}
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    placeholder="0912 345 678"
                    placeholderTextColor={color.fgTertiary}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    autoFocus
                    style={styles.number}
                  />
                </View>
                {isSendError(field.state.meta.errors[0]) ? (
                  <Note tone="danger">{t(`signIn.phone.errors.${field.state.meta.errors[0]}`)}</Note>
                ) : null}
              </>
            )}
          </form.Field>
          <InfoGroup
            rows={[
              { title: t("signIn.phone.noCageTitle"), body: t("signIn.phone.noCageBody") },
              { title: t("signIn.phone.onceTitle"), body: t("signIn.phone.onceBody") },
              { title: t("signIn.phone.circleTitle"), body: t("signIn.phone.circleBody") },
            ]}
          />
        </Screen>
      )}
    </form.Subscribe>
  );
}

const CODE_LENGTH = 6;
const RESEND_AFTER_S = 60;

/** Screen 08b: the 6-digit code, with the phone's one-time-code autofill. */
export function CodeScreen({
  phoneNumber,
  channel: firstChannel,
  onBack,
  onSignedIn,
  step = { step: 1, total: 5 },
}: {
  phoneNumber: string;
  channel: CodeChannel;
  onBack: () => void;
  onSignedIn: () => void;
  /** Where this screen sits in the progress bar; the forgot-code path has its own. */
  step?: { step: number; total: number };
}) {
  const { t, i18n } = useTranslation();
  const [channel, setChannel] = useState(firstChannel);
  const [wait, setWait] = useState(RESEND_AFTER_S);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const form = useForm({
    defaultValues: { code: "" },
    validators: {
      // Errors are keys under signIn.code.errors.
      onSubmitAsync: async ({ value }) => {
        const result = await verifyCode(phoneNumber, value.code);

        return result === "ok" ? undefined : { fields: { code: result } };
      },
    },
    onSubmit: () => onSignedIn(),
  });

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);

    return () => clearTimeout(id);
  }, [wait]);

  async function resend(next: CodeChannel) {
    const result = await sendCode(phoneNumber, next, i18n.language);

    if (result === "ok") {
      setChannel(next);
      setWait(RESEND_AFTER_S);
      form.reset();
    } else {
      form.setFieldMeta("code", (m) => ({
        ...m,
        errorMap: { ...m.errorMap, onSubmit: result === "too_many" ? "too_many" : "error" },
      }));
    }
  }

  const timer = `0:${String(Math.max(wait, 0)).padStart(2, "0")}`;

  return (
    <Screen>
      <StepNav step={step.step} total={step.total} onBack={onBack} />
      <Title>{t("signIn.code.title")}</Title>
      <Text style={[text("caption"), { color: color.fgSecondary, marginTop: space[2] }]}>
        {t("signIn.code.sentTo", { channel: channel === "zalo" ? "Zalo" : "SMS" })}{" "}
        <Text style={{ color: color.fgPrimary, fontWeight: "500" }}>{formatPhone(phoneNumber)}</Text>.{" "}
        <Text accessibilityRole="link" onPress={onBack} style={{ color: color.blueText, fontWeight: "500" }}>
          {t("signIn.code.editNumber")}
        </Text>
      </Text>

      <form.Field
        name="code"
        listeners={{
          // Submit as soon as the sixth digit is in, typed or autofilled.
          onChange: ({ value }) => {
            if (value.length === CODE_LENGTH) void form.handleSubmit();
          },
        }}
      >
        {(field) => (
          <>
            <Pressable
              style={styles.boxes}
              onPress={() => input.current?.focus()}
              accessibilityLabel={t("signIn.code.title")}
            >
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <View key={i} style={[styles.box, i === field.state.value.length && styles.boxOn]}>
                  <Text style={{ fontSize: 26, color: color.fgPrimary }}>{field.state.value[i] ?? ""}</Text>
                </View>
              ))}
            </Pressable>
            {/* One hidden field takes the digits, so the keyboard's code suggestion fills all six. */}
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(submitting) => (
                <TextInput
                  ref={input}
                  value={field.state.value}
                  editable={!submitting}
                  onChangeText={(v) => field.handleChange(v.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoFocus
                  maxLength={CODE_LENGTH}
                  style={styles.hidden}
                />
              )}
            </form.Subscribe>

            <View style={styles.resend}>
              {wait > 0 ? (
                <Text style={[text("caption"), { color: color.fgSecondary }]}>
                  {t("signIn.code.resendIn", { time: timer })}
                </Text>
              ) : (
                <Text accessibilityRole="button" onPress={() => resend(channel)} style={[text("caption"), styles.link]}>
                  {t("signIn.code.resend")}
                </Text>
              )}
              {channel === "zalo" ? (
                <Text accessibilityRole="button" onPress={() => resend("sms")} style={[text("caption"), styles.link]}>
                  {t("signIn.code.viaSms")}
                </Text>
              ) : null}
            </View>
            {isVerifyError(field.state.meta.errors[0]) ? (
              <Note tone="danger">{t(`signIn.code.errors.${field.state.meta.errors[0]}`)}</Note>
            ) : null}
          </>
        )}
      </form.Field>

      <View style={styles.preview}>
        <Text style={[text("sectionLabel"), { color: color.fgTertiary, textTransform: "uppercase", paddingBottom: 10 }]}>
          {t("signIn.code.previewLabel")}
        </Text>
        <View style={styles.bubble}>
          <Text style={[text("caption"), { fontSize: 14, fontWeight: "500", color: color.fgPrimary }]}>
            {t("signIn.code.previewSender")}
          </Text>
          <Text style={[text("caption"), { fontSize: 14, color: color.fgPrimary }]}>
            {t("messages.code", { code: "482913" })}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

/**
 * Screen 08c: a number that has used Cage before keeps its codes and circle.
 * "Quên mã?" leads to the forgot-code path; the sign-in code just verified
 * is the proof, so no second code is sent.
 */
export function WelcomeBackScreen({
  me,
  onContinue,
  onForgotCodes,
}: {
  me: Me;
  onContinue: () => void;
  onForgotCodes?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Screen footer={<PrimaryButton label={t("common.continue")} onPress={onContinue} />}>
      <View style={{ height: space[5] }} />
      <Title>{t("signIn.welcomeBack.title")}</Title>
      <Caption>{t("signIn.welcomeBack.body", { phone: formatPhone(me.phoneNumber) })}</Caption>
      <InfoGroup
        heading={t("signIn.welcomeBack.restored")}
        rows={[
          { title: t("circle.name"), body: t("signIn.welcomeBack.people", { count: me.circleSize }), done: true },
          { title: t("signIn.welcomeBack.codes"), body: t("signIn.welcomeBack.codesKept"), done: true },
        ]}
      />
      <Note tone="info">{t("signIn.welcomeBack.permissions")}</Note>
      {onForgotCodes && me.hasCodes ? (
        <Text accessibilityRole="button" onPress={onForgotCodes} style={[text("caption"), styles.link, styles.forgot]}>
          {t("codes.forgot")}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: space[5],
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderWidth: 1,
    borderColor: color.fgPrimary,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  country: { paddingLeft: space[4], paddingRight: space[3], fontWeight: "500" },
  number: { flex: 1, height: "100%", paddingHorizontal: 14, fontSize: 20, color: color.fgPrimary },
  boxes: { marginTop: space[5], flexDirection: "row", gap: space[2] },
  box: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: color.fgPrimary },
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },
  resend: { marginTop: 14, flexDirection: "row", justifyContent: "space-between" },
  link: { color: color.blueText, fontWeight: "500" },
  forgot: { marginTop: space[4] },
  preview: { marginTop: space[5], borderRadius: radius.md, backgroundColor: color.surfaceHover, padding: space[3] },
  bubble: { backgroundColor: color.surface, borderRadius: 16, padding: space[3] },
});
