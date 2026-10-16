import type { AuthStore } from "../storage/auth-store";
import type { Env } from "../types";
import { requestedRange } from "../storage/target-periods";
import { HttpError, json } from "../http/helpers";

export function paymentHistory(store: AuthStore, env: Env, url: URL) {
  const range = requestedRange(url.searchParams);
  const page = Number(url.searchParams.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new HttpError(400, "Invalid page");
  const environment = env.CASHFREE_ENV ?? "";
  const args = [environment, range.start, range.end];
  const totals = store.storage.sql.exec<{ total: number; amountPaise: number; unverified: number }>(
    "SELECT COUNT(*) AS total, COALESCE(SUM(amount_paise),0) AS amountPaise, COALESCE(SUM(verified=0),0) AS unverified FROM cashfree_payments WHERE environment=? AND paid_at>=? AND paid_at<?", ...args,
  ).one();
  const payments = store.storage.sql.exec(
    "SELECT payment_id AS paymentId, payer_name AS name, payer_email AS email, payer_phone AS phone, amount_paise AS amountPaise, paid_at AS paidAt FROM cashfree_payments WHERE environment=? AND paid_at>=? AND paid_at<? ORDER BY paid_at DESC,payment_id LIMIT 25 OFFSET ?",
    ...args, (page-1)*25,
  ).toArray();
  return json({ payments, ...totals, page, pageSize: 25, environment: environment || null });
}
