# Sales submission and approval

Employees and Team Leads use the navbar **Create sale** button from any
workspace view to record student name, phone,
initial registration INR amount, total overall INR sale value, one of the 25 supplied domains and an optional note.
Student details are now explicitly in scope per the user's updated requirements;
they are restricted to the seller, assigned Team Lead and administrator views.
Do not expose them in future aggregate/TV routes or runtime logs.

The server resolves identity from the session. Ordinary employees can submit
only to their current member team. Team Leads can submit to their member team
or teams they currently lead; when several are available they choose among
those assignments. No assigned team means submission is unavailable.
The saved team is a historical snapshot and does not move after a transfer.

Every sale starts pending, including a Team Lead's own sale. The **Approvals**
view is available to Team Leads (job role) and administrators (access role).
A Team Lead can approve or reject sales only in teams they currently lead,
including their own sale as explicitly requested. Administrators can review all
teams. Manager access alone does not grant sale review rights. Rejection requires
a reason. Reviewed records cannot be switched to another outcome; repeated
same-outcome decisions are safe. Approval is not payment verification.

Money is stored as integer paise. A sale and its initial collection event are
inserted in the same SQLite transaction with an audit event. Only approved
sales contribute to the all-time totals shown in My sales. Reporting-period
rankings, refunds and installments remain future work. Date-range personal targets
and achievement are implemented; see `docs/targets.md`.
Sales history and approval queues now receive live change notifications; see
`docs/realtime-sales.md`.

**My sales** contains the list, approved totals and live status only. Creation
lives in a shared modal. Closing an unsent form retains the account-scoped
draft; successful acceptance clears the draft before the modal closes, and the
visible list refreshes. The modal cannot be dismissed during submission.

## APIs

- `GET /api/employee/sales/context`: caller's eligible teams and review capability.
- `POST /api/employee/sales`: studentName, phone, amount (INR decimal string),
  overallAmount (total INR decimal string), domain, note, teamId, submissionId. Returns the authoritative sale receipt.
- `GET /api/employee/sales?page=1`: own history, 25 rows/page, approved totals.
- `GET /api/manager/sales?page=1`: scoped pending queue for Team Leads/admins.
- `POST /api/manager/sales/review`: saleId, status (approved/rejected), reason.

Creation uses an account-scoped submission UUID and a normalized payload digest.
An identical retry returns the existing receipt; a changed payload for a used
key conflicts. Receipts are recoverable after a team transfer. As requested, the
form does not ask for an order reference: separate deliberate submissions are
not deduplicated based on student phone/name/domain, because repeat purchases
may be legitimate. Business-reference duplicate detection needs a later product
choice if required.

The browser retains account-scoped drafts in localStorage on this device.
After ambiguous errors, the form preserves the exact key/details for retry.
Student details are in that draft; avoid shared-device use without clearing
browser storage. Saved receipt and history remain authoritative. The form
accepts 10–15 digit phone numbers with optional leading + and familiar separators,
positive INR amounts with at most two decimals, names up to 100 characters and
notes up to 500 characters.

Schema version 7 includes sales/collection_events, overall sale value and monthly targets without replacing
existing data. No account bootstrap or new Durable Object migration is needed.
Deploy with the existing user-run Cloudflare workflow. No deployment, browser or
server startup is performed as part of implementation.

Tests cover ownership spoofing, unassigned-team rejection, precision/domain
validation, pending exclusion, retry uniqueness, Team Lead review isolation,
self-approval, admin approval/rejection, historical attribution and own history.

Admin Sales: `/api/admin/sales` is administrator-only and defaults to the current
calendar month in IST. Optional `teamId`, `employeeId`, inclusive `from`/`to`
and `page` filter both the paginated list and approved summary totals.
All sale statuses and former/inactive sellers remain visible; team attribution
uses the team stored on the sale. The admin sidebar Sales page uses shadcn
selects/calendars and existing live sales updates.

TV display: sign in as an administrator, then open `/tv`. The sidebar-free
full-screen display ranks employees and historical sale teams by approved
registration amount for the current IST month. Equal amounts share a rank;
Team Leads' own sales are included. Both lists rotate in groups of five every
15 seconds. Recent activity includes pending/approved/rejected sales but no
student details. `/api/admin/tv` aggregates all matching rows server-side,
not only the first page of sales. The existing authenticated live socket
refreshes the board on changes; a minute refresh also recovers reads and
rolls over the reporting month. Sessions retain normal expiry and revocation.

TV ranking updates animate persistent tiles from their previous positions,
including interrupted animations during bursts of approvals. Up/down icons
reflect changes in actual competition rank and clear after 20 seconds. Initial
loads, tied ranks and display-page rotation do not invent movement indicators.
Reporting-month changes reset comparison history. Reduced motion skips sliding.

Admin Overview is the default administrator page. `/api/admin/overview`
aggregates inclusive IST date ranges (default current month), all submitted
sales and approval counts, approved registration collections, approved overall
value and remaining amounts. Unknown legacy overall values are flagged and
excluded from value/remaining totals. Registrations count approved sale records,
not distinct students. Workspace account/team totals are current and independent
of reporting dates. The page uses existing live updates and calendar controls.
