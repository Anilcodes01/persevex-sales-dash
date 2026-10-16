import type { Account } from "../types";
import type { AuthStore } from "./auth-store";
import type { TargetRange } from "./target-periods";
import { requestedRange } from "./target-periods";
import type { TargetBasis } from "../../shared/targets";
import { currentMonth } from "../../shared/targets";
import { HttpError } from "../http/helpers";
export const TARGET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS performance_targets (
    account_id TEXT NOT NULL REFERENCES accounts(id), month TEXT NOT NULL,
    basis TEXT NOT NULL CHECK(basis IN ('registration','overall')),
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0), revision INTEGER NOT NULL,
    updated_by TEXT NOT NULL REFERENCES accounts(id), updated_at INTEGER NOT NULL,
    PRIMARY KEY(account_id,month)
  )`,
  `CREATE TABLE IF NOT EXISTS target_revisions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, month TEXT NOT NULL,
    basis TEXT NOT NULL, amount_paise INTEGER NOT NULL, revision INTEGER NOT NULL,
    actor_id TEXT NOT NULL, recorded_at INTEGER NOT NULL, UNIQUE(account_id,month,revision)
  )`,
  `CREATE INDEX IF NOT EXISTS sales_status_date ON sales(status,created_at,employee_id)`,
  `CREATE INDEX IF NOT EXISTS sales_employee_status_date ON sales(employee_id,status,created_at)`,
];
export function reportingMonth(value: unknown = currentMonth()) {
  if (typeof value !== "string" || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value))
    throw new HttpError(
      400,
      "Select a month between January 2000 and December 2099",
    );
  const [year, month] = value.split("-").map(Number);
  return {
    month: value,
    start: Date.UTC(year, month - 1, 1) - 19800000,
    end: Date.UTC(year, month, 1) - 19800000,
  };
}
export function canManageTargets(actor: Account) {
  return actor.role === "admin" || actor.job_role === "team_lead";
}
export function targetScope(actor: Account) {
  return actor.role === "admin"
    ? {
        where:
          "a.active = 1 AND (a.role = 'employee' OR a.job_role = 'team_lead')",
        args: [] as string[],
      }
    : {
        where: `a.active = 1 AND a.role = 'employee' AND a.job_role != 'team_lead' AND a.id != ? AND a.id IN (SELECT tm.account_id FROM team_memberships tm JOIN manager_assignments ma ON ma.team_id=tm.team_id WHERE ma.account_id=? AND ma.ends_at IS NULL AND tm.ends_at IS NULL)`,
        args: [actor.id, actor.id],
      };
}
export function targetProgress(
  store: AuthStore,
  month: string | TargetRange,
  where: string,
  args: string[],
) {
  const range = typeof month === "string" ? requestedRange({ month }) : month;
  const people = store.storage.sql
    .exec<{
      id: string;
      targetId: string | null;
      fromDate: string | null;
      toDate: string | null;
      displayName: string;
      jobRole: string;
      basis: TargetBasis | null;
      targetPaise: number | null;
      targetCount: number | null;
      revision: number | null;
      registrationPaise: number;
      overallPaise: number;
      approvedCount: number;
      missingOverallCount: number;
    }>(
      `SELECT a.id, t.id AS targetId, t.from_date AS fromDate, t.to_date AS toDate, a.display_name AS displayName, a.job_role AS jobRole,
    t.basis, t.amount_paise AS targetPaise, t.target_count AS targetCount, t.revision,
    COALESCE(p.registrationPaise,0) AS registrationPaise, COALESCE(p.overallPaise,0) AS overallPaise,
    COALESCE(p.approvedCount,0) AS approvedCount, COALESCE(p.missingOverallCount,0) AS missingOverallCount
    FROM accounts a LEFT JOIN period_targets t ON t.account_id=a.id AND t.from_date=? AND t.to_date=?
    LEFT JOIN (SELECT employee_id, SUM(amount_paise) AS registrationPaise, SUM(overall_amount_paise) AS overallPaise,
      COUNT(*) AS approvedCount, SUM(CASE WHEN overall_amount_paise IS NULL THEN 1 ELSE 0 END) AS missingOverallCount
      FROM sales WHERE status='approved' AND created_at >= ? AND created_at < ?
      AND employee_id IN (SELECT a.id FROM accounts a WHERE ${where}) GROUP BY employee_id) p ON p.employee_id=a.id
    WHERE ${where} ORDER BY a.display_name,a.id`,
      range.from,
      range.to,
      range.start,
      range.end,
      ...args,
      ...args,
    )
    .toArray();
  return people.map(targetValues);
}

export function assignedTargetProgress(
  store: AuthStore,
  range: TargetRange,
  where: string,
  args: string[],
) {
  const rows = store.storage.sql
    .exec<{
      id: string;
      targetId: string;
      displayName: string;
      jobRole: string;
      fromDate: string;
      toDate: string;
      basis: TargetBasis;
      targetPaise: number | null;
      targetCount: number | null;
      revision: number;
      registrationPaise: number;
      overallPaise: number;
      approvedCount: number;
      missingOverallCount: number;
    }>(
      `SELECT a.id, t.id AS targetId, a.display_name AS displayName, a.job_role AS jobRole,
    t.from_date AS fromDate, t.to_date AS toDate, t.basis, t.amount_paise AS targetPaise, t.target_count AS targetCount,t.revision,
    COALESCE(SUM(s.amount_paise),0) AS registrationPaise,COALESCE(SUM(s.overall_amount_paise),0) AS overallPaise,
    COUNT(s.id) AS approvedCount,SUM(CASE WHEN s.id IS NOT NULL AND s.overall_amount_paise IS NULL THEN 1 ELSE 0 END) AS missingOverallCount
    FROM period_targets t JOIN accounts a ON a.id=t.account_id
    LEFT JOIN sales s ON s.employee_id=a.id AND s.status='approved' AND s.created_at>=t.starts_at AND s.created_at<t.ends_at
    WHERE t.starts_at < ? AND t.ends_at > ? AND ${where}
    GROUP BY t.id ORDER BY a.display_name,t.starts_at,t.id`,
      range.end,
      range.start,
      ...args,
    )
    .toArray();
  return rows.map(targetValues);
}

function targetValues<
  T extends {
    basis: TargetBasis | null;
    targetPaise: number | null;
    targetCount: number | null;
    registrationPaise: number;
    overallPaise: number;
    approvedCount: number;
  },
>(person: T) {
  const achievedPaise =
    person.basis === "overall" ? person.overallPaise : person.registrationPaise;
  const count = person.basis === "sales_count";
  const targetValue = count ? person.targetCount : person.targetPaise;
  const achievedValue = count ? person.approvedCount : achievedPaise;
  const remainingValue =
    targetValue === null ? null : Math.max(0, targetValue - achievedValue);
  return {
    ...person,
    achievedPaise,
    targetValue,
    achievedValue,
    remainingValue,
    achievement: targetValue ? (achievedValue / targetValue) * 100 : null,
    remainingPaise: count ? null : remainingValue,
  };
}
