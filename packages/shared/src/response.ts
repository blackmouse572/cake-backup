import { z } from "zod";

/**
 * Every API response (outside Better Auth's `/auth/*`) has one of two bodies:
 *
 *   success: `{ "data": ... }`
 *   failure: `{ "error": { "code": "too_close", "message"?: "..." } }`
 *
 * The HTTP status says which; `code` says why, and clients map it to copy.
 * `message` is for developers only, never shown to a traveller. A success
 * with nothing to return is `204` with no body.
 */

/** Why a request failed. Clients switch on these, so only add to the list. */
export const ErrorCode = z.enum([
  // Generic
  "invalid_request",
  "unauthorized",
  "not_found",
  "internal",
  // Safe code and duress PIN
  "format",
  "too_simple",
  "too_close",
  "current_required",
  "wrong_code",
  "too_many_tries",
  // Forgot code (PUT /me/codes/reset)
  "reverify_required",
  "journey_open",
  // Safety circle
  "invalid_phone",
  "own_number",
  "circle_full",
  "order_mismatch",
  // Journeys
  "no_codes",
  // Circle links (POST /links/:token/reached)
  "no_alert",
  // Place search and routes
  "maps_unavailable",
  "rate_limited",
  // Hackathon demo
  "wrong_demo_key",
  "demo_locked",
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

/** The body of an API error response, e.g. `{ "error": { "code": "too_close" } }`. */
export const ApiError = z.object({
  error: z.object({ code: ErrorCode, message: z.string().optional() }),
});

export type ApiError = z.infer<typeof ApiError>;

/** The body of a success response carrying `data` of the given schema. */
export const ApiData = <T extends z.ZodType>(data: T) => z.object({ data });

/** Builds a success body. */
export const success = <T>(data: T) => ({ data });

/** Builds an error body. */
export const failure = <C extends ErrorCode>(code: C, message?: string) => ({
  error: message === undefined ? { code } : { code, message },
});
