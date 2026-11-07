import { z } from "zod";

/**
 * The safe code (mã an toàn) and the duress PIN (mã khẩn cấp). Both are four
 * digits, typed on the same keypad, and give the same visible result; only
 * the server knows which one was entered (PRD, "Duress PIN"; ADR 0002).
 */
export const CODE_LENGTH = 4;

export const Code = z.string().regex(/^\d{4}$/);

/** What the server found when a code was entered. Never sent to the phone. */
export type CodeCheck = "safe" | "duress" | "wrong";

/** Why a new pair of codes was refused. */
export type CodeProblem = "format" | "too_simple" | "too_close";

/** All one digit (0000) or a straight run (1234, 9876): the first codes anyone tries. */
export function isTooSimple(code: string): boolean {
  const d = [...code].map(Number);
  const steps = new Set(d.slice(1).map((n, i) => n - d[i]!));

  return steps.size === 1 && [0, 1, -1].includes([...steps][0]!);
}

/** How many positions differ between two codes of the same length. */
export function differingDigits(a: string, b: string): number {
  let n = 0;

  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;

  return n;
}

/**
 * Checks a new safe code and duress PIN. They must differ in at least two
 * digits (screen 10b), so a single slip of the finger can't send an alert or
 * fail to send one.
 */
export function codesProblem(safe: string, duress: string): CodeProblem | null {
  if (!Code.safeParse(safe).success || !Code.safeParse(duress).success) return "format";

  if (isTooSimple(safe) || isTooSimple(duress)) return "too_simple";

  if (differingDigits(safe, duress) < 2) return "too_close";

  return null;
}

/** Body of `PUT /me/codes`. `current` (the safe code) is required once codes exist. */
export const SetCodes = z.object({
  safe: Code,
  duress: Code,
  current: Code.optional(),
});

export type SetCodes = z.infer<typeof SetCodes>;

/**
 * Body of `PUT /me/codes/reset`, the "Quên mã?" (forgot code) path. No
 * current code: the proof is a phone code verified in the last few minutes
 * (a fresh session), and it is refused while a journey is open.
 */
export const ResetCodes = z.object({
  safe: Code,
  duress: Code,
});

export type ResetCodes = z.infer<typeof ResetCodes>;
