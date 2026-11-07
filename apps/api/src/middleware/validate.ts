import { failure } from "@cage/shared";
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

/** `zValidator` that answers a bad request with the standard error body (`invalid_request`). */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) return c.json(failure("invalid_request"), 400);
  });
