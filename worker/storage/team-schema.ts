export const TEAM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_memberships (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    team_id TEXT NOT NULL REFERENCES teams(id), starts_at INTEGER NOT NULL, ends_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS deleted_teams (
    team_id TEXT PRIMARY KEY REFERENCES teams(id), deleted_at INTEGER NOT NULL,
    deleted_by TEXT NOT NULL REFERENCES accounts(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_current_employee_team ON team_memberships(account_id) WHERE ends_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS memberships_team ON team_memberships(team_id, ends_at)`,
  `CREATE TABLE IF NOT EXISTS manager_assignments (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    team_id TEXT NOT NULL REFERENCES teams(id), starts_at INTEGER NOT NULL, ends_at INTEGER
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_current_team_manager ON manager_assignments(team_id) WHERE ends_at IS NULL`,
];
