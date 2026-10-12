# Teams and assignments

Administrators manage teams from the **Teams** sidebar tab. Create employee and
manager accounts in **People**, then create a team, select its manager and assign
employees. A team can be created without a manager and configured later.

An employee belongs to at most one current team. Each team has at most one
current manager; a manager may oversee several teams. Reassigning an employee
closes their previous membership and opens a new one, using server timestamps.
Removing them closes the membership without deleting its history. Manager
changes preserve the same history. Backdated transfers are not implemented.

Disabling an account preserves its assignments and marks it inactive. Only
active employee/manager accounts can be newly assigned. Changing an account's
role closes assignments that no longer match that role. Administrators can
remove an inactive employee from a team.

## APIs

| Endpoint | Method | Access and fields |
| --- | --- | --- |
| `/api/admin/teams` | GET | Admin; teams, current members/managers and eligible accounts |
| `/api/admin/teams/save` | POST | Admin; name, managerId; optional teamId for editing |
| `/api/admin/teams/assign` | POST | Admin; accountId, teamId; empty teamId removes assignment |
| `/api/employee/team` | GET | Employee; their own team and current active manager name |

Team names are unique ignoring case. Employees cannot select another identity
to inspect or change assignments. Admin mutations enforce server permissions
and record audit events in the same transaction as their changes.

## Storage and deployment

The additive schema introduces `teams`, `team_memberships`, and
`manager_assignments`, advancing the application schema version to 3. Existing
accounts and sessions are preserved. Deploy normally with `npm run cf:deploy`;
do not change the Durable Object class migration or rerun admin bootstrap.

After deployment, create two teams, assign a manager, move a synthetic employee
between teams, and inspect the employee dashboard. The membership table should
retain both records with only the current one having `ends_at = NULL`. Sales
and manager approval workflows will be built on these assignments next.
