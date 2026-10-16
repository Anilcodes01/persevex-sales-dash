import type { AuthStore } from "../storage/auth-store";
import { requestedRange } from "../storage/target-periods";
import { json } from "../http/helpers";

export function adminOverview(store: AuthStore, url: URL) {
  const range = requestedRange(url.searchParams);
  const sales = store.storage.sql
    .exec(
      `SELECT COUNT(*) AS total,
    COUNT(CASE WHEN status='approved' THEN 1 END) AS approved,
    COUNT(CASE WHEN status='pending' THEN 1 END) AS pending,
    COUNT(CASE WHEN status='rejected' THEN 1 END) AS rejected,
    COALESCE(SUM(CASE WHEN status='approved' THEN amount_paise ELSE 0 END),0) AS registrationPaise,
    COALESCE(SUM(CASE WHEN status='approved' THEN overall_amount_paise ELSE 0 END),0) AS overallPaise,
    COALESCE(SUM(CASE WHEN status='approved' THEN overall_amount_paise-amount_paise ELSE 0 END),0) AS remainingPaise,
    COUNT(CASE WHEN status='approved' AND overall_amount_paise IS NULL THEN 1 END) AS missingOverall,
    COUNT(DISTINCT employee_id) AS sellers
    FROM sales WHERE created_at>=? AND created_at<?`,
      range.start,
      range.end,
    )
    .one();
  const workspace = store.storage.sql
    .exec(
      `SELECT
    (SELECT COUNT(*) FROM teams WHERE id NOT IN (SELECT team_id FROM deleted_teams)) AS teams,
    COUNT(*) AS accounts,
    COUNT(CASE WHEN active=1 THEN 1 END) AS activeAccounts,
    COUNT(CASE WHEN active=1 AND job_role='team_lead' THEN 1 END) AS teamLeads
    FROM accounts`,
    )
    .one();
  return json({ period: { from: range.from, to: range.to }, sales, workspace });
}
