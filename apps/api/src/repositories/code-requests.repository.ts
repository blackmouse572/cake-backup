import { codeRequests, type Db } from "@cage/db";
import { and, count, eq, gt, lt } from "drizzle-orm";

/** D1 access for `code_requests`: one row per sign-in code sent. */
export function codeRequestsRepository(db: Db) {
  return {
    async countSince(phoneNumber: string, since: Date): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(codeRequests)
        .where(and(eq(codeRequests.phoneNumber, phoneNumber), gt(codeRequests.createdAt, since)));

      return row?.n ?? 0;
    },

    async add(phoneNumber: string): Promise<void> {
      await db.insert(codeRequests).values({ phoneNumber });
    },

    async deleteBefore(before: Date): Promise<void> {
      await db.delete(codeRequests).where(lt(codeRequests.createdAt, before));
    },
  };
}
