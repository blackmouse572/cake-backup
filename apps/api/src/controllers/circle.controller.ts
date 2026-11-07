import { createDb } from "@cage/db";
import { AddCircleContacts, failure, ReorderCircle, success } from "@cage/shared";
import { Hono } from "hono";
import { requireSession } from "../middleware/require-session";
import { validate } from "../middleware/validate";
import { circleService } from "../services/circle.service";
import type { AuthedEnv } from "../types";

/**
 * `/circle`: the signed-in traveller's safety circle (screens 05, 09, 09b).
 * Every change answers with the whole circle in alert order. Another
 * traveller's contact answers 404, the same as one that doesn't exist.
 */
export const circleController = new Hono<AuthedEnv>()
  .use(requireSession)
  .get("/", async (c) => c.json(success(await circleService(createDb(c.env.DB)).list(c.var.userId))))
  .post("/", validate("json", AddCircleContacts), async (c) => {
    const result = await circleService(createDb(c.env.DB)).add(c.var.userId, c.req.valid("json").contacts);

    switch (result) {
      case "invalid_phone":
      case "own_number":
        return c.json(failure(result), 400);
      case "circle_full":
        return c.json(failure(result), 409);
      default:
        return c.json(success(result), 201);
    }
  })
  .put("/order", validate("json", ReorderCircle), async (c) => {
    const result = await circleService(createDb(c.env.DB)).reorder(c.var.userId, c.req.valid("json").ids);

    if (result === "order_mismatch") return c.json(failure(result), 409);

    return c.json(success(result), 200);
  })
  .delete("/:id", async (c) => {
    const result = await circleService(createDb(c.env.DB)).remove(c.var.userId, c.req.param("id"));

    if (result === "not_found") return c.json(failure(result), 404);

    return c.body(null, 204);
  });
