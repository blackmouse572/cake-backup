import type { SetSettings } from "@cage/shared";
import { authClient } from "../auth";
import { apiFetch, errorCode } from "./api";

/**
 * The traveller's settings on the server (screen 20). Calls return a small
 * problem string instead of throwing, so screens only map results to copy.
 */

/** Saves what changed: the language, which also picks the language of the circle's SMS, or the police switch. */
export async function saveSettings(changes: SetSettings): Promise<"ok" | "error"> {
  try {
    const res = await apiFetch("/me/settings", { method: "PUT", body: JSON.stringify(changes) });

    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export type SignOutResult = "ok" | "wrong_code" | "too_many_tries" | "error";

/**
 * Signs out with the safe code. The duress PIN comes back "ok" too, and the
 * phone signs out either way (the server keeps that session alive, so the
 * code is checked only there).
 */
export async function signOutWithCode(code: string): Promise<SignOutResult> {
  try {
    const res = await apiFetch("/me/sign-out", { method: "POST", body: JSON.stringify({ code }) });

    if (!res.ok) {
      const problem = await errorCode(res);

      return problem === "wrong_code" || problem === "too_many_tries" ? problem : "error";
    }
  } catch {
    return "error";
  }

  // The server took the code. Forgetting the session on this phone is the Expo client's job, and it does it as the
  // request goes out. The API answers that route with 404 on purpose (a session alone can't sign out), so the answer is ignored.
  await authClient.signOut().catch(() => {});

  return "ok";
}
