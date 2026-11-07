import { createDb } from "@cage/db";
import { failure, MarkReached, success } from "@cage/shared";
import { Hono } from "hono";
import { validate } from "../middleware/validate";
import { circleLinksService } from "../services/circle-links.service";
import type { AppEnv } from "../types";

const service = (env: AppEnv["Bindings"]) => circleLinksService(createDb(env.DB), env.JOURNEY);

/**
 * `/links/:token`: the safety circle's view of a journey. No session: the
 * link itself is the key (ADR 0002). The website calls this through its
 * service binding.
 */
export const linksController = new Hono<AppEnv>()
  .get("/:token", async (c) => {
    const view = await service(c.env).open(c.req.param("token"));

    return view ? c.json(success({ ...view, demo: c.env.DEMO_MODE === "on" })) : c.json(failure("not_found"), 404);
  })
  /** The page loaded in the contact's browser: the circle has seen it. Link previews never call this. */
  .post("/:token/opened", async (c) => {
    const ok = await service(c.env).markOpened(c.req.param("token"));

    return ok ? c.body(null, 204) : c.json(failure("not_found"), 404);
  })
  /** The contact reached the traveller (screen 24a). Shown to the whole circle; never cancels the alert. */
  .post("/:token/reached", validate("json", MarkReached), async (c) => {
    const result = await service(c.env).markReached(c.req.param("token"), c.req.valid("json").outcome);

    switch (result) {
      case "ok":
        return c.body(null, 204);
      case "no_alert":
        return c.json(failure(result), 409);
      case "not_found":
        return c.json(failure(result), 404);
    }
  });
