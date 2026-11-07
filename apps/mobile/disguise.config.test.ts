import { describe, expect, it } from "vitest";
import appJson from "./app.json";
import { DisguisableConfig, withDisguise } from "./disguise.config";

const base = DisguisableConfig.parse(appJson.expo);

/** The options of a plugin that was configured with options, by plugin name. */
function pluginOptions(config: DisguisableConfig, name: string) {
  const found = config.plugins?.find((p) => Array.isArray(p) && p[0] === name);

  return Array.isArray(found) ? found[1] : undefined;
}

describe("the disguised build", () => {
  const disguised = withDisguise(base);

  it("is called Ghi chú+ on the home screen", () => {
    expect(disguised.name).toBe("Ghi chú+");
  });

  it("uses the notes icon everywhere the phone shows an icon", () => {
    expect(disguised.icon).toBe("./assets/icon-disguise.png");
    expect(disguised.android?.adaptiveIcon).toMatchObject({
      foregroundImage: "./assets/android-icon-disguise-foreground.png",
      backgroundImage: "./assets/android-icon-disguise-background.png",
      monochromeImage: "./assets/android-icon-disguise-monochrome.png",
    });
  });

  it("shows no Cage logo while the app starts", () => {
    expect(pluginOptions(disguised, "expo-splash-screen")).toMatchObject({ image: "./assets/splash-disguise.png" });
  });

  it("asks for location and contacts without saying what the app is for", () => {
    expect(pluginOptions(disguised, "expo-location")?.locationWhenInUsePermission).toBe(
      "Để dùng vị trí của bạn trong chuyến đi.",
    );
    expect(pluginOptions(disguised, "expo-contacts")?.contactsPermission).toBe("Để bạn chọn người cần liên hệ.");
  });

  it("says nothing that gives the app away, except the names the user never sees", () => {
    // `slug` and `scheme` stay `cage`: sign-in comes back through cage:// and the EAS project is found by the slug.
    const text = JSON.stringify(disguised, (key, value) => (key === "slug" || key === "scheme" ? undefined : value)).toLowerCase();

    for (const word of ["cage", "an toàn", "cảnh báo", "công an"]) expect(text).not.toContain(word);
  });

  it("keeps the rest of the configuration as it was", () => {
    expect(disguised.slug).toBe("cage");
    expect(disguised.scheme).toBe("cage");
    expect(disguised.android?.adaptiveIcon).toMatchObject({ backgroundColor: "#111111" });
    expect(pluginOptions(disguised, "expo-splash-screen")).toMatchObject({ backgroundColor: "#FCFCFC", resizeMode: "contain" });
    expect(disguised.plugins).toContain("expo-dev-client");
  });

  it("leaves the ordinary build as it is", () => {
    expect(base.name).toBe("Cage");
    expect(base.icon).toBe("./assets/icon.png");
    expect(pluginOptions(base, "expo-splash-screen")).toMatchObject({ image: "./assets/splash-icon.png" });
  });
});

describe("installing the disguised build next to the ordinary one", () => {
  it("takes the identifier it is given, for both phones", () => {
    const disguised = withDisguise(base, "com.example.notes");

    expect(disguised.ios?.bundleIdentifier).toBe("com.example.notes");
    expect(disguised.android?.package).toBe("com.example.notes");
  });

  it("sets no identifier when none is given, so EAS asks as it does today", () => {
    const disguised = withDisguise(base);

    expect(disguised.ios?.bundleIdentifier).toBeUndefined();
    expect(disguised.android?.package).toBeUndefined();
  });
});
