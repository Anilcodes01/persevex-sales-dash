import type { Account } from "../types";
import type { AuthStore } from "../storage/auth-store";
import { HttpError, json } from "../http/helpers";
import { requestedRange } from "../storage/target-periods";
import { advanceSalesVersion } from "../storage/sales-store";

export function resetEmployeeSales(body: Record<string, unknown>, actor: Account, store: AuthStore) {
  if (actor.role !== "admin") throw new HttpError(403, "Administrator access required");
  if (typeof body.accountId !== "string") throw new HttpError(400, "Select an employee");
  const recipient = store.storage.sql.exec("SELECT id FROM accounts WHERE id=?", body.accountId).toArray()[0];
  if (!recipient) throw new HttpError(404, "Account not found");
  if (typeof body.from !== "string" || typeof body.to !== "string")
    throw new HttpError(400, "Choose the reset start and end dates");
  const range = requestedRange(body);
  const sales = store.storage.sql.exec<{ id: string; teamId: string }>(
    "SELECT id, team_id AS teamId FROM sales WHERE employee_id=? AND created_at>=? AND created_at<? AND status!='rejected'",
    body.accountId, range.start, range.end,
  ).toArray();
  if (!sales.length) return json({ ok: true, resetCount: 0 });
  let version = 0;
  store.storage.transactionSync(() => {
    for (const sale of sales) {
      store.storage.sql.exec("UPDATE sales SET status='rejected', reviewed_by=?, reviewed_at=?, review_reason=? WHERE id=?",
        actor.id, Date.now(), `Administrator sales reset (${range.from} to ${range.to})`, sale.id);
      store.audit(actor.id, "sale_reset", sale.id);
    }
    version = advanceSalesVersion(store);
  });
  for (const teamId of new Set(sales.map(sale => sale.teamId))) {
    store.onSalesChanged?.({ employeeId: body.accountId, teamId, version });
  }
  return json({ ok: true, resetCount: sales.length });
}
