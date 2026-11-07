import { createDb } from "@cage/db";
import { failure, success } from "@cage/shared";
import { Hono } from "hono";
import { circleLinksService } from "../services/circle-links.service";
import type { AppEnv } from "../types";

/**
 * `/links/:token`: the safety circle's view of a journey. No session: the
 * link itself is the key (ADR 0002). The website calls this through its
 * service binding.
 */
export const linksController = new Hono<AppEnv>().get("/:token", async (c) => {
  const view = await circleLinksService(createDb(c.env.DB), c.env.JOURNEY).open(c.req.param("token"));

  return view ? c.json(success({ ...view, demo: c.env.DEMO_MODE === "on" })) : c.json(failure("not_found"), 404);
});
