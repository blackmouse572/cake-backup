import { z } from "zod";

/** `GET /me`: what the app needs to decide between a new and a returning traveller (screen 08c). */
export const Me = z.object({
  phoneNumber: z.string(),
  /** Empty until the traveller sets one. */
  name: z.string(),
  hasCodes: z.boolean(),
  circleSize: z.number().int().nonnegative(),
  locale: z.enum(["vi", "en"]),
});

export type Me = z.infer<typeof Me>;


/** Body of `PUT /me/name`: the name the circle sees in messages and on the web page. */
export const SetName = z.object({ name: z.string().trim().min(1).max(50) });

export type SetName = z.infer<typeof SetName>;
