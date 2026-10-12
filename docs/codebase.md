# Backend code guide

All API URLs remain under `/api/`. Modules are separated by responsibility;
they are deployed together as one Worker and one Durable Object class.

```text
worker/
  index.ts                       Worker entrypoint: assets, API forwarding, origin checks
  types.ts                       Shared account and Cloudflare binding types
  durable-objects/
    organisation.ts              SQLite initialisation, health, request error boundary
  routes/
    router.ts                    API dispatch, session checks and admin permissions
    auth.ts                      Login, first-admin setup and password changes
    accounts.ts                  Account creation, disabling and password resets
  storage/
    auth-store.ts                Shared session lookup, audit and rate-limit queries
    schema.ts                    Authentication table/index definitions
  security/
    credentials.ts               Password hashing, session cookies and token helpers
  http/
    helpers.ts                   JSON responses, body limits and HTTP errors
```

## Follow a login request

1. The frontend sends `POST /api/auth/login`.
2. `index.ts` checks the HTTP method and origin, then forwards to the organisation.
3. `organisation.ts` delegates to `routes/router.ts` with its storage adapter.
4. The router applies request limits, parses JSON and selects the login handler.
5. `routes/auth.ts` verifies the password and saves the session transactionally.
6. The response sets the secure session cookie.

## Frontend workspaces

`app/page.tsx` handles sign-in, first-login password changes and the admin
workspace. Employees with an established password are routed to `/employee`.
`app/employee/page.tsx` rechecks the session before rendering; unsigned users,
other roles and accounts requiring a password change return to `/`.

`app/components/employee-dashboard.tsx` contains the employee overview and
account settings. Password changes revoke sessions; sign-out uses the backend.
Performance cards show unavailable values until sales/target APIs are built.
They do not represent recorded sales or fabricated performance.

`app/components/admin-dashboard.tsx` contains the admin People directory.
`app/lib/api.ts` holds frontend account types and same-origin API requests.

`app/components/teams-panel.tsx` implements team management under the admin
Teams tab. Its APIs live in `worker/routes/teams.ts`, with queries in
`worker/storage/teams-store.ts` and additive table definitions in
`worker/storage/team-schema.ts`. `app/components/employee-team.tsx` shows only
the signed-in employee's own team. See `docs/teams.md` for assignment rules.

Route handlers run inside the Durable Object, so their SQL and transactions
access its persistent SQLite storage. The storage adapter is an internal helper,
not another service or database. Security helpers do not own storage.

Future team, sale and approval APIs should get their own route modules and
storage helpers. Keep the entrypoint small and enforce permissions in the
organisation router before calling protected handlers.
