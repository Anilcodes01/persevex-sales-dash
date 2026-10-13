import type { AuthStore } from "./auth-store";
export function teamDirectory(store: AuthStore) {
  const teams = store.storage.sql
    .exec<{ id: string; name: string; createdAt: number }>(
      "SELECT id, name, created_at AS createdAt FROM teams ORDER BY name_key",
    )
    .toArray();
  const members = store.storage.sql
    .exec<{
      id: string;
      displayName: string;
      email: string;
      active: number;
      teamId: string;
    }>(
      `SELECT a.id, a.display_name AS displayName, a.email, a.active, m.team_id AS teamId
    FROM team_memberships m JOIN accounts a ON a.id = m.account_id WHERE m.ends_at IS NULL AND a.role = 'employee' ORDER BY a.display_name`,
    )
    .toArray();
  const managers = store.storage.sql
    .exec<{ id: string; displayName: string; active: number; teamId: string }>(
      `SELECT a.id, a.display_name AS displayName, a.active, m.team_id AS teamId
    FROM manager_assignments m JOIN accounts a ON a.id = m.account_id WHERE m.ends_at IS NULL `,
    )
    .toArray();
  const people = store.storage.sql
    .exec<{
      id: string;
      displayName: string;
      email: string;
      role: string;
      jobRole: string;
    }>(
      `SELECT id, display_name AS displayName, email, role, job_role AS jobRole FROM accounts WHERE active = 1 ORDER BY display_name`,
    )
    .toArray();
  return {
    teams: teams.map((team) => ({
      ...team,
      members: members.filter((member) => member.teamId === team.id),
      manager: managers.find((manager) => manager.teamId === team.id) || null,
    })),
    people,
  };
}
export function employeeTeam(accountId: string, store: AuthStore) {
  return (
    store.storage.sql
      .exec<{ id: string; name: string; managerName: string | null }>(
        `SELECT t.id, t.name, a.display_name AS managerName
    FROM team_memberships m JOIN teams t ON t.id = m.team_id
    LEFT JOIN manager_assignments ma ON ma.team_id = t.id AND ma.ends_at IS NULL
    LEFT JOIN accounts a ON a.id = ma.account_id AND a.active = 1 
    WHERE m.account_id = ? AND m.ends_at IS NULL`,
        accountId,
      )
      .toArray()[0] || null
  );
}
