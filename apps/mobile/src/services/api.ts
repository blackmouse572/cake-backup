import { ApiError, type ErrorCode } from "@cage/shared";
import { API_URL, accessHeaders, authClient } from "../auth";

/** A request to the API with the traveller's session and, on staging, the Access headers. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  for (const [name, value] of Object.entries(accessHeaders)) headers.set(name, value);
  headers.set("cookie", await authClient.getCookie());

  if (init.body) headers.set("content-type", "application/json");

  return fetch(`${API_URL}${path}`, { ...init, headers });
}

/** The `code` of an error response, or null when the body isn't the standard error. */
export async function errorCode(res: Response): Promise<ErrorCode | null> {
  const body = ApiError.safeParse(await res.json().catch(() => null));

  return body.success ? body.data.error.code : null;
}
