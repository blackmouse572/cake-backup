---
name: backend
description: How Cage's API (apps/api, Hono on Cloudflare Workers) is laid out. Use before adding or changing a route, a database query, a service rule, a constant or a helper in apps/api.
---

# Cage backend conventions

`apps/api` is Hono on Cloudflare Workers with D1 (Drizzle) and one Durable Object per journey ([ADR 0001](../../../docs/adr/0001-stack.md)). Code is split by layer. Each layer only calls the one below it.

```
controller  →  service  →  repository  →  D1 (Drizzle)
   HTTP          rules        queries
```

## Where things go

| Folder / file | Holds | Must not |
| --- | --- | --- |
| `src/controllers/<name>.controller.ts` | A `Hono` router: validate input with `zValidator` and the zod schema from `@cage/shared`, call one service method, map its result to a status code and the standard body (see Responses). | Query D1, hold business rules, or hash or compare anything. |
| `src/services/<name>.service.ts` | The rules. A factory `fooService(db, ...deps)` that builds its repositories and returns methods. Methods return plain values or a string result union (`"ok" \| "wrong_code" \| ...`), never `Response`. | Know about Hono, `Context` or status codes. |
| `src/repositories/<table>.repository.ts` | D1 access for one table (or a table plus simple counts on what hangs off it). A factory `fooRepository(db)` returning `find`, `insert`, `save...` methods. | Decide anything. No `if` about domain rules. |
| `src/middleware/` | Hono middleware: `requireSession` (sets `c.var.userId` and `c.var.sessionCreatedAt`) and `requireJourneyToken` (reads `Authorization: Bearer <journey token>` into `c.var.journeyToken`; the journey object checks it). | |
| `src/constants.ts` | Limits, lifetimes and windows (`SESSION`, `SIGN_IN_CODE`, `RATE_LIMIT`, `CHANGE_CODES`, `RESET_CODES`). No magic numbers in other files. | Domain rules shared with the app (those go in `@cage/shared`, e.g. `TIMERS`). |
| `src/types.ts` | Shared types and interfaces: Hono envs (`AppEnv`, `AuthedEnv`), `Message`, `Outgoing`, `ChannelSender`, `MessageSender`. | |
| `src/utils.ts` | Pure helpers: encoding, code hashing (`hashCode`, `matchesHash`), message text, `logDelivery`. | Touch D1 or bindings. |
| `src/senders/<provider>.sender.ts` | One message provider behind one channel (`ChannelSender`): Zalo ZNS, Twilio SMS, plus `fallback.sender.ts` (tries channels in order and logs each try) and the dev senders. Take `fetch` as a parameter so tests answer for the provider. | Log phone numbers or bodies; decide who gets a message. |
| `src/message-sender.ts` | Builds the `MessageSender` that `MESSAGE_SENDER` names from the vars and secrets ([docs/messaging.md](../../../docs/messaging.md)). | |
| `src/auth.ts` | Better Auth config ([ADR 0002](../../../docs/adr/0002-sign-in.md)). Its callbacks call services. | |
| `src/journey-object.ts` | The journey Durable Object: live state and alarms. Services reach it through its namespace binding. | |
| `src/app.ts` | Mounts the controllers. Nothing else. | |

Rules that the app or the website also need (code rules, timers, the escalation ladder, schemas) live in `packages/shared`, not here. Every user-facing string, including SMS text, comes from `packages/i18n`.

## Responses

Every route outside Better Auth's `/auth/*` answers with one of two bodies, defined in `packages/shared/src/response.ts`:

| Outcome | Status | Body |
| --- | --- | --- |
| Success with data | 200 / 201 | `{ "data": ... }`, built with `success(value)` |
| Success, nothing to return | 204 | none |
| Failure | 4xx / 5xx | `{ "error": { "code": "too_close", "message"?: "..." } }`, built with `failure(code)` |

- `code` is one of `ErrorCode` (shared zod enum). Clients switch on it and map it to copy, so add codes, never rename or remove one. `message` is for developers and is never shown to a traveller.
- Validate input with `validate(target, schema)` from `src/middleware/validate.ts`, not `zValidator` directly: it answers a bad body with `400 invalid_request`.
- Unknown routes answer `404 not_found` and uncaught errors `500 internal` (`app.notFound` / `app.onError` in `src/app.ts`).
- Clients read bodies with `ApiData(schema)` and `ApiError` from `@cage/shared`; tests use `readData` and `readError` from `test/helpers.ts`.
- Better Auth's `/auth/*` keeps its own format, because its client library reads it.

## Adding an endpoint

1. Schema in `packages/shared` (request and response), with tests if it carries rules.
2. Repository method for any new query.
3. Service method with the rule; return a result union for every outcome.
4. Controller route that validates with `validate`, calls the service and maps each result to a status and `success(...)` or `failure(code)`. New error codes go in `ErrorCode`.
5. Test through the HTTP API in `apps/api/test` (runs inside workerd). Test services directly when a rule is easier to reach that way.
6. Schema changes: edit `packages/db/src/schema.ts`, run `bun run generate` there, read the generated SQL, commit it.

## Safety rules that cut across layers

- The safe code and duress PIN are checked only in `codes.service.ts` (`checkCode` always computes both). A controller gives the **same response** for "safe" and "duress"; only the service acts on the difference.
- Every route needs the traveller's session, except `POST /journeys/:id/updates`, which takes only the journey token so a journey never stops on an expired session, and `GET /links/:token`, where the circle link itself is the key. Circle link tokens, like journey tokens, are stored only as hashes (`circle_links`), work only while the journey runs and the contact is still in the circle, and answer `404` in every other case.
- Messages to the circle are queued in the journey object's outbox and sent from its alarm, never inside the request, so the duress PIN answers exactly as fast as the safe code. Someone else's journey answers `404`, the same as one that doesn't exist. The journey token is stored only as a hash, in the journey's Durable Object, and dies when the journey ends.
- Logs never contain phone numbers, locations or message bodies in production.
- Secrets come from bindings (`c.env`), never constants.
