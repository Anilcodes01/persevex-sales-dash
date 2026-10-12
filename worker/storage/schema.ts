export const AUTH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('employee','manager','admin')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS auth_rate_expiry ON auth_rate_limits(expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_audit (
    id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL,
    subject_id TEXT, recorded_at INTEGER NOT NULL
  )`,
];
