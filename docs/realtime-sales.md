# Realtime sales

Open **My sales** or **Approvals** to establish one same-origin authenticated
WebSocket at `/api/employee/sales/live`. The existing session cookie is used;
no token is put in a URL. Worker forwards the connection to the organisation.
The Next development rewrite also supports WebSocket upgrades (verified in the
installed Next router/proxy source); actual browser connectivity is user-tested.

`worker/realtime/sales-live.ts` manages hibernating connections through
`acceptWebSocket`/`getWebSockets`. A serialized attachment stores session hash,
account ID, session expiry and a scope signature. No in-memory socket registry
is required after hibernation. The frontend logic lives in
`app/hooks/use-sales-live.ts`, with sales-screen wiring in `SalesPanel`.

## Delivery and recovery

A persisted `sales_version` counter increments in the same transaction as each
new sale or approval/rejection. Idempotent retries do not increment or broadcast.
After commit, the seller, current assigned Team Lead and administrators receive
`{type: "sales_changed", version}`. No student name, phone, note, amount or
identity is in the message. Each recipient fetches its authorised REST data.
Notification failures never turn an already committed sale into a failed
receipt; affected connections close to force recovery.

The server sends `{type: "ready", version}` at connection and explicit sync.
The client always refreshes on ready/reconnect, ignores repeated versions, and
refreshes on newer versions. Version gaps may represent another team's changes;
they still cause an authoritative refresh, without needing a replay log.
Changes are batched in a bounded 150ms window; a continuous burst cannot keep
postponing refresh. A change during an active refresh queues another refresh.
Pagination stays on the chosen page unless approvals remove its last page.

The UI shows Connecting, Live, Reconnecting, Offline or Unavailable, last
successful live refresh time, and a stale-data label when disconnected. It uses
exponential retry backoff with jitter capped around 30 seconds. Returning to a
visible tab requests a sync. A 60-second ping with a 15-second timeout detects
otherwise silent broken connections. Cloudflare auto-responds to ping without
waking the object. Heartbeats still count toward applicable traffic quotas;
measure them alongside handshake/authentication/refresh costs before rollout.

## Access lifecycle

- Handshakes enforce trusted origin, active unexpired session, password state and
  account-scoped reconnect limits.
- Recipients are selected from current assignments; relevant sockets are
  authenticated again before notification.
- Logout, password reset/change, session eviction at login, account updates or
  disabling, and team/membership changes recheck existing sockets.
- Invalid sessions close with 4401; scope changes send `access_changed`, clear
  cached sales and refresh access/context. Role/title changes reload the workspace
  to apply the new navigation and permissions.
- A durable alarm closes expired sessions even when no sales are happening. It
  schedules the next connected session expiry, rather than polling every account.

No timers run inside the Durable Object, so idle sockets can hibernate. The
single expiry alarm is reserved for live-session cleanup; future alarm features
must coordinate with this scheduler rather than overwrite it.

## Verification

Backend tests use in-memory SQLite and fake sockets; only the 101 upgrade boundary
is stubbed because Node Response does not implement Cloudflare upgrades. They
cover committed/versioned/scoped messages, private-data exclusion, retry
suppression, recovery from a recreated object, access changes, logout, disabling,
expiry, trusted origin, authentication and successful handshake registration.
These tests do not claim real browser/Cloudflare transport or latency validation.

User runtime checks:

1. Open a seller's My sales, the assigned Team Lead's Approvals and admin
   Approvals in separate signed-in browser sessions. All should show Live.
2. Submit a sale: both eligible queues should update without Refresh. A different
   Team Lead must not see it.
3. Approve or reject: both queues should update; seller history/status/totals
   should update. Pending records never count in approved totals.
4. Disconnect one browser, make changes elsewhere, then reconnect: stale state
   should clear only after fresh authorised data loads.
5. Reassign a team or disable/log out an account: old scopes must stop receiving
   updates and revoked sessions must lose live access.

No server, browser, deployment or external service was started for these checks.
Cloudflare reference: https://developers.cloudflare.com/durable-objects/api/state/
