import { z } from "zod";
import { Code } from "./codes";

/** `GET /me`: what the app needs to decide between a new and a returning traveller (screen 08c). */
export const Me = z.object({
  phoneNumber: z.string(),
  /** Empty until the traveller sets one. */
  name: z.string(),
  hasCodes: z.boolean(),
  circleSize: z.number().int().nonnegative(),
  locale: z.enum(["vi", "en"]),
  /** Off by default: police (Công an 113) are the last step of the ladder, and only if the traveller turned it on. */
  policeEnabled: z.boolean(),
});

export type Me = z.infer<typeof Me>;

/**
 * Body of `PUT /me/settings` (screen 20): the app's language, which also
 * picks the language of the circle's SMS, and the police switch. Send only
 * what changed.
 */
export const SetSettings = z
  .object({
    locale: z.enum(["vi", "en"]),
    policeEnabled: z.boolean(),
  })
  .partial()
  .refine((settings) => Object.keys(settings).length > 0, { message: "Nothing to change" });

export type SetSettings = z.infer<typeof SetSettings>;

/**
 * Body of `POST /me/sign-out`: the safe code or the duress PIN. Both get the
 * same answer. The code may be left out only while no codes are set yet.
 */
export const SignOut = z.object({ code: Code.optional() });

export type SignOut = z.infer<typeof SignOut>;

/** Body of `PUT /me/name`: the name the circle sees in messages and on the web page. */
export const SetName = z.object({ name: z.string().trim().min(1).max(50) });

export type SetName = z.infer<typeof SetName>;
