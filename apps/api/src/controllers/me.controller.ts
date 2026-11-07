import { createDb } from "@cage/db";
import { failure, ResetCodes, SetCodes, SetName, SetSettings, SignOut, success } from "@cage/shared";
import { Hono } from "hono";
import { requireSession } from "../middleware/require-session";
import { messageSenderFor } from "../message-sender";
import { logError } from "../middleware/request-log";
import { validate } from "../middleware/validate";
import { circleMessagesService } from "../services/circle-messages.service";
import { codesService } from "../services/codes.service";
import { journeysService } from "../services/journeys.service";
import { meService } from "../services/me.service";
import { sessionsService } from "../services/sessions.service";
import type { AuthedEnv } from "../types";

const codes = (env: AuthedEnv["Bindings"]) => {
  const db = createDb(env.DB);

  return codesService(db, env.CODE_PEPPER, journeysService(db, env.JOURNEY, env.CODE_PEPPER));
};

/**
 * Tells the circle the codes were reset (#35). Runs after the answer is sent,
 * so a slow or failing provider never holds up or undoes the reset.
 */
async function tellCircleCodesReset(env: AuthedEnv["Bindings"], userId: string): Promise<void> {
  try {
    const db = createDb(env.DB);
    await circleMessagesService(db, messageSenderFor(env, db), env.CIRCLE_WEB_URL).codesReset(userId);
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), "me.codes-reset");
  }
}

/** `/me`: the signed-in traveller's own account. HTTP in and out only; rules are in the services. */
export const meController = new Hono<AuthedEnv>()
  .use(requireSession)
  .get("/", async (c) => c.json(success(await meService(createDb(c.env.DB)).get(c.var.userId))))
  /** The name the circle sees in messages and on the web page. */
  .put("/name", validate("json", SetName), async (c) => {
    await meService(createDb(c.env.DB)).setName(c.var.userId, c.req.valid("json").name);

    return c.body(null, 204);
  })
  /** Settings (screen 20): the language, also used for the circle's SMS, and the police switch. */
  .put("/settings", validate("json", SetSettings), async (c) => {
    await meService(createDb(c.env.DB)).updateSettings(c.var.userId, c.req.valid("json"));

    return c.body(null, 204);
  })
  /**
   * Signs out with the safe code (screen 20). The duress PIN gets the same
   * 204 but keeps the session. The session ends after the answer is sent, so
   * both codes take the same time.
   */
  .post("/sign-out", validate("json", SignOut), async (c) => {
    const result = await codes(c.env).confirmSignOut(c.var.userId, c.req.valid("json").code);

    switch (result) {
      case "safe":
      case "no_codes":
        c.executionCtx.waitUntil(sessionsService(c.env).end(c.req.raw.headers));

        return c.body(null, 204);
      case "duress":
        return c.body(null, 204);
      case "current_required":
        return c.json(failure(result), 400);
      case "wrong_code":
        return c.json(failure(result), 403);
      case "too_many_tries":
        return c.json(failure(result), 429);
    }
  })
  /**
   * Sets the safe code and duress PIN (screens 10 and 10b) or changes them
   * (20a, which needs the current safe code). The duress PIN gets the same
   * 204 as the safe code.
   */
  .put("/codes", validate("json", SetCodes), async (c) => {
    const result = await codes(c.env).set(c.var.userId, c.req.valid("json"));

    switch (result) {
      case "ok":
        return c.body(null, 204);
      case "wrong_code":
        return c.json(failure(result), 403);
      case "too_many_tries":
        return c.json(failure(result), 429);
      default:
        return c.json(failure(result), 400);
    }
  })
  /**
   * "Quên mã?" (forgot code): new codes without the current safe code. Needs
   * a session made in the last few minutes by a fresh sign-in code (403
   * reverify_required otherwise, and the app sends one), and no open journey
   * (409 journey_open: mid-journey the traveller lets the timer run out).
   * After a reset the circle gets a quiet heads-up.
   */
  .put("/codes/reset", validate("json", ResetCodes), async (c) => {
    const result = await codes(c.env).reset(c.var.userId, c.req.valid("json"), c.var.sessionCreatedAt);

    switch (result) {
      case "ok":
        c.executionCtx.waitUntil(tellCircleCodesReset(c.env, c.var.userId));

        return c.body(null, 204);
      case "reverify_required":
        return c.json(failure(result), 403);
      case "journey_open":
        return c.json(failure(result), 409);
      default:
        return c.json(failure(result), 400);
    }
  });
