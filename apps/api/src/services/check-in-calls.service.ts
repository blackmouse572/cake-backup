import type { Db } from "@cage/db";
import { i18nFor, type Locale } from "@cage/i18n";
import { TIMERS } from "@cage/shared";
import type { PushSender } from "../push-sender";
import { pushTokensRepository } from "../repositories/push-tokens.repository";
import { travellerSettingsRepository } from "../repositories/traveller-settings.repository";

const SECOND_MS = 1_000;

/**
 * Rings the traveller's phones for a check-in (#20, PRD "Check-in call"):
 * a push that looks like a call from the caller name they picked ("Mẹ"),
 * never from Cage. Answering opens the app's call screen, where only the
 * safe code or the duress PIN ends it.
 */
export function checkInCallsService(db: Db, sender: PushSender) {
  const tokens = pushTokensRepository(db);
  const settings = travellerSettingsRepository(db);

  return {
    async ring(journey: { id: string; userId: string; locale: Locale }, call: 1 | 2): Promise<void> {
      const [phones, row] = await Promise.all([tokens.forUser(journey.userId), settings.find(journey.userId)]);

      if (phones.length === 0) return;
      const { t } = i18nFor(journey.locale);

      const { deadTokens } = await sender.send(
        phones.map((phone) => ({
          to: phone.token,
          title: row?.callerName || t("call.defaultCaller"),
          body: t("call.incoming"),
          data: { kind: "check_in_call", journeyId: journey.id, call },
          ring: !row?.callVibrateOnly,
          ttlS: TIMERS.checkInAnswerMs / SECOND_MS,
        })),
      );

      await tokens.delete(deadTokens);
    },
  };
}
