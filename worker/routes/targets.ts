import type { Account } from "../types";
import type { AuthStore } from "../storage/auth-store";
import { HttpError, json } from "../http/helpers";
import { TARGET_BASES } from "../../shared/targets";
import { rupeesToPaise } from "../security/money";
import {
  canManageTargets,
  targetScope,
  targetProgress,
  assignedTargetProgress,
} from "../storage/targets-store";
import { requestedRange } from "../storage/target-periods";
import { advanceSalesVersion, saleTeams } from "../storage/sales-store";
export function ownPerformance(actor: Account, store: AuthStore, url: URL) {
  const range = requestedRange(url.searchParams);
  return json({
    month: range.from.slice(0, 7),
    from: range.from,
    to: range.to,
    performance: targetProgress(store, range, "a.id=?", [actor.id])[0],
    targets: assignedTargetProgress(store, range, "a.id=?", [actor.id]),
  });
}
export function listTargets(actor: Account, store: AuthStore, url: URL) {
  if (!canManageTargets(actor))
    throw new HttpError(403, "Team Lead or administrator access required");
  const range = requestedRange(url.searchParams),
    scope = targetScope(actor);
  const teamId =
    actor.role === "admin" ? url.searchParams.get("teamId") || "" : "";
  if (teamId) {
    scope.where +=
      " AND (a.id IN (SELECT account_id FROM team_memberships WHERE team_id=? AND ends_at IS NULL) OR a.id IN (SELECT account_id FROM manager_assignments WHERE team_id=? AND ends_at IS NULL))";
    scope.args.push(teamId, teamId);
  }
  const teams =
    actor.role === "admin"
      ? store.storage.sql
          .exec<{ id: string; name: string }>(
            "SELECT id,name FROM teams WHERE id NOT IN (SELECT team_id FROM deleted_teams) ORDER BY name_key",
          )
          .toArray()
      : [];
  return json({
    teamId,
    teams,
    month: range.from.slice(0, 7),
    from: range.from,
    to: range.to,
    people: targetProgress(store, range, scope.where, scope.args),
    targets: assignedTargetProgress(store, range, scope.where, scope.args),
  });
}
export function saveTarget(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
) {
  if (!canManageTargets(actor))
    throw new HttpError(403, "Team Lead or administrator access required");
  const range = requestedRange(body);
  if (
    typeof body.accountId !== "string" ||
    !TARGET_BASES.some((b) => b.value === body.basis)
  )
    throw new HttpError(400, "Select a person and target basis");
  const count = body.basis === "sales_count";
  const targetCount =
    count && typeof body.count === "string" && /^[1-9]\d{0,6}$/.test(body.count)
      ? Number(body.count)
      : null;
  if (count && targetCount === null)
    throw new HttpError(
      400,
      "Enter a whole-number sales target between 1 and 9999999",
    );
  const amount = count ? null : rupeesToPaise(body.amount, "Target");
  const scope = targetScope(actor);
  const recipient = store.storage.sql
    .exec<Account>(
      `SELECT a.* FROM accounts a WHERE a.id=? AND ${scope.where}`,
      body.accountId,
      ...scope.args,
    )
    .toArray()[0];
  if (!recipient)
    throw new HttpError(
      403,
      "You can set targets only for eligible assigned employees. Team Leads cannot set their own or another Team Lead's target.",
    );
  if (body.targetId !== undefined && typeof body.targetId !== "string")
    throw new HttpError(400, "Invalid target ID");
  const existing = store.storage.sql
    .exec<{
      id: string;
      basis: string;
      amount_paise: number;
      target_count: number | null;
      revision: number;
      from_date: string;
      to_date: string;
    }>(
      body.targetId
        ? "SELECT * FROM period_targets WHERE account_id=? AND id=?"
        : "SELECT * FROM period_targets WHERE account_id=? AND from_date=? AND to_date=?",
      recipient.id,
      ...(body.targetId ? [body.targetId as string] : [range.from, range.to]),
    )
    .toArray()[0];
  if (body.targetId && !existing) throw new HttpError(404, "Target not found");
  if (
    body.expectedRevision !== undefined &&
    (!Number.isSafeInteger(body.expectedRevision) ||
      body.expectedRevision !== (existing?.revision ?? 0))
  )
    throw new HttpError(
      409,
      "This target changed while you were editing it. Refresh targets and reopen the form.",
    );
  if (
    existing?.basis === body.basis &&
    existing.amount_paise === amount &&
    existing.target_count === targetCount &&
    existing.from_date === range.from &&
    existing.to_date === range.to
  )
    return json({
      ok: true,
      targetId: existing.id,
      revision: existing.revision,
    });
  const id = existing?.id ?? crypto.randomUUID();
  if (
    store.storage.sql
      .exec(
        "SELECT id FROM period_targets WHERE account_id=? AND id!=? AND starts_at<? AND ends_at>?",
        recipient.id,
        id,
        range.end,
        range.start,
      )
      .toArray().length
  )
    throw new HttpError(
      409,
      "This period overlaps another target for this person. Edit that target or choose non-overlapping dates.",
    );
  const revision = (existing?.revision ?? 0) + 1,
    now = Date.now();
  let version = 0;
  store.storage.transactionSync(() => {
    store.storage.sql.exec(
      `INSERT INTO period_targets VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET from_date=excluded.from_date,to_date=excluded.to_date,starts_at=excluded.starts_at,ends_at=excluded.ends_at,basis=excluded.basis,amount_paise=excluded.amount_paise,target_count=excluded.target_count,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      id,
      recipient.id,
      range.from,
      range.to,
      range.start,
      range.end,
      body.basis as string,
      amount,
      revision,
      actor.id,
      now,
      targetCount,
    );
    store.storage.sql.exec(
      "INSERT INTO period_target_revisions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      crypto.randomUUID(),
      id,
      recipient.id,
      range.from,
      range.to,
      body.basis as string,
      amount,
      revision,
      actor.id,
      now,
      targetCount,
    );
    store.audit(actor.id, "target_updated", recipient.id);
    version = advanceSalesVersion(store);
  });
  const teams = saleTeams(recipient, store);
  for (const team of teams.length ? teams : [{ id: "" }])
    store.onSalesChanged?.({
      employeeId: recipient.id,
      teamId: team.id,
      version,
    });
  return json({ ok: true, targetId: id, revision });
}
