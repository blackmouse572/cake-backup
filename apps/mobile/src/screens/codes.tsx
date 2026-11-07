import { CODE_LENGTH } from "@cage/shared";
import { space } from "@cage/ui-tokens";
import { useReducer } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "../i18n";
import { saveCodes, type ResetCodesResult } from "../services/auth.service";
import { color, text } from "../theme";
import { Caption, CodeDots, Keypad, Note, Screen, StepNav, Title } from "../ui";
import { codesReducer, initialCodesState } from "./codes.reducer";

/** Where the two code steps sit in the surrounding flow's progress bar. */
interface CodeSteps {
  safe: number;
  duress: number;
  total: number;
}

const ONBOARDING_STEPS: CodeSteps = { safe: 4, duress: 5, total: 5 };

/**
 * Screens 10 and 10b. The flow lives in `codesReducer`; this component only
 * draws it and saves once both codes are confirmed. The server checks the
 * same rules again (`codesProblem`).
 *
 * The forgot-code path passes its own `save` (`resetCodes`) and steps;
 * `onReverify` runs when the server wants a fresh sign-in code first.
 */
export function SetCodesFlow({
  onBack,
  onDone,
  onReverify,
  save = saveCodes,
  steps = ONBOARDING_STEPS,
}: {
  onBack?: () => void;
  onDone: () => void;
  onReverify?: () => void;
  save?: (safe: string, duress: string) => Promise<ResetCodesResult>;
  steps?: CodeSteps;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(codesReducer, initialCodesState);
  const { step, first, entry, problem } = state;

  /** Types a digit; when that confirms both codes, saves them. */
  async function digit(d: string) {
    const action = { type: "digit", digit: d } as const;
    const next = codesReducer(state, action);
    dispatch(action);

    if (!next.submit || state.submit) return;
    const result = await save(next.submit.safe, next.submit.duress);

    if (result === "ok") onDone();
    else if (result === "reverify_required" && onReverify) onReverify();
    else dispatch({ type: "saveFailed", problem: result === "reverify_required" ? "error" : result });
  }

  const isSafe = step === "safe";
  const back = isSafe ? onBack : () => dispatch({ type: "back" });

  return (
    <Screen
      footer={
        <Keypad
          onDigit={(d) => void digit(d)}
          onDelete={() => dispatch({ type: "delete" })}
        />
      }
    >
      <StepNav step={isSafe ? steps.safe : steps.duress} total={steps.total} onBack={back} />
      <Title>{t(isSafe ? "codes.safe.title" : "codes.duress.title")}</Title>
      <Caption>{t(isSafe ? "codes.safe.body" : "codes.duress.body")}</Caption>
      <View style={{ marginTop: space[7], alignItems: "center", gap: space[3] }}>
        <CodeDots length={CODE_LENGTH} filled={entry.length} />
        <Text style={[text("caption"), { color: color.fgSecondary }]}>
          {t(first === null ? "codes.enter" : "codes.confirm")}
        </Text>
      </View>
      {problem ? <Note tone="danger">{t(`codes.errors.${problem}`)}</Note> : null}
    </Screen>
  );
}
