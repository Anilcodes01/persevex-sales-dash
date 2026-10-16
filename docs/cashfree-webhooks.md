# Cashfree payment feed

This integration receives **Payment Gateway Success Payment** webhooks and
replaces the TV demo list. It does not create employee sales, approve sales,
assign employees, change target progress, or change leaderboard rankings.

## Current setup: no-secret mode

`wrangler.jsonc` now enables `CASHFREE_ALLOW_UNSIGNED: "true"`. No Cashfree key
is needed in this mode. Add your environment to the same `vars` block:

```json
"vars": {
  "CASHFREE_ALLOW_UNSIGNED": "true",
  "CASHFREE_ENV": "production"
}
```

Use `sandbox` instead when testing. If `CASHFREE_ENV` already exists as a Worker
secret from an earlier setup, keep that value or remove the secret before adding
a same-named plain variable; do not declare both. If the webhook secret was
previously configured, signed verification remains enforced. To explicitly
switch it off, remove it yourself:

```sh
npx wrangler secret delete CASHFREE_WEBHOOK_SECRET
```

Deploy using `npm run cf:deploy`, then register Success Payment for the endpoint
below. No-secret rows show **Unverified**, even if the JSON claims SUCCESS.
Anyone knowing the endpoint can submit fabricated data; this mode authenticates
neither Cashfree nor the payer. Validation, duplicate handling, admin-only reads,
contact masking, environment labels and sales separation still apply.

Existing signed rows keep their verification flag. Enabling signed mode later
can replace an unverified row with authoritative signed facts for the same ID.
Unsigned deliveries never overwrite verified rows. Schema version 10 adds this
per-row verification flag without replacing existing records.

## Optional signed setup

1. Deploy the code with your existing `npm run cf:deploy` workflow.
2. In the Cashfree sandbox, find your Payment Gateway **Secret Key**.
   `CASHFREE_WEBHOOK_SECRET` is our configuration name for that key, not an
   unrelated password you generate yourself. Keep it out of chat/source control.
3. Run these from the project directory; Wrangler prompts for each value:

   ```sh
   npx wrangler secret put CASHFREE_WEBHOOK_SECRET
   npx wrangler secret put CASHFREE_ENV
   ```

   Enter the sandbox PG Secret Key for the first command and `sandbox` for the
   second. Environment is stored as a Worker secret too so it survives deploys
   without adding sensitive configuration to source. Neither variable needs a
   `NEXT_PUBLIC_` prefix. No Cashfree Client ID is needed for receiving webhooks.

4. In Cashfree: **Payment Gateway → Developers → Webhooks → Add Webhook Endpoint**.
   Enter:

   ```text
   https://persevex-sales-dash.aceospec.workers.dev/api/webhooks/cashfree
   ```

   Use your actual deployed Worker domain if different. Choose the documented
   `2025-01-01` or `2026-01-01` payload version and subscribe to **Success Payment**.
   Test the endpoint, add it, then make a sandbox payment. An unsigned probe is
   intentionally rejected; a test must carry Cashfree's valid signature.

5. Sign in as an admin and open `/tv`. The panel should say **Sandbox · Test
   payments**, show a successful payment and refresh without a page reload.
   Check Cashfree's delivery logs for HTTP 200. Retry/resend that event and
   confirm it still appears once. Test failed payments: they must not appear.

For production, replace the secret with the **production** PG Secret Key, set
`CASHFREE_ENV` to `production`, and configure the production dashboard endpoint.
Use separate deployed Workers for simultaneous sandbox and live testing. A
single receiver accepts only the currently configured environment/key. Never
label a sandbox key as production: the environment comes from our trusted
configuration, not from a verifiable sandbox flag in the webhook body.

Local development optionally uses the same two variables in ignored `.dev.vars`.
Keep sandbox credentials local. Cashfree cannot deliver directly to localhost;
use a deployed sandbox receiver or your own HTTPS tunnel. The agent has not
started a server, deployed code, configured real credentials or registered an
endpoint.

## Security and delivery behaviour

- Exact public route accepts POST only, without login/cookies or browser Origin
  checks. Signed-mode authentication is the Cashfree HMAC-SHA256 signature. Unsigned mode has no sender authentication. All existing
  authenticated app routes retain their session and Origin checks.
- Missing environment fails closed (503). Missing secret fails closed unless unsigned mode is explicitly enabled. JSON content type is required.
  Body streaming stops at 64 KiB, even if Content-Length is absent or incorrect.
- In signed mode, signature verification uses `x-webhook-timestamp` followed by the exact raw
  body bytes and native Web Crypto verification before JSON parsing or Durable
  Object access. No JSON reserialization, claimed idempotency header, query
  parameter, cookie, or source Origin can bypass verification.
- Timestamps must be milliseconds and cannot be more than five minutes ahead.
  Old correctly signed deliveries are accepted because Cashfree supports delayed
  retries/resends. Replay protection is the durable unique environment/payment ID,
  not a short expiry that would drop legitimate redeliveries. Keep dedup records;
  do not purge them independently and then replay historical events.
- Only `PAYMENT_SUCCESS_WEBHOOK` with `payment_status=SUCCESS` is persisted.
  Signed unrelated event types receive 200 without changing payment state.
  INR amounts are validated as positive amounts up to 99,999,999.99 and stored
  in integer paise. Unsafe numeric IDs, invalid dates, control characters and
  oversized payer fields are rejected. Large Cashfree IDs stay strings.
- One SQL transaction inserts the payment and advances the live version.
  Duplicate successful IDs return 200 without another row/notification. The same
  ID with conflicting order/amount/currency/time is rejected; changed customer
  metadata on a retry never overwrites the initial payer details.
- A failed database transaction returns 503 so Cashfree can retry. A live
  notification failure does not undo a committed payment; sockets reconnect to
  reload authoritative state. Configure Cashfree retries and monitor its Logs.
- Payment rows store only required payer/payment fields and a fingerprint,
  without raw webhook bodies, card/UPI/bank data or secrets in logs/audit entries.
- Only authenticated admins can read the TV API. The TV response masks email
  and phone details and shows the latest ten payments in the current IST month.
  Sandbox/production rows have separate keys and only the selected environment
  is returned. Stored payer data remains sensitive and accessible to account
  owners with database access; use your Cloudflare access controls accordingly.
- WebSockets carry only `payments_changed` plus version, to currently valid
  admin sessions. There is no payer information in socket messages. The TV
  refetches over its existing authenticated connection. Session expiry, logout,
  disable and role changes retain their existing enforcement.

For additional traffic protection, configure Cloudflare rules/rate limits for
this exact route if needed. Do not put a CAPTCHA/browser challenge or blanket
browser-Origin check on it. Do not copy an unverified Cashfree IP allowlist.

## Sources

- [Cashfree configuration](https://www.cashfree.com/docs/payments/online/webhooks/configure)
- [Signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification)
- [Payment payloads](https://www.cashfree.com/docs/api-reference/payments/latest/payments/webhooks)
- [Retries and duplicate delivery](https://www.cashfree.com/docs/payments/online/webhooks/overview)

Schema version 9 adds `cashfree_payments` without replacing existing sales or
target records. No database reset, bootstrap, new service, or new Durable Object
class migration is required. This receiver does not import past payments,
confirm settlements, process refunds, or initiate payments. The table represents
signed Cashfree payment successes received by this application.

## Hosted-form presence limitation

The TV marks verified successful payments as Paid. No Active row is generated:
Cashfree's Payment Form webhook is `PAYMENT_FORM_ORDER_WEBHOOK`, whose published
example is a paid form order. It does not document a form-presence heartbeat.
The existing receiver accepts PG `PAYMENT_SUCCESS_WEBHOOK`; do not configure
only the different Payment Form order event and expect it to be ingested.

Cashfree documents `cf_pf_load` and `cf_checkout_initiated` as client-side events
forwarded to external analytics, not live per-payer presence webhooks. A loaded
form is not evidence that its visitor remains online. A named Active-to-Paid
flow needs a supported identity-correlated activity integration or a form we
control; do not infer it from pending/failed payment statuses or analytics totals.

Sources checked:
- https://www.cashfree.com/docs/payments/no-code/payment-forms/webhooks
- https://www.cashfree.com/docs/payments/checkout/after/external-analytics

## Admin history

Admin → History → Payments lists stored notifications with time, payer name/email/phone, amount and payment ID. This authenticated admin view shows full contact details; TV continues to mask them. Date filters default to the current IST month, with inclusive end date, 25 rows per page and live refresh. Records are limited to the configured CASHFREE_ENV. A note identifies when the selected period includes unsigned/unverified notifications. This shows notifications received by this app, not a Cashfree historical import. History → Employee sales reuses the full sales table and its team/employee/date filters, independently of payment records.
