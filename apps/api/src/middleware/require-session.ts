import { failure } from "@cage/shared";
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AuthedEnv } from "../types";

/**
 * Lets a request through only with a signed-in session (cookie or the app's
 * Expo header). Also sets when the session was created: a session made in
 * the last few minutes proves the phone just received a sign-in code.
 */
export const requireSession = createMiddleware<AuthedEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });

  if (!session) return c.json(failure("unauthorized"), 401);
  c.set("userId", session.user.id);
  c.set("sessionCreatedAt", session.session.createdAt.getTime());
  await next();
});
