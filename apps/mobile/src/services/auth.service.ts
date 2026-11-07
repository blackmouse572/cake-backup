import { ApiData, Me } from "@cage/shared";
import { authClient } from "../auth";
import { apiFetch, errorCode } from "./api";

/**
 * Everything the screens need from the API for sign-in and codes. Each call
 * returns a small result value instead of throwing, so screens only map
 * results to copy.
 */

export type CodeChannel = "zalo" | "sms";

export type SendCodeResult = "ok" | "invalid" | "too_many" | "error";

export type VerifyCodeResult = "ok" | "wrong" | "too_many" | "error";

export type SaveCodesResult = "ok" | "too_simple" | "too_close" | "error";

/** `reverify_required`: the session is too old, send a new sign-in code first. */
export type ResetCodesResult = SaveCodesResult | "reverify_required" | "journey_open";

/** `wrong_code` and `too_many_tries`: the current safe code wasn't taken (screen 20a). */
export type ChangeCodesResult = SaveCodesResult | "wrong_code" | "too_many_tries";

/** What a code flow's save step can answer, so one screen serves setting, resetting and changing the codes. */
export type CodesSaveResult = ResetCodesResult | ChangeCodesResult;

/** True when a session is stored on this device, even offline. */
export async function hasStoredSession(): Promise<boolean> {
  return (await authClient.getCookie()).includes("session_token");
}

/** Asks the API to send a sign-in code. The message never names Cage (ADR 0002). */
export async function sendCode(phoneNumber: string, channel: CodeChannel, language: string): Promise<SendCodeResult> {
  try {
    const { error } = await authClient.phoneNumber.sendOtp({
      phoneNumber,
      fetchOptions: { headers: { "x-code-channel": channel, "accept-language": language } },
    });

    if (!error) return "ok";

    return error.status === 429 ? "too_many" : error.status === 400 ? "invalid" : "error";
  } catch {
    return "error";
  }
}

/** Checks the sign-in code; on "ok" the session is stored. */
export async function verifyCode(phoneNumber: string, code: string): Promise<VerifyCodeResult> {
  try {
    const { error } = await authClient.phoneNumber.verify({ phoneNumber, code });

    if (!error) return "ok";

    return error.status === 429 ? "too_many" : error.status === 400 || error.status === 403 ? "wrong" : "error";
  } catch {
    return "error";
  }
}

export async function fetchMe(): Promise<Me> {
  const res = await apiFetch("/me");

  if (!res.ok) throw new Error(`GET /me ${res.status}`);

  return ApiData(Me).parse(await res.json()).data;
}

/** Sends a pair of codes and maps the API's error codes to the ones the screens know. */
async function putCodes<R extends string>(
  path: string,
  body: { safe: string; duress: string; current?: string },
  known: R[],
): Promise<"ok" | R | "error"> {
  try {
    const res = await apiFetch(path, { method: "PUT", body: JSON.stringify(body) });

    if (res.ok) return "ok";
    const code = await errorCode(res);

    return known.find((k) => k === code) ?? "error";
  } catch {
    return "error";
  }
}

/** First-time setup of the safe code and duress PIN (screens 10 and 10b). */
export function saveCodes(safe: string, duress: string): Promise<SaveCodesResult> {
  return putCodes("/me/codes", { safe, duress }, ["too_simple", "too_close"]);
}

/** Screen 20a: new codes, with the current safe code to prove it is the traveller. */
export function changeCodes(safe: string, duress: string, current: string | undefined): Promise<ChangeCodesResult> {
  return putCodes("/me/codes", { safe, duress, current }, ["too_simple", "too_close", "wrong_code", "too_many_tries"]);
}

/**
 * "Quên mã?": new codes without the current safe code. Works only right
 * after a sign-in code to this phone, and never during a journey.
 */
export function resetCodes(safe: string, duress: string): Promise<ResetCodesResult> {
  return putCodes("/me/codes/reset", { safe, duress }, [
    "too_simple",
    "too_close",
    "reverify_required",
    "journey_open",
  ]);
}
