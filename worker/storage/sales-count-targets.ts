// Runs inside the organisation's startup transaction. Monetary values and audit
// history are copied unchanged; count targets use a separate integer column.
export function migrateSalesCountTargets(storage: DurableObjectStorage) {
  const version = storage.sql
    .exec<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key='schema_version'",
    )
    .one().value;
  if (version !== "7") return;
  if (
    storage.sql
      .exec<{ name: string }>("PRAGMA table_info(period_targets)")
      .toArray()
      .some((column) => column.name === "target_count")
  ) {
    storage.sql.exec(
      "UPDATE app_metadata SET value='8' WHERE key='schema_version'",
    );
    return;
  }
  storage.sql.exec(`CREATE TABLE period_targets_v8 (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
    basis TEXT NOT NULL CHECK(basis IN ('registration','overall','sales_count')),
    amount_paise INTEGER, revision INTEGER NOT NULL, updated_by TEXT NOT NULL REFERENCES accounts(id), updated_at INTEGER NOT NULL,
    target_count INTEGER,
    CHECK(ends_at>starts_at),
    CHECK((basis='sales_count' AND amount_paise IS NULL AND target_count IS NOT NULL AND target_count>0 AND typeof(target_count)='integer') OR
      (basis IN ('registration','overall') AND amount_paise IS NOT NULL AND amount_paise>0 AND target_count IS NULL AND typeof(amount_paise)='integer'))
  )`);
  storage.sql.exec(
    "INSERT INTO period_targets_v8 SELECT *,NULL FROM period_targets",
  );
  storage.sql.exec(`CREATE TABLE period_target_revisions_v8 (
    id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES period_targets_v8(id), account_id TEXT NOT NULL,
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, basis TEXT NOT NULL, amount_paise INTEGER,
    revision INTEGER NOT NULL, actor_id TEXT NOT NULL, recorded_at INTEGER NOT NULL, target_count INTEGER,
    UNIQUE(target_id,revision)
  )`);
  storage.sql.exec(
    "INSERT INTO period_target_revisions_v8 SELECT *,NULL FROM period_target_revisions",
  );
  storage.sql.exec("DROP TABLE period_target_revisions");
  storage.sql.exec("DROP TABLE period_targets");
  storage.sql.exec("ALTER TABLE period_targets_v8 RENAME TO period_targets");
  storage.sql.exec(
    "ALTER TABLE period_target_revisions_v8 RENAME TO period_target_revisions",
  );
  storage.sql.exec(
    "CREATE INDEX period_targets_account_dates ON period_targets(account_id,starts_at,ends_at)",
  );
  storage.sql.exec(
    "UPDATE app_metadata SET value='8' WHERE key='schema_version'",
  );
}
