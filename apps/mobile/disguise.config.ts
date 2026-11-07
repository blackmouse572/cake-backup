import { z } from "zod";

/**
 * The disguised build (PRD, "Disguise mode"): the same app, built with a
 * neutral name and icon so nothing on the phone gives it away. It is a
 * separate build because iOS can't rename an app at runtime, and a switch at
 * runtime would need a native module nobody has tried on a real phone yet.
 *
 * Pure, so the whole configuration is tested without Expo. `app.config.ts`
 * calls it when `APP_VARIANT` is `disguise`.
 */

/** What the phone's home screen shows. The icon is `cage-disguise-notes.svg` in `assets/brand`. */
export const DISGUISE_NAME = "Ghi chú+";

const SPLASH_IMAGE = "./assets/splash-disguise.png";

/** Permission prompts in the disguised build: they say what is asked, not what the app is for. */
const LOCATION_PERMISSION = "Để dùng vị trí của bạn trong chuyến đi.";

const CONTACTS_PERMISSION = "Để bạn chọn người cần liên hệ.";

const Plugin = z.union([z.string(), z.tuple([z.string(), z.record(z.string(), z.json())])]);

type Plugin = z.infer<typeof Plugin>;

/** The parts of Expo's config that the disguise changes; everything else passes through untouched. */
export const DisguisableConfig = z.looseObject({
  name: z.string().optional(),
  icon: z.string().optional(),
  android: z.looseObject({ adaptiveIcon: z.looseObject({}).optional(), package: z.string().optional() }).optional(),
  ios: z.looseObject({ bundleIdentifier: z.string().optional() }).optional(),
  plugins: z.array(Plugin).optional(),
});

export type DisguisableConfig = z.infer<typeof DisguisableConfig>;

function disguisePlugin(plugin: Plugin): Plugin {
  if (!Array.isArray(plugin)) return plugin;
  const [name, options] = plugin;

  switch (name) {
    case "expo-splash-screen":
      return [name, { ...options, image: SPLASH_IMAGE }];
    case "expo-location":
      return [name, { ...options, locationWhenInUsePermission: LOCATION_PERMISSION }];
    case "expo-contacts":
      return [name, { ...options, contactsPermission: CONTACTS_PERMISSION }];
    default:
      return plugin;
  }
}

/**
 * The configuration of the disguised build. `identifier` is the bundle id and
 * package name, so it can be installed next to the ordinary build; leave it
 * out and EAS asks for one, as it does today. Pick one that doesn't say
 * "cage": the phone shows it in the app's info.
 */
export function withDisguise(config: DisguisableConfig, identifier?: string): DisguisableConfig {
  const android = {
    ...config.android,
    adaptiveIcon: {
      ...config.android?.adaptiveIcon,
      foregroundImage: "./assets/android-icon-disguise-foreground.png",
      backgroundImage: "./assets/android-icon-disguise-background.png",
      monochromeImage: "./assets/android-icon-disguise-monochrome.png",
    },
  };

  if (identifier) android.package = identifier;

  return {
    ...config,
    name: DISGUISE_NAME,
    icon: "./assets/icon-disguise.png",
    android,
    ios: identifier ? { ...config.ios, bundleIdentifier: identifier } : config.ios,
    plugins: config.plugins?.map(disguisePlugin),
  };
}
