# Job roles and workspace access

Accounts now have a **Job role** and separate **Workspace access** setting.

Job roles include Employee, Team Lead, Business Development Executive, Business
Development Associate, Business Development Manager, Manager and Administrator.
These labels are shared between the frontend and backend in `shared/roles.ts`.

Workspace access controls permissions:

| Access        | Capabilities                                          |
| ------------- | ----------------------------------------------------- |
| Employee      | Personal workspace, own account and assigned team     |
| Manager       | Personal workspace and teams assigned to that manager |
| Administrator | Account and team management                           |

Choose Manager access when a Team Lead or Business Development Manager should
oversee a team. A job title alone does not grant manager/admin permissions.
Existing team assignments continue to depend on workspace access. Changing a
job title preserves assignments; changing access closes incompatible assignments.
Sales submission and approval features are still pending.

Administrators can create/edit job roles and filter the People directory by
job role, access and account status. The API accepts `jobRole` alongside the
existing `role` access field. Existing integrations that omit `jobRole` retain
their previous defaults; edits preserve the account's current title.

## Migration

Application schema version 4 adds the `job_role` column to `accounts`, using an
additive migration. Existing accounts get a title matching their current access.
IDs, passwords, sessions, roles and team history remain intact. No bootstrap or
database recreation is needed. Deploy using `npm run cf:deploy`.

## UI structure

The site uses shadcn/ui's Radix Nova component sources in `components/ui`:
Button, Input, Label, Badge, Table and Dialog. `components.json` configures the
CLI, and `lib/utils.ts` provides the shared class utility. Account dialogs use
Radix focus management and keyboard dismissal, guarded while a save is running.

`app/globals.css` defines orange/white theme tokens. `app/workspace.css` contains
the minimal workspace layout and responsive rules. Corners are square, surfaces
are light, and controls use short colour transitions. Pages have a brief fade
and four-pixel entrance movement. Reduced-motion preferences disable animations.

## Manual review after deployment

1. Sign in as admin; create or edit an account with each new job role.
2. Verify the saved label and job-role filter in People.
3. Give a Team Lead Manager access, then assign them to a team.
4. Verify that the manager sees only their assigned team names in their workspace.
5. Verify that an Employee-access account with a manager job title has no admin
   controls and cannot manage teams.
6. Check sign-in, password changes, account dialogs and team forms on desktop
   and mobile. Confirm keyboard navigation and Escape dismissal in dialogs.
7. Inspect existing accounts and assignments to confirm the migration preserved
   them. `/api/health` should report `schemaVersion: 4`.

No browser/runtime verification or deployment was performed by the agent.
