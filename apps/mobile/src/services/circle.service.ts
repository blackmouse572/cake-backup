import { ApiData, Circle, type NewCircleContact } from "@cage/shared";
import { apiFetch, errorCode } from "./api";

/**
 * The safety circle on the server. Each call returns the whole circle or a
 * small problem value instead of throwing, so screens only map results to
 * copy.
 */

export type AddProblem = "invalid_phone" | "own_number" | "circle_full" | "error";

const readCircle = async (res: Response): Promise<Circle> => ApiData(Circle).parse(await res.json()).data;

export async function fetchCircle(): Promise<Circle | "error"> {
  try {
    const res = await apiFetch("/circle");

    return res.ok ? await readCircle(res) : "error";
  } catch {
    return "error";
  }
}

/** Adds people after the existing ones. Someone already in the circle is skipped by the server. */
export async function addContacts(contacts: NewCircleContact[]): Promise<Circle | AddProblem> {
  try {
    const res = await apiFetch("/circle", { method: "POST", body: JSON.stringify({ contacts }) });

    if (res.ok) return await readCircle(res);
    const code = await errorCode(res);

    return code === "invalid_phone" || code === "own_number" || code === "circle_full" ? code : "error";
  } catch {
    return "error";
  }
}

export async function removeContact(id: string): Promise<"ok" | "error"> {
  try {
    const res = await apiFetch(`/circle/${encodeURIComponent(id)}`, { method: "DELETE" });

    // Already gone counts as removed.
    return res.ok || res.status === 404 ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** Saves the alert order: every contact's id, first to be told first. */
export async function reorderCircle(ids: string[]): Promise<Circle | "error"> {
  try {
    const res = await apiFetch("/circle/order", { method: "PUT", body: JSON.stringify({ ids }) });

    return res.ok ? await readCircle(res) : "error";
  } catch {
    return "error";
  }
}
