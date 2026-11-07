import type { Db } from "@cage/db";
import { matchLocale } from "@cage/i18n";
import { SIGN_IN_CODE } from "../constants";
import { codeRequestsRepository } from "../repositories/code-requests.repository";
import type { MessageSender } from "../types";

/** Sending sign-in codes: the per-number cap, then the message. */
export function signInCodesService(db: Db, sender: MessageSender) {
  const requests = codeRequestsRepository(db);

  return {
    /**
     * Returns "too_many" when the number has had its codes for the hour (each
     * one costs money), and "not_sent" when no channel could deliver it.
     */
    async send(
      to: string,
      code: string,
      headers: Headers | undefined,
      now = Date.now(),
    ): Promise<"sent" | "too_many" | "not_sent"> {
      const since = new Date(now - SIGN_IN_CODE.perNumberWindowMs);
      await requests.deleteBefore(since);

      if ((await requests.countSince(to, since)) >= SIGN_IN_CODE.perNumberPerHour) return "too_many";
      await requests.add(to);

      const prefer = headers?.get("x-code-channel") === "sms" ? "sms" : "zalo";
      const languages = (headers?.get("accept-language") ?? "").split(",").map((l) => l.split(";")[0]!.trim());

      return sender.send({ to, locale: matchLocale(languages), message: { kind: "code", code }, prefer });
    },
  };
}
