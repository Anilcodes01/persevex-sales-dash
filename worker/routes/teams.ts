import type { Account } from "../types";
import type { AuthStore } from "../storage/auth-store";
import { teamDirectory } from "../storage/teams-store";
import { HttpError, json } from "../http/helpers";

export function listTeams(store: AuthStore) {
  return json(teamDirectory(store));
}
export function saveTeam(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80 || typeof body.managerId !== "string")
    throw new HttpError(
      400,
      "Provide a team name (1–80 characters) and team lead selection",
    );
  const teamId =
    typeof body.teamId === "string" && body.teamId
      ? body.teamId
      : crypto.randomUUID();
  const existing =
    store.storage.sql
      .exec("SELECT id FROM teams WHERE id = ?", teamId)
      .toArray().length > 0;
  if (body.teamId && !existing) throw new HttpError(404, "Team not found");
  const key = name.toLowerCase();
  if (
    store.storage.sql
      .exec("SELECT id FROM teams WHERE name_key = ? AND id != ?", key, teamId)
      .toArray().length
  )
    throw new HttpError(409, "A team with that name already exists");
  if (
    body.managerId &&
    !store.storage.sql
      .exec(
        "SELECT id FROM accounts WHERE id = ? AND active = 1 AND job_role = 'team_lead'",
        body.managerId,
      )
      .toArray().length
  )
    throw new HttpError(400, "Select an active Team Lead account");
  store.storage.transactionSync(() => {
    const now = Date.now();
    if (existing)
      store.storage.sql.exec(
        "UPDATE teams SET name = ?, name_key = ? WHERE id = ?",
        name,
        key,
        teamId,
      );
    else
      store.storage.sql.exec(
        "INSERT INTO teams VALUES (?, ?, ?, ?)",
        teamId,
        name,
        key,
        now,
      );
    const current = store.storage.sql
      .exec<{ account_id: string }>(
        "SELECT account_id FROM manager_assignments WHERE team_id = ? AND ends_at IS NULL",
        teamId,
      )
      .toArray()[0];
    if ((current?.account_id || "") !== body.managerId) {
      store.storage.sql.exec(
        "UPDATE manager_assignments SET ends_at = ? WHERE team_id = ? AND ends_at IS NULL",
        now,
        teamId,
      );
      if (body.managerId)
        store.storage.sql.exec(
          "INSERT INTO manager_assignments VALUES (?, ?, ?, ?, NULL)",
          crypto.randomUUID(),
          body.managerId as string,
          teamId,
          now,
        );
    }
    store.audit(actor.id, existing ? "team_updated" : "team_created", teamId);
  });
  return json({ ok: true, teamId }, existing ? 200 : 201);
}
export function assignEmployee(
  body: Record<string, unknown>,
  actor: Account,
  store: AuthStore,
) {
  if (typeof body.accountId !== "string" || typeof body.teamId !== "string")
    throw new HttpError(400, "Select an employee and team");
  if (
    !store.storage.sql
      .exec(
        "SELECT id FROM accounts WHERE id = ? AND role = 'employee'",
        body.accountId,
      )
      .toArray().length
  )
    throw new HttpError(400, "Select an employee account");
  if (body.teamId) {
    if (
      !store.storage.sql
        .exec("SELECT id FROM teams WHERE id = ?", body.teamId)
        .toArray().length
    )
      throw new HttpError(404, "Team not found");
    if (
      !store.storage.sql
        .exec(
          "SELECT id FROM accounts WHERE id = ? AND active = 1",
          body.accountId,
        )
        .toArray().length
    )
      throw new HttpError(
        400,
        "Reactivate the employee before assigning a team",
      );
  }
  const current = store.storage.sql
    .exec<{ team_id: string }>(
      "SELECT team_id FROM team_memberships WHERE account_id = ? AND ends_at IS NULL",
      body.accountId,
    )
    .toArray()[0];
  if ((current?.team_id || "") === body.teamId) return json({ ok: true });
  store.storage.transactionSync(() => {
    const now = Date.now();
    store.storage.sql.exec(
      "UPDATE team_memberships SET ends_at = ? WHERE account_id = ? AND ends_at IS NULL",
      now,
      body.accountId as string,
    );
    if (body.teamId)
      store.storage.sql.exec(
        "INSERT INTO team_memberships VALUES (?, ?, ?, ?, NULL)",
        crypto.randomUUID(),
        body.accountId as string,
        body.teamId as string,
        now,
      );
    store.audit(
      actor.id,
      body.teamId ? "employee_team_assigned" : "employee_team_removed",
      body.accountId as string,
    );
  });
  return json({ ok: true });
}
