import { currentMonth, monthDates } from "../../shared/targets";
import { HttpError } from "../http/helpers";
export type TargetRange = {
  from: string;
  to: string;
  start: number;
  end: number;
};
function dateMillis(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)
  )
    throw new HttpError(400, "Select valid dates between 2000 and 2099");
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    throw new HttpError(400, "Select a valid calendar date");
  return time;
}
export function targetRange(from: unknown, to: unknown): TargetRange {
  const start = dateMillis(from),
    finish = dateMillis(to);
  if (finish < start)
    throw new HttpError(400, "End date must be on or after the start date");
  return {
    from: from as string,
    to: to as string,
    start: start - 19800000,
    end: finish + 86400000 - 19800000,
  };
}
export function requestedRange(
  source: { get: (key: string) => string | null } | Record<string, unknown>,
): TargetRange {
  const get =
    typeof source.get === "function"
      ? (key: string) => (source.get as (key: string) => string | null)(key)
      : (key: string) => (source as Record<string, unknown>)[key];
  const from = get("from"),
    to = get("to");
  if (
    (from !== undefined && from !== null) ||
    (to !== undefined && to !== null)
  )
    return targetRange(from, to);
  const month = get("month") ?? currentMonth();
  if (typeof month !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
    throw new HttpError(400, "Select a valid reporting month");
  const dates = monthDates(month);
  return targetRange(dates.from, dates.to);
}
export const PERIOD_TARGET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS period_targets (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
    basis TEXT NOT NULL CHECK(basis IN ('registration','overall')), amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    revision INTEGER NOT NULL, updated_by TEXT NOT NULL REFERENCES accounts(id), updated_at INTEGER NOT NULL,
    CHECK(ends_at > starts_at)
  )`,
  `CREATE INDEX IF NOT EXISTS period_targets_account_dates ON period_targets(account_id,starts_at,ends_at)`,
  `CREATE TABLE IF NOT EXISTS period_target_revisions (
    id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES period_targets(id), account_id TEXT NOT NULL,
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, basis TEXT NOT NULL, amount_paise INTEGER NOT NULL,
    revision INTEGER NOT NULL, actor_id TEXT NOT NULL, recorded_at INTEGER NOT NULL,
    UNIQUE(target_id,revision)
  )`,
];
export function migrateMonthlyTargets(storage: DurableObjectStorage) {
  for (const statement of PERIOD_TARGET_SCHEMA) storage.sql.exec(statement);
  const version = storage.sql
    .exec<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key='schema_version'",
    )
    .one().value;
  if (version !== "6") return;
  const existing = storage.sql
    .exec<{
      account_id: string;
      month: string;
      basis: string;
      amount_paise: number;
      revision: number;
      updated_by: string;
      updated_at: number;
    }>("SELECT * FROM performance_targets")
    .toArray();
  for (const row of existing) {
    const range = requestedRange({ month: row.month });
    const id = `legacy:${row.account_id}:${row.month}`;
    storage.sql.exec(
      "INSERT INTO period_targets VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      id,
      row.account_id,
      range.from,
      range.to,
      range.start,
      range.end,
      row.basis,
      row.amount_paise,
      row.revision,
      row.updated_by,
      row.updated_at,
    );
  }
  const revisions = storage.sql
    .exec<{
      id: string;
      account_id: string;
      month: string;
      basis: string;
      amount_paise: number;
      revision: number;
      actor_id: string;
      recorded_at: number;
    }>("SELECT * FROM target_revisions")
    .toArray();
  for (const row of revisions) {
    const range = requestedRange({ month: row.month });
    storage.sql.exec(
      "INSERT INTO period_target_revisions VALUES (?,?,?,?,?,?,?,?,?,?)",
      row.id,
      `legacy:${row.account_id}:${row.month}`,
      row.account_id,
      range.from,
      range.to,
      row.basis,
      row.amount_paise,
      row.revision,
      row.actor_id,
      row.recorded_at,
    );
  }
  storage.sql.exec(
    "UPDATE app_metadata SET value='7' WHERE key='schema_version'",
  );
}
