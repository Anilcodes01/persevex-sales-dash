import type { AuthStore } from "../storage/auth-store";
import { SALE_FIELDS, SALE_JOINS } from "../storage/sales-store";
import { requestedRange } from "../storage/target-periods";
import { HttpError, json } from "../http/helpers";

export function listAdminSales(store: AuthStore, url: URL) {
  const range = requestedRange(url.searchParams);
  const page = Number(url.searchParams.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    throw new HttpError(400, "Invalid page");
  const teamId = url.searchParams.get("teamId") || "";
  const employeeId = url.searchParams.get("employeeId") || "";
  const filter =
    "s.created_at >= ? AND s.created_at < ? AND (? = '' OR s.team_id = ?) AND (? = '' OR s.employee_id = ?)";
  const args = [range.start, range.end, teamId, teamId, employeeId, employeeId];
  const total = store.storage.sql
    .exec<{ total: number }>(
      `SELECT COUNT(*) AS total FROM sales s WHERE ${filter}`,
      ...args,
    )
    .one().total;
  const sales = store.storage.sql
    .exec(
      `SELECT ${SALE_FIELDS} ${SALE_JOINS} WHERE ${filter} ORDER BY s.created_at DESC, s.id LIMIT 25 OFFSET ?`,
      ...args,
      (page - 1) * 25,
    )
    .toArray();
  const totals = store.storage.sql
    .exec(
      `SELECT COALESCE(SUM(CASE WHEN s.status = 'approved' THEN s.amount_paise ELSE 0 END),0) AS approvedAmountPaise, COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approvedCount FROM sales s WHERE ${filter}`,
      ...args,
    )
    .one();
  // Include former/inactive sellers so historical sales remain filterable.
  const employees = store.storage.sql
    .exec(
      "SELECT id, display_name AS name, email FROM accounts ORDER BY display_name, email",
    )
    .toArray();
  const teams = store.storage.sql
    .exec("SELECT id, name FROM teams ORDER BY name_key")
    .toArray();
  return json({
    sales,
    total,
    page,
    pageSize: 25,
    totals,
    employees,
    teams,
    period: { from: range.from, to: range.to },
  });
}
