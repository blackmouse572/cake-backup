import type { Db } from "@cage/db";
import { DEMO } from "../constants";
import { demoLockoutsRepository } from "../repositories/demo-lockouts.repository";
import { hashToken, sameString } from "../utils";

export type DemoAccess = "ok" | "wrong" | "locked";

/**
 * The demo key check (hackathon demo only). Callers are counted by a hash of
 * their IP, never the IP itself; a right key clears the count.
 */
export function demoAccessService(db: Db) {
  const lockouts = demoLockoutsRepository(db);

  return {
    async check(client: string, key: string, given: string, now = Date.now()): Promise<DemoAccess> {
      const clientHash = await hashToken(client);
      const row = await lockouts.find(clientHash);

      if (row?.lockedUntil && row.lockedUntil.getTime() > now) return "locked";

      if (sameString(given, key)) {
        if (row) await lockouts.clear(clientHash);

        return "ok";
      }

      const failures = (row?.lockedUntil ? 0 : (row?.failures ?? 0)) + 1;
      const lockedUntil = failures >= DEMO.keyTries ? new Date(now + DEMO.lockoutMs) : null;
      await lockouts.save({ clientHash, failures, lockedUntil, updatedAt: new Date(now) });

      return lockedUntil ? "locked" : "wrong";
    },
  };
}
