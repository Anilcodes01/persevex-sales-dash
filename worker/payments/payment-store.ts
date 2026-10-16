import type { AuthStore } from "../storage/auth-store";
import type { CashfreePayment } from "./cashfree-webhook";
import { advanceSalesVersion } from "../storage/sales-store";
import { digest } from "../security/credentials";
import { HttpError } from "../http/helpers";

export const PAYMENT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cashfree_payments (
    environment TEXT NOT NULL CHECK(environment IN ('sandbox','production')),
    payment_id TEXT NOT NULL, order_id TEXT NOT NULL, amount_paise INTEGER NOT NULL CHECK(amount_paise>0),
    currency TEXT NOT NULL CHECK(currency='INR'), paid_at INTEGER NOT NULL,
    payer_name TEXT NOT NULL, payer_email TEXT NOT NULL, payer_phone TEXT NOT NULL,
    fingerprint TEXT NOT NULL, received_at INTEGER NOT NULL,
    PRIMARY KEY(environment,payment_id)
  )`,
  "CREATE INDEX IF NOT EXISTS cashfree_payments_date ON cashfree_payments(environment,paid_at DESC,payment_id)",
];
export async function recordPayment(
  payment: CashfreePayment,
  store: AuthStore,
) {
  // Fingerprint only immutable payment facts: customer metadata on a retried
  // event never overwrites the initially recorded payer details.
  const fingerprint = await digest(
    JSON.stringify([
      payment.orderId,
      payment.amountPaise,
      payment.currency,
      payment.paidAt,
    ]),
  );
  return store.storage.transactionSync(() => {
    const existing = store.storage.sql
      .exec<{ fingerprint: string; verified: number }>(
        "SELECT fingerprint,verified FROM cashfree_payments WHERE environment=? AND payment_id=?",
        payment.environment,
        payment.paymentId,
      )
      .toArray()[0];
    if (existing && !existing.verified && payment.verified) {
      store.storage.sql.exec(
        "UPDATE cashfree_payments SET order_id=?,amount_paise=?,currency=?,paid_at=?,payer_name=?,payer_email=?,payer_phone=?,fingerprint=?,received_at=?,verified=1 WHERE environment=? AND payment_id=?",
        payment.orderId,
        payment.amountPaise,
        payment.currency,
        payment.paidAt,
        payment.name,
        payment.email,
        payment.phone,
        fingerprint,
        Date.now(),
        payment.environment,
        payment.paymentId,
      );
      return { duplicate: false, version: advanceSalesVersion(store) };
    }
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new HttpError(
          409,
          "Payment facts conflict with the stored payment",
        );
      return { duplicate: true, version: 0 };
    }
    store.storage.sql.exec(
      "INSERT INTO cashfree_payments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      payment.environment,
      payment.paymentId,
      payment.orderId,
      payment.amountPaise,
      payment.currency,
      payment.paidAt,
      payment.name,
      payment.email,
      payment.phone,
      fingerprint,
      Date.now(),
      payment.verified ? 1 : 0,
    );
    return { duplicate: false, version: advanceSalesVersion(store) };
  });
}
export function recentPayments(
  store: AuthStore,
  environment: string | undefined,
  start: number,
  end: number,
) {
  const rows = store.storage.sql
    .exec<{
      paymentId: string;
      verified: number;
      name: string;
      email: string;
      phone: string;
      amountPaise: number;
      paidAt: number;
    }>(
      `SELECT verified,payment_id AS paymentId,payer_name AS name,payer_email AS email,payer_phone AS phone,amount_paise AS amountPaise,paid_at AS paidAt FROM cashfree_payments WHERE environment=? AND paid_at>=? AND paid_at<? ORDER BY paid_at DESC,payment_id LIMIT 10`,
      environment ?? "",
      start,
      end,
    )
    .toArray();
  return rows.map((row) => ({
    ...row,
    email: row.email.includes("@")
      ? `${row.email.slice(0, 1)}•••@${row.email.split("@").pop()}`
      : row.email
        ? "•••"
        : "",
    phone: row.phone ? `••••${row.phone.slice(-4)}` : "",
  }));
}
