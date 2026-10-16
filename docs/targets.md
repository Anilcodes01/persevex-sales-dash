# Personal targets with editable date ranges

Registration amount is the initial INR collection. Overall amount is the total
sale value, including unpaid remaining money. Sale remaining is overall minus
registration. Only approved sales contribute to either target basis.

## Setting and editing

Admin and Team Lead **Targets** screens default to the current calendar month
(first through last day), in Asia/Kolkata. From and To fields allow any custom
range between 2000 and 2099, including a single day or a cross-month period.
Both dates are inclusive: a target ending 12 October includes all of that IST
day and excludes 13 October midnight onward. Invalid dates/reversed ranges are
rejected. No calendar-month target amount is automatically prorated.

The People section shows approved amounts within the selected view dates. The
Assigned targets section lists targets overlapping those dates and calculates
each target's achievement across its own full period, even when it extends
outside the view window. **Edit target** opens existing dates, basis and amount;
saving changes preserves the target's stable ID, advances its revision and
retains previous values in audit history. Stale revisions return 409 rather than
overwriting another editor. Identical edits are idempotent.

Multiple targets per person are supported over non-overlapping periods. One
person cannot have two overlapping targets, even on different bases. An adjacent
target may start the day after another ends. Editing a period into a conflict is
rejected without changing the target or history.

## Permissions and performance

Admins can set/edit targets for active employees and Team Leads. Team Leads can
set/edit targets only for active employee members of their assigned teams, never
themselves or other Team Leads. The server checks current assignments and target
ownership on every write. Ordinary employees cannot write targets. Transfers do
not delete existing targets, but immediately remove the old Team Lead's editing
rights. Team Lead targets are personal, not sums of team members' performance.

The overview defaults to the current month and supports custom view dates.
Registration amount, overall value and approved count use the view dates. An
exact-period target can appear in the main achievement card. All overlapping
assigned targets also appear below with their actual dates, achievement and
remaining amount. This prevents a custom target from being incorrectly scored
using only part of its period. Percentages may exceed 100%; only display values
are rounded. Target and sale changes refresh these views live.

## APIs

- `GET /api/employee/performance?from=YYYY-MM-DD&to=YYYY-MM-DD`: caller's
  selected-date summary plus assigned targets/progress overlapping the window.
- `GET /api/manager/targets?from=YYYY-MM-DD&to=YYYY-MM-DD`: permitted People
  summaries and assigned targets. Team Lead/admin access only.
- `POST /api/manager/targets`: accountId, from, to, basis (registration/overall),
  amount (positive INR decimal string), expectedRevision. Include targetId for
  editing an existing target, including moving its dates.

Legacy `month=YYYY-MM` queries and saves resolve to that month's first/last day.
When no dates/month are supplied the current month is used. A legacy save to an
existing exact range updates that record subject to revision checks. UI creates
send revision 0; edits send the existing revision and stable target ID.

## Schema and migration

Version 7 stores current targets in **period_targets** and immutable edits in
**period_target_revisions**. It copies existing monthly targets and revision
history into date ranges once, preserving amounts, selected basis, actor,
timestamps and revisions. Leap-year month ends are resolved correctly. The old
performance_targets/target_revisions tables remain read-only historical copies;
new changes are written to the period tables. Migration is transactional and
repeat initialization does not duplicate records. Accounts, sessions, teams and
sales are retained. No new Durable Object class migration is required.

Existing sales without recorded total value retain valid registration amounts;
their unknown overall amounts are excluded from overall progress and visibly
counted in a warning. Financial dates are sale recorded dates in IST; later
approval makes the sale eligible in its original period. Installments/refunds
and corrections remain separate future features.

## Verification

Tests cover permissions, approval-only calculations, basis edits, realtime
notifications, same-day/custom/cross-month boundaries, rejection of invalid and
reversed dates, overlap protection (including edits), stable IDs/revisions, and
migration of monthly/leap-year records with original history preserved.

Operator check: create a custom target, submit and approve sales inside/outside
its period, then use **Edit target** to change dates, basis and amount. Verify
updated achievement in another signed-in overview and target screen. Server,
browser and deployment verification remains user-run.

## Number-of-sales targets

The target-basis selector also supports `sales_count` (Number of sales).
Admins can assign it to eligible employees and Team Leads; Team Leads can
assign it only to their existing eligible employee scope. Date selection,
overlap protection, revisions, audit history and live notifications apply.
Only approved sale records created within the inclusive IST target dates
count. A record counts once regardless of its registration or overall value.
Pending/rejected sales do not count. Achievement can exceed 100%.

POST `/api/manager/targets` accepts `basis: "sales_count"` and a decimal-string
`count` containing a whole number from 1 to 9999999, instead of `amount`.
Monetary targets still accept `amount` in rupees. A target may be edited to a
different basis; previous revisions retain their original units and values.

Schema version 8 stores count targets in `target_count` and keeps monetary
`amount_paise` null for those rows. Existing monetary values and revisions are
preserved by a startup transaction. No database reset or re-bootstrap is needed.
Performance responses provide `targetCount`, `targetValue`, `achievedValue`
and `remainingValue`; generic values use counts for sales-count targets and
paise for monetary targets. The UI formats those values using the basis.

The administrator Targets page has a searchable Team filter (default All teams).
Both eligible people and assigned targets are filtered server-side by current
team membership or Team Lead assignment. Reporting dates remain independent.
Team Leads retain their restricted scope; a teamId parameter cannot expand it.

The People table’s set/edit action opens an existing overlapping target when there is one (preferring an exact date match), including its current basis and revision. When several targets overlap the view, select the desired record from Assigned targets. Editing can switch between monetary and sales-count bases without creating a conflicting duplicate.
