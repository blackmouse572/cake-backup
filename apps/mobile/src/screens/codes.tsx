import { CODE_LENGTH } from "@cage/shared";
import { space } from "@cage/ui-tokens";
import { useReducer } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "../i18n";
import { saveCodes, type CodesSaveResult } from "../services/auth.service";
import { color, text } from "../theme";
import { Caption, CodeDots, Keypad, Note, Screen, StepNav, Title } from "../ui";
import { changeCodesState, codesReducer, initialCodesState } from "./codes.reducer";

/** Where the code steps sit in the surrounding flow's progress bar. */
interface CodeSteps {
  /** Only when changing the codes: the current safe code comes first. */
  current?: number;
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
 * Changing the codes (20a) sets `change`: it asks for the current safe code
 * first and hands it to `save`.
 */
export function SetCodesFlow({
  onBack,
  onDone,
  onReverify,
  save = saveCodes,
  steps = ONBOARDING_STEPS,
  change = false,
}: {
  onBack?: () => void;
  onDone: () => void;
  onReverify?: () => void;
  save?: (safe: string, duress: string, current: string | undefined) => Promise<CodesSaveResult>;
  steps?: CodeSteps;
  change?: boolean;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(codesReducer, change ? changeCodesState : initialCodesState);
  const { step, first, entry, problem } = state;

  /** Types a digit; when that confirms both codes, saves them. */
  async function digit(d: string) {
    const action = { type: "digit", digit: d } as const;
    const next = codesReducer(state, action);
    dispatch(action);

    if (!next.submit || state.submit) return;
    const result = await save(next.submit.safe, next.submit.duress, next.submit.current);

    if (result === "ok") onDone();
    else if (result === "reverify_required" && onReverify) onReverify();
    else dispatch({ type: "saveFailed", problem: result === "reverify_required" ? "error" : result });
  }

  const isCurrent = step === "current";
  const isSafe = step === "safe";
  const back = isCurrent || isSafe ? onBack : () => dispatch({ type: "back" });
  const stepNumber = isCurrent ? (steps.current ?? 1) : isSafe ? steps.safe : steps.duress;
  const copy = isCurrent ? "codes.current" : isSafe ? "codes.safe" : "codes.duress";

  return (
    <Screen
      footer={
        <Keypad
          onDigit={(d) => void digit(d)}
          onDelete={() => dispatch({ type: "delete" })}
        />
      }
    >
      <StepNav step={stepNumber} total={steps.total} onBack={back} />
      <Title>{t(`${copy}.title`)}</Title>
      <Caption>{t(`${copy}.body`)}</Caption>
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
