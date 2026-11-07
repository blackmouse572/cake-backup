import { createDb } from "@cage/db";
import { DemoMove, failure, success } from "@cage/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { DEMO } from "../constants";
import { validate } from "../middleware/validate";
import { demoAccessService } from "../services/demo-access.service";
import { demoService } from "../services/demo.service";
import type { AppEnv } from "../types";

const service = (env: AppEnv["Bindings"]) =>
  demoService(createDb(env.DB), env.JOURNEY, demoAccounts(env.DEMO_ACCOUNTS));

/** `DEMO_ACCOUNTS` as a list, or null when every account may be shown. */
function demoAccounts(value: string | undefined): string[] | null {
  const numbers = (value ?? "").split(",").map((n) => n.trim()).filter(Boolean);

  return numbers.length > 0 ? numbers : null;
}

/**
 * Every demo route answers 404, as if it didn't exist, unless `DEMO_MODE` is
 * "on", messages go nowhere (so a demo can never text or call a real person)
 * and `DEMO_KEY` is set. A wrong key answers 403, and after
 * `DEMO.keyTries` of them the caller is locked out for `DEMO.lockoutMs`.
 */
const demoOnly = createMiddleware<AppEnv>(async (c, next) => {
  const silent = DEMO.silentSenders.some((sender) => sender === c.env.MESSAGE_SENDER);
  const key = c.env.DEMO_KEY;

  if (c.env.DEMO_MODE !== "on" || !silent || !key) return c.json(failure("not_found"), 404);

  // Public calls always carry Cloudflare's IP header; only the demo website's service binding lacks it.
  const client = c.req.header("cf-connecting-ip") ?? c.req.header(DEMO.clientHeader) ?? "website";
  const access = await demoAccessService(createDb(c.env.DB)).check(client, key, c.req.header(DEMO.keyHeader) ?? "");

  if (access === "locked") return c.json(failure("demo_locked"), 429);

  if (access === "wrong") return c.json(failure("wrong_demo_key"), 403);
  await next();
});

/**
 * `/demo`: the hackathon demo dashboard. The traveller starts a real trip on
 * their phone; these routes list running trips and set a trip's states by
 * journey id, with the demo key instead of a session. It never sees or
 * enters a code: the safe code and the duress PIN are only typed on the phone.
 */
export const demoController = new Hono<AppEnv>()
  .use(demoOnly)
  .get("/journeys", async (c) => c.json(success(await service(c.env).travellers())))
  .get("/journeys/:id", async (c) => {
    const view = await service(c.env).view(c.req.param("id"));

    return view ? c.json(success(view)) : c.json(failure("not_found"), 404);
  })
  .get("/journeys/:id/log", async (c) => {
    const log = await service(c.env).log(c.req.param("id"));

    return log ? c.json(success(log)) : c.json(failure("not_found"), 404);
  })
  .post("/journeys/:id/check-in", async (c) => {
    const view = await service(c.env).requestCheckIn(c.req.param("id"));

    return view ? c.body(null, 204) : c.json(failure("not_found"), 404);
  })
  .post("/journeys/:id/skip", async (c) => {
    return (await service(c.env).skipToDeadline(c.req.param("id"))) ? c.body(null, 204) : c.json(failure("not_found"), 404);
  })
  .post("/journeys/:id/lose-contact", async (c) => {
    return (await service(c.env).loseContact(c.req.param("id"))) ? c.body(null, 204) : c.json(failure("not_found"), 404);
  })
  .post("/journeys/:id/move", validate("json", DemoMove), async (c) => {
    const moved = await service(c.env).move(c.req.param("id"), c.req.valid("json"));

    return moved ? c.body(null, 204) : c.json(failure("not_found"), 404);
  })
  .delete("/journeys/:id", async (c) => {
    return (await service(c.env).remove(c.req.param("id"))) ? c.body(null, 204) : c.json(failure("not_found"), 404);
  });
