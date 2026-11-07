import type { Db } from "@cage/db";
import type { Me, SetSettings } from "@cage/shared";
import { travellerSettingsRepository } from "../repositories/traveller-settings.repository";
import { usersRepository } from "../repositories/users.repository";

/** The signed-in traveller's own account. */
export function meService(db: Db) {
  const users = usersRepository(db);
  const settings = travellerSettingsRepository(db);

  return {
    /** What the app needs to tell a new traveller from a returning one (screen 08c). */
    async get(userId: string): Promise<Me> {
      const [account, row, circleSize] = await Promise.all([
        users.find(userId),
        settings.find(userId),
        users.circleSize(userId),
      ]);

      return {
        phoneNumber: account?.phoneNumber ?? "",
        name: account?.name ?? "",
        hasCodes: Boolean(row?.safeCodeHash && row.duressCodeHash),
        circleSize,
        locale: row?.locale ?? "vi",
        policeEnabled: row?.policeEnabled ?? false,
      };
    },

    /** The app's language and the police switch (screen 20). */
    updateSettings(userId: string, changes: SetSettings): Promise<void> {
      return settings.save(userId, changes);
    },

    setName(userId: string, name: string): Promise<void> {
      return users.setName(userId, name);
    },
  };
}
