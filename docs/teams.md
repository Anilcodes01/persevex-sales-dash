# Team deletion

Administrators can select a team, choose Delete team, and confirm in the dialog.
POST `/api/admin/teams/delete` accepts `teamId` with normal admin session and
same-origin checks. Team Leads/employees cannot delete teams.

Deletion is an archive: `deleted_teams` stores who deleted it and when. The same
transaction ends current memberships/Team Lead assignments and writes an audit
entry. Deleted teams disappear from the active directory, target team filter and
workspace team count. New assignments and edits against archived IDs fail.
Historical sales keep their team attribution and remain reportable; admins can
review pending historical sales. Account targets are retained. Names can be
reused for new active teams. Repeating deletion does not repeat its audit entry.

Affected users receive live/access-change notifications and lose current-team
permissions. No accounts, payment records, past sales or assignment history are
deleted. Schema version 11 adds archive metadata with no database reset.
