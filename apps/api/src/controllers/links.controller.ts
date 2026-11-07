import { createDb } from "@cage/db";
import { failure, success } from "@cage/shared";
import { Hono } from "hono";
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
  });
