# Translations

One JSON file per language, loaded by i18next. `vi.json` is the source: it defines the keys, and every other file must have the same ones (the type check and the tests fail otherwise). Placeholders use `{{name}}`.

Copy rules: full diacritics, sentence case, no exclamation marks, address the user as "bạn", action buttons in the first person ("Tôi an toàn"). Terms come from `GLOSSARY.md`. Check-in call strings (`call.*`) must never say "Cage", "an toàn", "cảnh báo" or "công an", because that screen imitates the phone's own call screen.

To add a language, add `<code>.json`, then add the code to `LOCALES` and `resources` in `src/`.
