import { SetPushToken } from "@cage/shared";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { z } from "zod";
import { apiFetch } from "./api";

/**
 * Check-in calls (#20): the server rings the phone with a push that looks
 * like a call from the caller name the traveller picked. This file registers
 * the phone for those pushes and hands the app the calls it should show.
 *
 * Android channels can't be changed once made, so ringing and vibrate-only
 * are two channels and the server picks one per push. Keep the ids in step
 * with `CALL_CHANNEL` in apps/api/src/push-sender.ts.
 */

const CALL_CHANNEL = { ring: "call-ring", vibrate: "call-vibrate" } as const;

/** A long, call-like buzz: on 1 s, off 1 s, three times. */
const CALL_VIBRATION = [0, 1000, 1000, 1000, 1000, 1000];

/** What the server puts in a check-in call push. Anything else is not ours to act on. */
const CallPush = z.object({ kind: z.literal("check_in_call"), journeyId: z.string(), call: z.union([z.literal(1), z.literal(2)]) });

export type CallPush = z.infer<typeof CallPush>;

/** The call in a notification, or null when the notification is not a check-in call. */
function callIn(notification: Notifications.Notification): CallPush | null {
  const parsed = CallPush.safeParse(notification.request.content.data);

  return parsed.success ? parsed.data : null;
}

/**
 * With the app open on screen, a check-in call doesn't also drop a banner:
 * the app shows the call itself. Everything else shows as usual.
 */
Notifications.setNotificationHandler({
  async handleNotification(notification) {
    const show = callIn(notification) === null || AppState.currentState !== "active";

    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

/**
 * Asks for permission once and sends this phone's push token to the server.
 * Quietly gives up when it can't: calls still come in the open app, and the
 * server still alerts the circle when nobody answers. Names on the channels
 * are what the phone's settings show, so they say "Cuộc gọi", never "Cage".
 */
export async function registerForCalls(names: { ring: string; vibrate: string }): Promise<"ok" | "denied" | "error"> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CALL_CHANNEL.ring, {
        name: names.ring,
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: CALL_VIBRATION,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });

      await Notifications.setNotificationChannelAsync(CALL_CHANNEL.vibrate, {
        name: names.vibrate,
        importance: Notifications.AndroidImportance.MAX,
        sound: null,
        vibrationPattern: CALL_VIBRATION,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
    }

    const current = await Notifications.getPermissionsAsync();
    const allowed = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);

    if (!allowed) return "denied";

    // The EAS project id comes from app.json (`extra.eas.projectId`, written by `eas init`).
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    const body = SetPushToken.parse({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
    const res = await apiFetch("/me/push-token", { method: "PUT", body: JSON.stringify(body) });

    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

/**
 * Calls `onCall` when the traveller opens a check-in call from the lock
 * screen or the notification shade, including the one that started the app.
 */
export function useCallTaps(onCall: (call: CallPush) => void): void {
  useEffect(() => {
    const opened = Notifications.getLastNotificationResponse();
    const first = opened ? callIn(opened.notification) : null;

    if (first) {
      onCall(first);
      Notifications.clearLastNotificationResponse();
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const call = callIn(response.notification);

      if (call) onCall(call);
    });

    return () => subscription.remove();
  }, [onCall]);
}

/** Clears check-in call notifications once the call is answered or over, so none is left on the lock screen. */
export async function dismissCalls(): Promise<void> {
  try {
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(shown.filter((n) => callIn(n) !== null).map((n) => Notifications.dismissNotificationAsync(n.request.identifier)));
  } catch {
    // Nothing to clear is fine.
  }
}
