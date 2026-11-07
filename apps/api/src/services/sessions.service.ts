import { createAuth } from "../auth";
import type { Bindings } from "../bindings";
import { logError } from "../middleware/request-log";

/** The traveller's sign-in session (Better Auth, ADR 0002). */
export function sessionsService(env: Bindings) {
  return {
    /**
     * Ends the session a request came with. It runs after the answer has been
     * sent, so a failure is logged and never thrown.
     */
    async end(headers: Headers): Promise<void> {
      try {
        await createAuth(env).api.signOut({ headers });
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), "sessions.end");
      }
    },
  };
}
