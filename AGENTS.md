# Cage

This is the single instruction file for every coding agent (Codex, Copilot, Cursor, Gemini and others). `CLAUDE.md` only imports it, so edit this file, not that one.

Cage is a mobile app that watches over a journey and quietly brings in trusted people when something goes wrong. Its purpose is to protect people from human trafficking. It is built for Vietnamese users first (roughly 16 to 30, travelling for work, study or a relationship), with their families as the second audience, and should be able to expand to other countries later.

Domain terms are defined in `GLOSSARY.md`. Use those words, in code and in copy.

## Status

Monorepo skeleton in place. The stack is chosen in [ADR 0001](docs/adr/0001-stack.md): a TypeScript monorepo (Bun workspaces and Turborepo) with an Expo app, a Hono API on Cloudflare Workers, one Durable Object per active journey for its state and timers, Cloudflare D1 with Drizzle, and a TanStack Start website for the safety circle. Sign-in is phone number and one-time code with Better Auth ([ADR 0002](docs/adr/0002-sign-in.md)), mounted at `/auth/*` in the API. Journey routes need the session, except location updates, which carry the journey token issued by `POST /journeys`, and the safety circle's `GET /links/:token`, where the per-contact link is the key. The safe code and duress PIN are checked only on the server (`apps/api/src/services/codes.service.ts`). The plan lives in GitHub issues under the roadmap, #6. Translations are in [ADR 0003](docs/adr/0003-i18n.md). Read the ADRs before adding a framework or a service.

## Code layout and commands

| Path | What |
| --- | --- |
| `apps/api` | Hono on Workers, split into controllers, services and repositories (read the `backend` skill, `.agents/skills/backend/SKILL.md`, before changing it). `src/journey-object.ts` is the per-journey Durable Object; `src/client.ts` exports the typed RPC client. |
| `apps/web` | TanStack Start site for the safety circle (`/t/$id`). `bun run dev` here also runs the API Worker locally. |
| `apps/mobile` | Expo app (development builds). |
| `packages/shared` | Zod schemas and domain rules (timers, escalation ladder). Put rules here, not in an app. |
| `packages/i18n` | i18next setup; every user-facing string in `languages/vi.json` (source) and `languages/en.json`, plus date, time and distance formats. |
| `packages/ui-tokens` | Design tokens copied from the canvas. |
| `packages/db` | Drizzle schema for D1 and its migrations. |

- `bun install`, then `bun run check` (oxlint, then typecheck and tests in every workspace through Turborepo). CI runs oxlint on the whole repo, then `typecheck test build` for the workspaces a pull request affects (everything on main), and skips changes that only touch docs, images or agent skills. If a shared config change should re-check every workspace, add the file to `globalDependencies` in `turbo.json`. Lint is oxlint with the root `.oxlintrc.json`, including the vendored [anti-slop](tools/oxlint/anti-slop/UPSTREAM.md) rules (no `unknown` parameters, parse at the boundary instead of `typeof`, a `// SAFETY:` comment before every `as` assertion, no module mocking, blank lines between steps). `bun run lint:fix` applies safe fixes, including the spacing. Fix a finding; don't disable the rule.
- Workspace packages are consumed as TypeScript source, with no build step.
- After changing a `wrangler.jsonc`, run `bun run typegen` in that app. After changing `packages/db/src/schema.ts`, run `bun run generate` there and commit the migration.
- API tests run inside the Workers runtime with `@cloudflare/vitest-plugin`.
- Environments: local, `staging` (Cloudflare Workers Builds deploys it on every push to main, private behind Cloudflare Access) and `production` (not deployed yet). Infrastructure is Wrangler config only, no Terraform. Deploy with `--env`, never the top-level Wrangler config. Setup, hostnames and the full list of secrets: `docs/deploy.md`.
- API secrets: `BETTER_AUTH_SECRET` and `CODE_PEPPER`. For `wrangler dev`, copy `apps/api/.dev.vars.example` to `.dev.vars`; sign-in codes are printed to the log (`MESSAGE_SENDER=console`). Zalo ZNS and SMS settings are in [docs/messaging.md](docs/messaging.md).
- Mobile: add Expo packages with `bunx expo install` (it picks the versions for the SDK), and check the docs for the installed SDK version before using an Expo API, since APIs change every release.

## Commits and hooks

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, for example `feat(api): start a journey` or `fix(web): keep the language after reload`. Types are build, chore, ci, docs, feat, fix, perf, refactor, revert, style and test; scopes are usually a workspace (`api`, `web`, `mobile`, `shared`, `i18n`, `db`, `ui-tokens`) or `ci`, `lint`, `deps`. commitlint checks every commit locally (commit-msg hook) and every pull request title in CI. Pull requests are squash-merged, so the title becomes the commit on main.

`bun install` installs the lefthook git hooks (`lefthook.yml`): oxlint with safe fixes on staged files before each commit, commitlint on the message, and typecheck plus tests for affected workspaces before each push. Don't skip them with `--no-verify`; fix what they report.

## Translations

Never hard-code user-facing text. Add the Vietnamese string to `packages/i18n/languages/vi.json` and the English one to `en.json` (the type check fails if a key is missing; the copy rules are in `languages/README.md`), then use `t("key")` from react-i18next's `useTranslation()` (i18next underneath, placeholders are `{{name}}`). Tests enforce no exclamation marks and keep "Cage", "an toàn", "cảnh báo" and "công an" out of the check-in call strings.

## Sources of truth

| What | Where |
| --- | --- |
| Product requirements | `docs/PRD.md` (from the [Cage concept doc](https://claude.ai/artifact/MeUFLFamAMeiHLnV32xxtS)) |
| Screens (01–22), clickable flows, per-feature notes | [Doop design canvas](https://doop.design/c/2v_tmcapn2) |
| Design system: tokens, type, components, Vietnamese copy rules | Same canvas: "Design system" page (DS 01 Foundations, DS 02 Components, DS 03 Brand & Vietnamese copy) and the canvas style guide `design-system` |
| Logo and app icons | `assets/brand/` (see its README) |

Read the canvas itself (frames and the `design-system` style guide) before UI work. Do not work from a summary of it, including this file. A frame marked `ready_for_dev` is approved for implementation; anything else is a draft.

## Product requirements

The product logic lives in `docs/PRD.md`: users, threats, core flow, feature requirements (check-in call, duress PIN, lost contact, escalation ladder, disguise), the server's job, privacy principles and MVP scope. Read the sections relevant to your task before building a feature, and update the PRD in the same change when a decision alters it.

## UI rules (summary; the canvas wins on any conflict)

- All product copy in Vietnamese with full diacritics, sentence case, no exclamation marks. English is second.
- Colour: ink `#111111` for text and primary buttons; route blue `#0090ff` means "you / live route" and is never used for alerts. Red, green, amber and info blue mean status only. Buttons are never red or green.
- Type: Geist Serif for screen titles and brand header, Inter for everything else. Icons: Material Symbols Outlined.
- Check-in call screens imitate the native call screen: no logo, no serif, no route blue, and none of the words "Cage", "an toàn", "cảnh báo" or "công an".

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `blackmouse572/cage`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Installed skills

Matt Pocock's engineering and productivity skills are vendored in `.agents/skills/` (MIT, from [mattpocock/skills](https://github.com/mattpocock/skills) at `4ae2317`, including each skill's Codex `agents/openai.yaml`). `.claude/skills` is a symlink to the same folder, so Claude Code, Codex and other agents share one copy. Start with `/ask-matt` to find the right one. To update, copy the newer skill folders over these.

Cage's own skills live in the same folder: `backend` (API layout and conventions).
