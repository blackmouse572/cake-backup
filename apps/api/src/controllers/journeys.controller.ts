import { createDb } from "@cage/db";
import { EnterCode, failure, LocationUpdate, StartJourney, success } from "@cage/shared";
import { Hono, type Context } from "hono";
import type { CodeResult } from "../journey-object";
import { requireJourneyToken } from "../middleware/require-journey-token";
import { requireSession } from "../middleware/require-session";
import { validate } from "../middleware/validate";
import { journeysService } from "../services/journeys.service";
import type { AppEnv, AuthedEnv } from "../types";

const service = (env: AppEnv["Bindings"]) => journeysService(createDb(env.DB), env.JOURNEY, env.CODE_PEPPER);

/** The answer to a code entered on a journey. The safe code and the duress PIN both get 204. */
function codeResponse(c: Context<AuthedEnv>, result: CodeResult) {
  switch (result) {
    case "ok":
      return c.body(null, 204);
    case "wrong_code":
      return c.json(failure(result), 403);
    case "too_many_tries":
      return c.json(failure(result), 429);
    case "not_found":
      return c.json(failure(result), 404);
  }
}

/**
 * `/journeys`. Starting, reading, answering and ending a journey need the
 * traveller's session; location updates need the journey token from
 * `POST /journeys` instead.
 */
export const journeysController = new Hono<AppEnv>()
  .post("/", requireSession, validate("json", StartJourney), async (c) => {
    const result = await service(c.env).start(c.var.userId, c.req.valid("json"));

    return result === "no_codes" ? c.json(failure(result), 409) : c.json(success(result), 201);
  })
  .post("/:id/updates", requireJourneyToken, validate("json", LocationUpdate), async (c) => {
    const result = await service(c.env).update(c.req.param("id"), c.var.journeyToken, c.req.valid("json"));

    return result === "unauthorized" ? c.json(failure(result), 401) : c.json(success(result));
  })
  .get("/:id", requireSession, async (c) => {
    const view = await service(c.env).view(c.var.userId, c.req.param("id"));

    return view ? c.json(success(view)) : c.json(failure("not_found"), 404);
  })
  .post("/:id/check-in", requireSession, async (c) => {
    const view = await service(c.env).requestCheckIn(c.var.userId, c.req.param("id"));

    return view ? c.json(success(view)) : c.json(failure("not_found"), 404);
  })
  .post("/:id/answer", requireSession, validate("json", EnterCode), async (c) => {
    return codeResponse(c, await service(c.env).answer(c.var.userId, c.req.param("id"), c.req.valid("json").code));
  })
  .post("/:id/end", requireSession, validate("json", EnterCode), async (c) => {
    return codeResponse(c, await service(c.env).end(c.var.userId, c.req.param("id"), c.req.valid("json").code));
  });
