import type { ConfigContext, ExpoConfig } from "expo/config";
import { DisguisableConfig, withDisguise } from "./disguise.config.ts";

/**
 * Expo hands over `app.json` as `config`. `APP_VARIANT=disguise` (the
 * `development-disguise` profile in `eas.json`) builds the disguised app;
 * anything else builds the ordinary one. `DISGUISE_APP_IDENTIFIER`, an EAS
 * variable, lets the two be installed side by side.
 */
export default ({ config }: ConfigContext): Partial<ExpoConfig> => {
  if (process.env.APP_VARIANT !== "disguise") return config;

  return withDisguise(DisguisableConfig.parse(config), process.env.DISGUISE_APP_IDENTIFIER);
};
