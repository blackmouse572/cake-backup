import type { Db } from "@cage/db";
import { codesProblem, type CodeCheck, type CodeProblem, type ResetCodes, type SetCodes } from "@cage/shared";
import { CHANGE_CODES, RESET_CODES } from "../constants";
import { travellerSettingsRepository, type TravellerSettings } from "../repositories/traveller-settings.repository";
import { hashCode, matchesHash } from "../utils";

/**
 * Which code was entered. Both hashes are always computed, so the safe code,
 * the duress PIN and a wrong code take the same time. The answer must never
 * reach the phone as is: callers give the same response for "safe" and
 * "duress" and act on the difference only on the server (ADR 0002).
 */
export async function checkCode(
  pepper: string,
  hashes: { safe: string | null; duress: string | null },
  code: string,
): Promise<CodeCheck> {
  const [safe, duress] = await Promise.all([
    matchesHash(pepper, code, hashes.safe),
    matchesHash(pepper, code, hashes.duress),
  ]);

  return safe ? "safe" : duress ? "duress" : "wrong";
}

/**
 * "duress": the duress PIN was the current code. Nothing changed; the caller
 * answers exactly as for "ok" and alerts any open journey after the response.
 */
export type SetCodesResult = "ok" | "duress" | CodeProblem | "current_required" | "wrong_code" | "too_many_tries";

/** "safe" and "no_codes" end the session; "duress" only looks as if it did. */
export type SignOutCheck = "safe" | "duress" | "no_codes" | "current_required" | "wrong_code" | "too_many_tries";

export type ResetCodesResult = "ok" | CodeProblem | "reverify_required" | "journey_open";

/** What the forgot-code path needs to know about journeys. */
export interface OpenJourneys {
  hasOpen(userId: string): Promise<boolean>;
}

/** The safe code and duress PIN of one traveller. */
export function codesService(db: Db, pepper: string, journeys: OpenJourneys) {
  const settings = travellerSettingsRepository(db);

  /**
   * Checks a code behind the wrong-try lock that changing the codes and
   * signing out share, and counts a wrong code against it. The caller has
   * already seen that the codes are set.
   */
  async function tryCode(
    userId: string,
    row: TravellerSettings,
    code: string,
    now: number,
  ): Promise<CodeCheck | "too_many_tries"> {
    const recent = row.codeFailedAt && now - row.codeFailedAt.getTime() < CHANGE_CODES.windowMs;
    const failures = recent ? row.codeFailures : 0;

    if (failures >= CHANGE_CODES.tries) return "too_many_tries";

    const check = await checkCode(pepper, { safe: row.safeCodeHash, duress: row.duressCodeHash }, code);

    if (check === "wrong") await settings.recordCodeFailure(userId, failures + 1, new Date(now));

    return check;
  }

  return {
    async check(userId: string, code: string): Promise<CodeCheck> {
      const row = await settings.find(userId);

      return checkCode(pepper, { safe: row?.safeCodeHash ?? null, duress: row?.duressCodeHash ?? null }, code);
    },

    /**
     * Whether this traveller may sign out. Signing out needs the safe code,
     * so a thief holding a signed-in phone can't sign out to stop the alerts.
     * The duress PIN is told apart only here: the caller answers it like the
     * safe code but keeps the session, and alerts any open journey's circle. With no codes set yet there is nothing
     * to protect, so the traveller may sign out without one.
     */
    async confirmSignOut(userId: string, code: string | undefined, now = Date.now()): Promise<SignOutCheck> {
      const row = await settings.find(userId);

      if (!row?.safeCodeHash) return "no_codes";

      if (!code) return "current_required";
      const check = await tryCode(userId, row, code, now);

      return check === "wrong" ? "wrong_code" : check;
    },

    /**
     * Sets the codes the first time, or changes them with the current safe
     * code. The duress PIN as the current code returns "ok" like the safe
     * code but changes nothing, so someone forcing the change learns nothing
     * and the traveller's real codes keep working. It comes back as "duress"
     * so the caller can alert any open journey's circle.
     */
    async set(userId: string, { safe, duress, current }: SetCodes, now = Date.now()): Promise<SetCodesResult> {
      const problem = codesProblem(safe, duress);

      if (problem) return problem;

      const row = await settings.find(userId);

      if (row?.safeCodeHash) {
        if (!current) return "current_required";
        const check = await tryCode(userId, row, current, now);

        if (check === "too_many_tries") return check;

        if (check === "wrong") return "wrong_code";

        // Nothing changes; the caller alerts the circle of any open journey.
        if (check === "duress") return "duress";
      }

      const [safeCodeHash, duressCodeHash] = await Promise.all([hashCode(pepper, safe), hashCode(pepper, duress)]);
      await settings.saveCodeHashes(userId, { safeCodeHash, duressCodeHash });

      return "ok";
    },

    /**
     * The "Quên mã?" (forgot code) path: replaces both codes without the
     * current safe code. The proof is the phone itself: the session must be
     * fresh from a sign-in code (RESET_CODES.freshSessionMs). It is refused
     * while a journey is open, so nobody can take the codes over mid-journey;
     * there the traveller lets the timer run out and Cage tells the circle
     * (screen 26). Clears the wrong-try count.
     */
    async reset(
      userId: string,
      { safe, duress }: ResetCodes,
      sessionCreatedAt: number,
      now = Date.now(),
    ): Promise<ResetCodesResult> {
      const problem = codesProblem(safe, duress);

      if (problem) return problem;

      if (now - sessionCreatedAt > RESET_CODES.freshSessionMs) return "reverify_required";

      if (await journeys.hasOpen(userId)) return "journey_open";

      const [safeCodeHash, duressCodeHash] = await Promise.all([hashCode(pepper, safe), hashCode(pepper, duress)]);
      await settings.saveCodeHashes(userId, { safeCodeHash, duressCodeHash });

      return "ok";
    },
  };
}
