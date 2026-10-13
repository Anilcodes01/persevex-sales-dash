export const SALES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, employee_id TEXT NOT NULL REFERENCES accounts(id),
    team_id TEXT NOT NULL REFERENCES teams(id), student_name TEXT NOT NULL, phone TEXT NOT NULL,
    domain TEXT NOT NULL, note TEXT NOT NULL, amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
    fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, reviewed_by TEXT REFERENCES accounts(id),
    reviewed_at INTEGER, review_reason TEXT,
    UNIQUE(employee_id, submission_id)
  )`,
  `CREATE INDEX IF NOT EXISTS sales_employee_date ON sales(employee_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS sales_team_status ON sales(team_id, status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS collection_events (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL UNIQUE REFERENCES sales(id),
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0), effective_at INTEGER NOT NULL
  )`,
];
