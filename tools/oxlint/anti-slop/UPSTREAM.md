# anti-slop (vendored)

Opinionated Oxlint rules from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), copied in on Jaden's request on 4/11/2026. This copy is ours to change; it is not an npm dependency.

- **Source:** `https://github.com/dmmulroy/anti-slop` at commit `13909c9e07590f5a85d93c62712259fe14a883f7` (13/10/2026), copied with the repo's `skills/install-anti-slop/scripts/install.mjs`. The upstream `*.test.ts` files were not copied.
- **Installed:** this folder, registered as the `anti-slop` JS plugin in the root `.oxlintrc.json`. `@oxlint/plugins` is pinned to the same exact version as `oxlint` (1.91.0); upgrade them together.
- **Enabled:** every generic rule at `error`, plus the native `oxc/no-accumulating-spread`. The Effect rules in `effect/` are copied but not enabled, because Cage does not use Effect.
- **Deviations:** none in the rule code. `LICENSE` is upstream's MIT licence.

To pick up upstream changes, use the install-anti-slop skill's update procedure, which keeps local edits.
