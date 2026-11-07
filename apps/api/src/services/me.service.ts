import type { Db } from "@cage/db";
import type { Me, SetPushToken, SetSettings } from "@cage/shared";
import { pushTokensRepository } from "../repositories/push-tokens.repository";
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
        callerName: row?.callerName ?? "",
        callVibrateOnly: row?.callVibrateOnly ?? false,
      };
    },

    /** The app's language and the police switch (screen 20), and the check-in call's caller and ring (14). */
    updateSettings(userId: string, changes: SetSettings): Promise<void> {
      const { callerName, ...rest } = changes;

      // An empty caller name goes back to the default for the language.
      return settings.save(userId, callerName === undefined ? rest : { ...rest, callerName: callerName || null });
    },

    /** The phone's push token, so a check-in call can ring it while the app is closed (#20). */
    savePushToken(userId: string, { token, platform }: SetPushToken): Promise<void> {
      return pushTokensRepository(db).save(userId, token, platform, new Date());
    },

    /** A signed-out phone must not ring for this traveller's check-ins any more. */
    forgetPushTokens(userId: string): Promise<void> {
      return pushTokensRepository(db).deleteForUser(userId);
    },

    setName(userId: string, name: string): Promise<void> {
      return users.setName(userId, name);
    },
  };
}
