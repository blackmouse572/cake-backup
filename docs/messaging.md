# Messaging: Zalo ZNS and SMS

Sign-in codes go out by Zalo ZNS first (cheaper) and by SMS when Zalo can't deliver ([ADR 0001](adr/0001-stack.md), [ADR 0002](adr/0002-sign-in.md)). Circle links, alerts and lost-contact messages will use the same senders (#8).

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

> Mã xác nhận của bạn là <otp>. Đừng chia sẻ mã này cho ai.

In English: "Your verification code is <otp>. Don't share it with anyone." Both match `messages.code` word for word, so a code reads the same by Zalo and by SMS.

Zalo now calls ZNS "ZBS Template Message" in its dashboard; the API and the template types are the same. Use the authentication (OTP) template type: it keeps the code under 400 characters, adds a fixed "copy code" button, and needs no purpose. Approval takes about two to three working days.

### Circle templates (drafts, not submitted)

Circle messages go by SMS until these are approved; then each kind gets its own template id and the Zalo sender sends it instead of skipping it (`no_template`). The text is the same as `messages.*` in `packages/i18n`, so the circle reads the same words on either channel. Register them as custom (transaction) templates. Zalo doesn't allow a bare link in the text of these, so the circle link goes in the template's web button, filled with `url`.

| Kind | Parameters | Vietnamese text | Button |
| --- | --- | --- | --- |
| `journey_started` | `name`, `destination`, `time` | <name> vừa bắt đầu chuyến đi đến <destination>, dự kiến tới lúc <time>. | Xem chuyến đi, `url` |
| `alert` (`no_answer`) | `name` | <name> không nghe cuộc gọi kiểm tra. Hãy nhắn tin trước, đừng gọi ngay. | Xem vị trí, `url` |
| `alert` (`duress`) | `name` | <name> vừa nhập mã khẩn cấp. Đừng gọi hay nhắn cho <name>, người bên cạnh có thể nhìn thấy. | Xem vị trí, `url` |
| `alert` (`sos`) | `name` | <name> vừa bấm SOS. Hãy nhắn tin trước, đừng gọi ngay. | Xem vị trí, `url` |
| `alert` (`lost_contact`) | `name` | Cage mất kết nối với <name> sau giờ dự kiến đến nơi. | Xem vị trí cuối, `url` |
| `safe_now` | `name` | <name> đã báo an toàn bằng mã an toàn. Bạn không cần làm gì thêm. | none |
| `codes_reset` | `name` | <name> vừa đặt lại mã trên Cage. Nếu <name> chưa nhắc gì về việc này, hãy gọi hỏi thăm <name>. | none |

Things to check while submitting, because Zalo's rules change and the guides online disagree: whether a web button can take a different URL per message (each circle link has its own token), how long a parameter may be (a destination can be long), and whether one template per alert reason is needed or one alert template with the reason text as a parameter is accepted. Write down what Zalo says here.

## SMS for Vietnam

Twilio already works for numbers abroad, but it costs far more per message to +84 numbers than a local provider, and Vietnamese carriers only deliver from a registered brandname. So a local brandname provider should carry +84 numbers and Twilio the rest. To pick one, ask each provider:

- Price per OTP and per customer-care (CSKH) message, for Viettel, Mobifone and Vinaphone.
- How long brandname registration takes, and which papers it needs (business licence, the brandname's trademark or a letter of authorisation).
- Whether message templates must be pre-registered with the carriers, and how long that takes for a new template.
- Inbound SMS (#23): a number people can text back, with replies sent to us by webhook.
- An HTTP API with delivery reports by webhook.

Shortlist: SpeedSMS (HTTP JSON API, brandname, inbound replies and delivery reports by webhook), eSMS and Stringee. Prices weren't public on their sites when this was written, so compare their quotes. Once one is picked, it gets its own sender next to `twilio-sms.sender.ts` and an `SMS_PROVIDER` value.

## Setup checklist (Jaden)

Before any of this, revoke the GitHub credentials and rotate the Cloudflare secrets from the November 2026 cleanup, so new provider keys don't go into a compromised account.

1. Create a Zalo Official Account for the business, verify it, and enable ZNS (needs a payment method for the ZNS wallet).
2. Create a Zalo app at developers.zalo.me, link it to the OA, and grant the OA permissions for ZNS. Authorise it once to get the first refresh token.
3. Submit the code template above (vi, and en if wanted). Later: circle link, alert and lost-contact templates.
4. Choose the SMS route for Vietnam: brandname registration, cost per message, and inbound SMS for #23. Twilio works today for numbers abroad (and +84 with a registered sender); a Vietnamese provider gets its own sender here once chosen.
5. Put the values in staging: the vars in `wrangler.jsonc` and `wrangler secret put` for the secrets. Start with `ZALO_ZNS_DEVELOPMENT=true` and `MESSAGE_SENDER=zalo` to see a real code arrive on an admin's phone, then `zalo+sms`, then `sms` to check the fallback.
