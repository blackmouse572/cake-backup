import { ApiData, JourneyView, StartedJourney, type LocationUpdate, type StartJourney } from "@cage/shared";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { API_URL, accessHeaders } from "../auth";
import { apiFetch, errorCode } from "./api";

/**
 * The traveller's journey on the server. Calls return a value or a small
 * problem string instead of throwing, so screens only map results to copy.
 */

const CURRENT_KEY = "cage.journey";

const Current = z.object({ id: z.string(), token: z.string() });

export type Current = z.infer<typeof Current>;

const readView = async (res: Response) => ApiData(JourneyView).parse(await res.json()).data;

export async function startJourney(input: StartJourney): Promise<StartedJourney | "no_codes" | "error"> {
  try {
    const res = await apiFetch("/journeys", { method: "POST", body: JSON.stringify(input) });

    if (res.ok) {
      const started = ApiData(StartedJourney).parse(await res.json()).data;
      await SecureStore.setItemAsync(CURRENT_KEY, JSON.stringify({ id: started.journey.id, token: started.journeyToken }));

      return started;
    }

    return (await errorCode(res)) === "no_codes" ? "no_codes" : "error";
  } catch {
    return "error";
  }
}

/** The journey this phone is on, kept in secure storage so a restart picks it up again. */
export async function currentJourney(): Promise<Current | null> {
  const parsed = Current.safeParse(JSON.parse((await SecureStore.getItemAsync(CURRENT_KEY)) ?? "null"));

  return parsed.success ? parsed.data : null;
}

export async function forgetJourney(): Promise<void> {
  await SecureStore.deleteItemAsync(CURRENT_KEY);
}

/** What the phone should show. "gone" when the journey no longer exists for this traveller. */
export async function fetchJourney(id: string): Promise<JourneyView | "gone" | "error"> {
  try {
    const res = await apiFetch(`/journeys/${encodeURIComponent(id)}`);

    if (res.status === 404) return "gone";

    return res.ok ? await readView(res) : "error";
  } catch {
    return "error";
  }
}

/** Sends a position with the journey token, not the session, so an expired session never stops a journey. */
export async function sendUpdate(current: Current, update: LocationUpdate): Promise<JourneyView | "error"> {
  try {
    const res = await fetch(`${API_URL}/journeys/${encodeURIComponent(current.id)}/updates`, {
      method: "POST",
      headers: { ...accessHeaders, authorization: `Bearer ${current.token}`, "content-type": "application/json" },
      body: JSON.stringify(update),
    });

    return res.ok ? await readView(res) : "error";
  } catch {
    return "error";
  }
}

/** SOS: alerts the circle at once, with no code. Comes back with the journey as the phone should now show it. "gone" when the journey no longer exists for this traveller. */
export async function sendSos(id: string): Promise<JourneyView | "gone" | "error"> {
  try {
    const res = await apiFetch(`/journeys/${encodeURIComponent(id)}/sos`, { method: "POST" });

    if (res.status === 404) return "gone";

    return res.ok ? await readView(res) : "error";
  } catch {
    return "error";
  }
}

/** The safe code or the duress PIN, to answer a check-in or to end the trip. Both come back "ok". */
export async function enterCode(
  id: string,
  purpose: "answer" | "end",
  code: string,
): Promise<"ok" | "wrong_code" | "too_many_tries" | "error"> {
  try {
    const res = await apiFetch(`/journeys/${encodeURIComponent(id)}/${purpose}`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });

    if (res.status === 204) return "ok";
    const problem = await errorCode(res);

    return problem === "wrong_code" || problem === "too_many_tries" ? problem : "error";
  } catch {
    return "error";
  }
}
