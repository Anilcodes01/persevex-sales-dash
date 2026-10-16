import { AuthStore } from "./auth-store";
import type { Account } from "../types";
import { isJobRole } from "../../shared/roles";

export function queryAccounts(url: URL, store: AuthStore) {
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const status = url.searchParams.get("status") || "all";
  const role = url.searchParams.get("role") || "all";
  const jobRole = url.searchParams.get("jobRole") || "all";
  const teamId = url.searchParams.get("teamId") || "";
  const requestedPage = Number(url.searchParams.get("page") || 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1;
  const pageSize = 25;
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (query) {
    where.push(
      "(instr(lower(display_name), lower(?)) > 0 OR instr(email, lower(?)) > 0)",
    );
    args.push(query, query);
  }
  if (status === "active" || status === "inactive") {
    where.push("active = ?");
    args.push(status === "active" ? 1 : 0);
  }
  if (["employee", "manager", "admin"].includes(role)) {
    where.push("role = ?");
    args.push(role);
  }
  if (isJobRole(jobRole)) {
    where.push("job_role = ?");
    args.push(jobRole);
  }
  if (teamId) {
    where.push(`EXISTS (
      SELECT 1 FROM (
        SELECT account_id, team_id FROM team_memberships WHERE ends_at IS NULL
        UNION SELECT account_id, team_id FROM manager_assignments WHERE ends_at IS NULL
      ) assignment JOIN teams t ON t.id = assignment.team_id
      WHERE assignment.account_id = accounts.id AND t.id = ?
        AND t.id NOT IN (SELECT team_id FROM deleted_teams)
    )`);
    args.push(teamId);
  }
  const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const total = store.storage.sql
    .exec<{ count: number }>(
      `SELECT COUNT(*) AS count FROM accounts${filter}`,
      ...args,
    )
    .one().count;
  const accounts = store.storage.sql
    .exec<Omit<Account, "password_hash"> & { created_at: number }>(
      `SELECT id, email, display_name, role, job_role, active, must_change_password, created_at FROM accounts${filter}
     ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`,
      ...args,
      pageSize,
      (page - 1) * pageSize,
    )
    .toArray();
  const stats = store.storage.sql
    .exec<{
      total: number;
      active: number;
      employees: number;
      managers: number;
    }>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(active), 0) AS active,
      COALESCE(SUM(role = 'employee'), 0) AS employees, COALESCE(SUM(role = 'manager'), 0) AS managers FROM accounts`,
    )
    .one();
  const teams = store.storage.sql
    .exec<{ id: string; name: string }>(
      "SELECT id, name FROM teams WHERE id NOT IN (SELECT team_id FROM deleted_teams) ORDER BY name_key",
    ).toArray();
  const assignments = store.storage.sql.exec<{ accountId: string; id: string; name: string }>(`
    SELECT assignment.account_id AS accountId, t.id, t.name FROM (
      SELECT account_id, team_id FROM team_memberships WHERE ends_at IS NULL
      UNION SELECT account_id, team_id FROM manager_assignments WHERE ends_at IS NULL
    ) assignment JOIN teams t ON t.id = assignment.team_id
    WHERE t.id NOT IN (SELECT team_id FROM deleted_teams)
    ORDER BY t.name_key
  `).toArray();
  return {
    accounts: accounts.map((account) => ({ ...account, teams: assignments
      .filter((assignment) => assignment.accountId === account.id)
      .map(({ id, name }) => ({ id, name })) })),
    teams, total, page, pageSize, stats,
  };
}
