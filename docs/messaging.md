# Messaging: Zalo ZNS and SMS

Sign-in codes go out by Zalo ZNS first (cheaper) and by SMS when Zalo can't deliver ([ADR 0001](adr/0001-stack.md), [ADR 0002](adr/0002-sign-in.md)). Circle links, alerts and lost-contact messages will use the same senders (#12).

## How it works

`MESSAGE_SENDER` (a Worker var) picks the sender:

| Value | Sends by |
| --- | --- |
| `zalo+sms` | Zalo ZNS, then SMS. Production and staging. |
| `sms` | SMS only: Zalo turned off. |
| `zalo` | Zalo only, for trying ZNS on staging before an SMS provider is set up. |
| `console` | Prints the message to the log. `wrangler dev`. |
| `none` | Nothing. Tests read the code from D1. |

Zalo is skipped, and the message goes by SMS, when:

- the number isn't Vietnamese (ZNS only reaches +84 numbers),
- there is no ZNS template in the traveller's language (`ZALO_ZNS_CODE_TEMPLATE_EN` unset),
- the number has no Zalo account, Zalo refuses, or it doesn't answer within 8 seconds,
- the traveller tapped "No Zalo? Send by SMS" (the app sends `x-code-channel: sms`, so SMS goes first).

If every channel fails, `/auth/phone-number/send-otp` answers `503` (`code_not_sent`) instead of "code sent".

Each try writes one JSON line to the Worker logs: `{"event":"message_delivery","kind":"code","channel":"zalo","locale":"vi","status":"sent","providerId":"..."}`, or `status` `failed` / `skipped` with a `reason` such as `no_zalo_account`, `no_template` or `twilio_21211`. There are no phone numbers and no message text in it.

## Settings

Vars go in `wrangler.jsonc` (per environment). Secrets are set with `wrangler secret put NAME` and never committed. The API refuses to send if a setting it needs is missing, and the error names the setting.

| Name | Kind | What |
| --- | --- | --- |
| `MESSAGE_SENDER` | var | See above. |
| `ZALO_APP_ID` | var | The Zalo app id (developers.zalo.me), linked to the Official Account. |
| `ZALO_APP_SECRET` | secret | That app's secret key. |
| `ZALO_REFRESH_TOKEN` | secret | The first OA refresh token, from authorising the app for the OA. |
| `ZALO_ZNS_CODE_TEMPLATE_VI` | var | Approved ZNS template id for the Vietnamese code message. |
| `ZALO_ZNS_CODE_TEMPLATE_EN` | var | Same in English. Optional: without it, English speakers get an SMS. |
| `ZALO_ZNS_DEVELOPMENT` | var | `true` sends in ZNS development mode (only to the OA's admins, templates don't need approval yet). |
| `SMS_PROVIDER` | var | `twilio` for now. A Vietnamese brandname provider is added once one is chosen. |
| `TWILIO_ACCOUNT_SID` | var | Twilio account (AC...). |
| `TWILIO_AUTH_TOKEN` | secret | Twilio auth token. |
| `SMS_FROM` | var | A Twilio number, an approved alphanumeric sender (brandname), or a messaging service id (MG...). |

### The Zalo token

A Zalo OA access token lasts about 25 hours, and each refresh token works once, so they can't be secrets. The API keeps the current pair in D1 (`provider_tokens`) and rotates it before it expires. `ZALO_REFRESH_TOKEN` is only read while that table has no Zalo row. A refresh token unused for about three months stops working; then authorise the app again, update the secret and delete the row:

```sh
wrangler d1 execute cage --remote --command "delete from provider_tokens where provider = 'zalo'"
```

### The code template

Register the ZNS template (type: OTP/authentication) with one parameter named `otp` holding the 6-digit code. Like the SMS text (`messages.code` in `packages/i18n`), it must not name Cage and should read like any verification message:

> Mã xác nhận của bạn là <otp>. Không chia sẻ mã này với ai.

## Setup checklist (Jaden)

1. Create a Zalo Official Account for the business, verify it, and enable ZNS (needs a payment method for the ZNS wallet).
2. Create a Zalo app at developers.zalo.me, link it to the OA, and grant the OA permissions for ZNS. Authorise it once to get the first refresh token.
3. Submit the code template above (vi, and en if wanted). Later: circle link, alert and lost-contact templates.
4. Choose the SMS route for Vietnam: brandname registration, cost per message, and inbound SMS for #27. Twilio works today for numbers abroad (and +84 with a registered sender); a Vietnamese provider gets its own sender here once chosen.
5. Put the values in staging: the vars in `wrangler.jsonc` and `wrangler secret put` for the secrets. Start with `ZALO_ZNS_DEVELOPMENT=true` and `MESSAGE_SENDER=zalo` to see a real code arrive on an admin's phone, then `zalo+sms`, then `sms` to check the fallback.
