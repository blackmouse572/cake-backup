import { formatPhone } from "@cage/shared";
import { useState } from "react";
import { useTranslation } from "../i18n";
import { resetCodes, sendCode, type CodeChannel, type SendCodeResult } from "../services/auth.service";
import { Caption, GhostButton, Note, PrimaryButton, Screen, StepNav, Title } from "../ui";
import { SetCodesFlow } from "./codes";
import { CodeScreen } from "./sign-in";

/** Intro, sign-in code, safe code, duress code. */
const TOTAL = 4;

type Step = { name: "intro" } | { name: "code"; channel: CodeChannel } | { name: "codes" };

/**
 * "Quên mã?" (forgot code): prove it's this phone with a new sign-in code,
 * then set both codes again (`PUT /me/codes/reset`). The server refuses it
 * during a journey; there the traveller lets the timer run out (screen 26).
 *
 * `fresh` skips the sign-in code when one was verified moments ago (08c).
 */
export function ResetCodesFlow({
  phoneNumber,
  fresh = false,
  onBack,
  onDone,
}: {
  phoneNumber: string;
  fresh?: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>(fresh ? { name: "codes" } : { name: "intro" });
  const intro = () => setStep({ name: "intro" });

  switch (step.name) {
    case "intro":
      return (
        <ResetIntro
          phoneNumber={phoneNumber}
          onBack={onBack}
          onSent={(channel) => setStep({ name: "code", channel })}
        />
      );
    case "code":
      return (
        <CodeScreen
          phoneNumber={phoneNumber}
          channel={step.channel}
          step={{ step: 2, total: TOTAL }}
          onBack={intro}
          onSignedIn={() => setStep({ name: "codes" })}
        />
      );
    case "codes":
      return (
        <SetCodesFlow
          save={resetCodes}
          steps={{ safe: 3, duress: 4, total: TOTAL }}
          onBack={fresh ? onBack : intro}
          onReverify={intro}
          onDone={onDone}
        />
      );
  }
}

type SendError = Exclude<SendCodeResult, "ok">;

/** Says what will happen, then sends the sign-in code by Zalo or SMS. */
function ResetIntro({
  phoneNumber,
  onBack,
  onSent,
}: {
  phoneNumber: string;
  onBack: () => void;
  onSent: (channel: CodeChannel) => void;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SendError | null>(null);

  async function send(channel: CodeChannel) {
    setBusy(true);
    const result = await sendCode(phoneNumber, channel, i18n.language);
    setBusy(false);

    if (result === "ok") onSent(channel);
    else setProblem(result);
  }

  return (
    <Screen
      footer={
        <>
          <PrimaryButton label={t("signIn.phone.sendZalo")} busy={busy} onPress={() => void send("zalo")} />
          <GhostButton label={t("signIn.phone.sendSms")} disabled={busy} onPress={() => void send("sms")} />
        </>
      }
    >
      <StepNav step={1} total={TOTAL} onBack={onBack} />
      <Title>{t("codes.reset.title")}</Title>
      <Caption>{t("codes.reset.body", { phone: formatPhone(phoneNumber) })}</Caption>
      <Note tone="info">{t("codes.reset.oldCodesNote")}</Note>
      <Note tone="warning">{t("codes.reset.journeyNote")}</Note>
      {problem ? <Note tone="danger">{t(`signIn.phone.errors.${problem}`)}</Note> : null}
    </Screen>
  );
}
