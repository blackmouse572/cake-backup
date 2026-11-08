# App icons

Rendered from the Doorway logo in `assets/brand/` (the same files as the project's logo kit). Re-render them from those SVGs when the logo changes; don't edit the PNGs by hand.

| File | Source | Size |
| --- | --- | --- |
| `icon.png` | `assets/brand/web/app-store-icon-1024.png` (from `cage-app-icon-ios.svg`, full bleed, no transparency) | 1024 |
| `android-icon-foreground.png` | `cage-android-foreground.svg` | 512 |
| `android-icon-background.png` | solid ink `#111111` | 512 |
| `android-icon-monochrome.png` | `cage-android-foreground.svg` in black, for Android themed icons | 432 |
| `splash-icon.png` | `cage-symbol.svg` on the `#FCFCFC` splash background | 1024 |
| `favicon.png` | `assets/brand/web/favicon-48.png` | 48 |

## The disguised build

The `development-disguise` build (`APP_VARIANT=disguise`, see `disguise.config.ts`) uses a notes icon instead of the Doorway logo, with the same ink and white as `cage-disguise-notes.svg`. Its three bars are that icon's lines (x 72 to 184, 72 to 184 and 72 to 144; y 80 to 100, 118 to 138 and 156 to 176 in a 256 box). Re-render from the SVG when it changes; don't edit the PNGs by hand.

| File | Source | Size |
| --- | --- | --- |
| `icon-disguise.png` | the bars in white on a full-bleed ink square, no transparency (the phone rounds the corners) | 1024 |
| `android-icon-disguise-foreground.png` | the bars in white, inside the adaptive icon's safe zone | 512 |
| `android-icon-disguise-background.png` | solid ink `#111111` | 512 |
| `android-icon-disguise-monochrome.png` | the bars in black, for Android themed icons | 432 |
| `splash-disguise.png` | `cage-disguise-notes.svg` on the `#FCFCFC` splash background, no logo | 1024 |

Changing the icon or the name while the app runs (Android `activity-alias`, an alternate icon on iOS) needs a native module that hasn't been tried on a real phone yet, so it comes later.
