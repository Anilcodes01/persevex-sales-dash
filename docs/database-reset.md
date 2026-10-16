# Clear development data from the admin profile

Open the navbar account menu → Admin profile → Clear all development data → Yes, clear data.

Only the signed-in administrator account and its current session remain. Other employees, administrators and sessions are removed. All teams, assignments, employee sales, collection records, targets, revisions, audit records and avatar references are cleared. Both sandbox and production Cashfree payments stay unchanged. The database schema and operational metadata remain intact.

The backend requires administrator authentication and the normal same-origin check. All database deletions run in one SQLite transaction; failures roll back. The button requires a confirmation and disables during the request. There is no maintenance flag, backup script or administrator bootstrap step. The page reloads afterward to discard stale data.

R2 avatar objects under the dedicated `avatars/` prefix that predate the reset are removed after the transaction. R2 cannot participate in the SQLite transaction; if cleanup fails, the database stays cleared and the response reports `avatarCleanupPending`. Retrying the reset can finish cleanup. No other R2 prefixes are touched.

This is a destructive development control, not an undoable archive. Remove it before a real-user rollout.
