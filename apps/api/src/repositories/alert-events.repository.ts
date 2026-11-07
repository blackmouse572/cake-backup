import { alertEvents, type Db } from "@cage/db";

export type NewAlertEvent = typeof alertEvents.$inferInsert;

/** D1 access for `alert_events`, the alert history kept after a journey ends. */
export function alertEventsRepository(db: Db) {
  return {
    async insert(row: NewAlertEvent): Promise<void> {
      await db.insert(alertEvents).values(row);
    },
  };
}
