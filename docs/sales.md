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
Team Leads' own sales are included. The selected list rotates in groups of seven every
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

The TV layout is now two panels: Sales performance with Team/Individual
buttons on the left and Payments (Cashfree) on the right. Totals, activity
cards and the previous outer header/footer are removed. Cashfree rows are
static fictional fixtures, explicitly marked Demo data, independent of sales.
Existing live ranking animations remain. Registration totals remain real;
count-based target/achievement values from the visual reference are not invented.

TV count columns: Target, Sales and Achieved replace monetary registration
values. Rankings use approved sales count with shared count ties. Targets must
be sales-count targets matching the complete displayed calendar month. Team
targets sum current memberships plus the Team Lead, deduplicated by person;
if any person lacks a matching target, the team target is Not set and its
percentage is blank. Custom-period and monetary targets are not converted.
Percentages can exceed 100%; the visual bar stops at 100%.

Cashfree is now implemented: the TV panel uses authenticated, masked, current-
month successful payment rows instead of demo fixtures. See
[cashfree-webhooks.md](cashfree-webhooks.md) for user-run deployment, sandbox
setup, secrets, security controls and limitations. It remains independent of
employee submissions and leaderboard/target credit.

### Administrator sales reset

In People, use a person’s three-dot menu → Reset sales. Choose inclusive IST dates and confirm. All existing pending or approved sales in that range become rejected with an administrator reset reason; original student details, amounts, submission IDs and collection events remain in history. Approved totals, target progress and TV rankings update through the existing live notifications. Already rejected sales stay unchanged. New submissions after the reset count normally. The action is admin-only and audited per sale; reset records cannot be approved again through the review endpoint.

### Live notification sounds

Admin and Team Lead navbars have an Enable sale sounds / Mute sale sounds icon and volume control. TV has the same control next to fullscreen. Sound starts muted on each page load and must be enabled by a click for browser audio permission. Default volume is 25%.

A newly committed employee/Team Lead submission emits `sale_submitted` to connected administrators and relevant Team Leads. It uses `/sounds/mixkit-software-interface-back-2575.wav`, even while pending. Reviews, resets and target edits do not emit this notification. New Cashfree payment inserts emit `payment_received` to administrators, using `/sounds/mixkit-page-forward-single-chime-1107.wav`; retries and verification upgrades do not sound. TV listens as the signed-in administrator. No sound is generated from ranking changes or data refresh comparisons.

Audio uses a bounded sequential Web Audio queue; clips do not overlap. Live ready/sync messages establish the current version without audio. Each sound listener deduplicates event versions and never fetches historical notifications on reconnect. Muting clears queued audio and stops playback. Each browser tab controls its own sound independently.
