import type { Account } from "../types";
import type { AuthStore } from "./auth-store";
export function advanceSalesVersion(store: AuthStore) {
  store.storage.sql.exec(
    "UPDATE app_metadata SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'sales_version'",
  );
  return Number(
    store.storage.sql
      .exec<{ value: string }>(
        "SELECT value FROM app_metadata WHERE key = 'sales_version'",
      )
      .one().value,
  );
}

export function canReviewSales(actor: Account) {
  return actor.role === "admin" || actor.job_role === "team_lead";
}
export function saleTeams(actor: Account, store: AuthStore) {
  return store.storage.sql
    .exec<{ id: string; name: string }>(
      `
    SELECT DISTINCT t.id, t.name FROM teams t
    WHERE t.id IN (SELECT team_id FROM team_memberships WHERE account_id = ? AND ends_at IS NULL)
    OR (? = 1 AND t.id IN (SELECT team_id FROM manager_assignments WHERE account_id = ? AND ends_at IS NULL))
    ORDER BY t.name_key`,
      actor.id,
      actor.job_role === "team_lead" ? 1 : 0,
      actor.id,
    )
    .toArray();
}
export const SALE_FIELDS = `s.id, s.employee_id AS employeeId, a.display_name AS employeeName,
  s.team_id AS teamId, t.name AS teamName, s.student_name AS studentName, s.phone,
  s.domain, s.note, s.amount_paise AS amountPaise, s.overall_amount_paise AS overallAmountPaise,
  (s.overall_amount_paise - s.amount_paise) AS remainingAmountPaise, s.status, s.created_at AS createdAt,
  s.reviewed_at AS reviewedAt, r.display_name AS reviewerName, s.review_reason AS reviewReason`;
export const SALE_JOINS = `FROM sales s JOIN accounts a ON a.id = s.employee_id JOIN teams t ON t.id = s.team_id LEFT JOIN accounts r ON r.id = s.reviewed_by`;
export function saleReceipt(id: string, store: AuthStore) {
  return store.storage.sql
    .exec(`SELECT ${SALE_FIELDS} ${SALE_JOINS} WHERE s.id = ?`, id)
    .one();
}
