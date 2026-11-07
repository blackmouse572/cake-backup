import { layout } from "@cage/ui-tokens";
import type { Me } from "@cage/shared";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { I18nProvider } from "./src/i18n";
import { CircleScreen } from "./src/screens/circle";
import { JourneyFlow } from "./src/screens/journey";
import { SetCodesFlow } from "./src/screens/codes";
import { ResetCodesFlow } from "./src/screens/reset-codes";
import { fetchMe, hasStoredSession, type CodeChannel } from "./src/services/auth.service";
import { CodeScreen, PhoneScreen, WelcomeBackScreen } from "./src/screens/sign-in";
import { color } from "./src/theme";

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <Root />
        <StatusBar style="dark" />
      </I18nProvider>
    </SafeAreaProvider>
  );
}

type Step =
  | { name: "loading" }
  | { name: "phone" }
  | { name: "code"; phoneNumber: string; channel: CodeChannel }
  | { name: "welcomeBack"; me: Me }
  | { name: "circle"; hasCodes: boolean }
  | { name: "codes" }
  | { name: "resetCodes"; phoneNumber: string; fresh: boolean; back: Step }
  | { name: "home" }
  | { name: "circleSettings" };

/**
 * Sign-in, the safety circle and code setup (screens 08a, 08b, 08c, 09, 10,
 * 10b), and the forgot-code path from 08c (20a joins it with Settings, #31).
 * The welcome and permission steps (08, 11) join with #29.
 *
 * Once a session is stored the app never opens on a sign-in screen, even
 * offline (ADR 0002), so a failed lookup falls through to home.
 */
async function stepAfterSignIn(isReturn: boolean): Promise<Step> {
  try {
    const me = await fetchMe();

    if (me.circleSize === 0) return { name: "circle", hasCodes: me.hasCodes };

    if (!me.hasCodes) return { name: "codes" };

    return isReturn ? { name: "home" } : { name: "welcomeBack", me };
  } catch {
    return { name: "home" };
  }
}

function Root() {
  const [step, setStep] = useState<Step>({ name: "loading" });

  useEffect(() => {
    hasStoredSession()
      .then(async (signedIn) => setStep(signedIn ? await stepAfterSignIn(true) : { name: "phone" }))
      .catch(() => setStep({ name: "phone" }));
  }, []);

  switch (step.name) {
    case "loading":
      return (
        <View style={[styles.screen, { justifyContent: "center" }]}>
          <ActivityIndicator color={color.fgPrimary} />
        </View>
      );
    case "phone":
      return <PhoneScreen onSent={(phoneNumber, channel) => setStep({ name: "code", phoneNumber, channel })} />;
    case "code":
      return (
        <CodeScreen
          phoneNumber={step.phoneNumber}
          channel={step.channel}
          onBack={() => setStep({ name: "phone" })}
          onSignedIn={() => void stepAfterSignIn(false).then(setStep)}
        />
      );
    case "welcomeBack":
      return (
        <WelcomeBackScreen
          me={step.me}
          onContinue={() => setStep({ name: "home" })}
          onForgotCodes={() => setStep({ name: "resetCodes", phoneNumber: step.me.phoneNumber, fresh: true, back: step })}
        />
      );
    case "resetCodes":
      return (
        <ResetCodesFlow
          phoneNumber={step.phoneNumber}
          fresh={step.fresh}
          onBack={() => setStep(step.back)}
          onDone={() => setStep({ name: "home" })}
        />
      );
    case "circle":
      return (
        <CircleScreen
          mode="onboarding"
          onDone={() => setStep(step.hasCodes ? { name: "home" } : { name: "codes" })}
        />
      );
    case "codes":
      return <SetCodesFlow onBack={() => setStep({ name: "circle", hasCodes: false })} onDone={() => setStep({ name: "home" })} />;
    case "home":
      return <JourneyFlow onCircle={() => setStep({ name: "circleSettings" })} />;
    case "circleSettings":
      return <CircleScreen mode="settings" onBack={() => setStep({ name: "home" })} />;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bgPrimary, padding: layout.pageGutter },
});
