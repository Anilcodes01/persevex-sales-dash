# Codebase guide

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
workspace. Employees and managers with an established password are routed to `/employee`.
`app/employee/page.tsx` rechecks the session before rendering; unsigned users,
administrators and accounts requiring a password change return to `/`.

`app/components/employee-dashboard.tsx` composes the employee overview and
account settings from `app/components/employee/`. Password changes revoke
sessions; sign-out uses the backend.
Performance cards show unavailable values until sales/target APIs are built.
They do not represent recorded sales or fabricated performance.

`app/components/admin-dashboard.tsx` selects the People or Teams view and
composes the shared workspace layout. The People directory lives in
`app/components/admin/` and its API/state logic in `app/hooks/use-people-directory.ts`.
`app/lib/api.ts` holds frontend account types and same-origin API requests.

```text
app/
  components/
    layout/
      brand.tsx                  Shared logo link
      workspace-sidebar.tsx      Navigation only
      workspace-navbar.tsx       Full-width brand, current page and account menu
      account-menu.tsx           Account actions and Light/Dark/System theme choices
      theme-provider.tsx         Persistent appearance preference
      workspace-shell.tsx        Layout composition only
      page-heading.tsx           Page title and action slot
      workspace-footer.tsx       Shared footer
      workspace-dialog.tsx       Accessible dialog and save/dismissal guards
    forms/
      form-select.tsx            Shared shadcn select adapter for forms and filters
    admin/
      people-panel.tsx           People view composition and pagination
      people-stats.tsx           Account summary statistics
      people-filters.tsx         Search and access/job-role/status filters
      people-table.tsx           Directory rows and account action buttons
      account-dialog.tsx         Create/edit/reset/disable/reactivate forms
      types.ts                   Directory types and action titles
    employee/
      employee-overview.tsx      Overview, profile summary and performance placeholders
      account-settings.tsx       Profile and password change
      types.ts                   Workspace props
    admin-dashboard.tsx          Admin view selection and wiring
    employee-dashboard.tsx       Employee view selection and session actions
    teams-panel.tsx              Team management
  hooks/
    use-people-directory.ts      Directory fetching, filtering and account mutations
  lib/
    api.ts                       API client and account types
    display.ts                   Shared name initials
```

Keep layout components responsible for presentation and callbacks. Feature
components own their forms and domain UI, while hooks handle asynchronous state
and API operations. New workspace pages should reuse the shell, sidebar and
navbar instead of duplicating them. The refactor changes no API or database schema.

`scripts/dev.mjs` starts the hot-reloading Next frontend and local Wrangler backend
together. Development API rewrites live in `next.config.ts`; production remains a
static export. `worker/security/request-origin.ts` handles the proxy's local-only
origin exception. See `docs/local-development.md` for commands and persistence.

Shared job-role labels and validators live in `shared/roles.ts`. Authentication
permissions still use Employee/Manager/Administrator access, separate from job
titles. `components/ui/` contains the shadcn primitives; `lib/utils.ts` supplies
their class utility. Theme/layout styles live in `app/globals.css` and
`app/workspace.css`. See `docs/roles-and-ui.md` for migration and review notes.

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

The navbar spans the workspace above the navigation sidebar. Account settings
and sign-out live in its shadcn dropdown menu. Appearance is managed by
`next-themes`; forms and filters use the shared shadcn Select adapter.
