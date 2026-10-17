import type { ReactNode } from "react";
import { money } from "../sales/types";
export type PaymentRow = {
  paymentId: string;
  verified: number;
  name: string;
  email: string;
  phone: string;
  amountPaise: number;
  paidAt: number;
};
export function CashfreePayments({
  payments,
  environment,
  configured,
  loading,
  controls,
}: {
  payments: PaymentRow[];
  environment: "sandbox" | "production" | null;
  configured: boolean;
  loading: boolean;
  controls?: ReactNode;
}) {
  return (
    <section className="tv-payments">
      <div className="tv-section-title">
        <h2>Payments (Cashfree)</h2>
        <div className="tv-payment-controls">
        <span className="tv-demo-badge">
          {!configured
            ? "Not configured"
            : environment === "sandbox"
              ? "Sandbox · Test payments"
              : "Live payments"}
        </span>
        {controls}
        </div>
      </div>
      <div className="tv-payment-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Time",
                "Name",
                "Email",
                "Phone",
                "Amount",
                "Payment ID",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.paymentId}>
                <td>
                  <span>
                    {new Date(payment.paidAt).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span>
                    {new Date(payment.paidAt).toLocaleTimeString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </td>
                <td title={payment.name}>{payment.name || "Not provided"}</td>
                <td>{payment.email || "—"}</td>
                <td>{payment.phone || "—"}</td>
                <td
                  className="tv-payment-amount"
                  title={money(payment.amountPaise)}
                >
                  {money(payment.amountPaise)}
                </td>
                <td title={payment.paymentId}>{payment.paymentId}</td>
              </tr>
            ))}
            {!payments.length && (
              <tr>
                <td colSpan={6}>
                  {loading
                    ? "Loading payments…"
                    : !configured
                      ? "Configure the Cashfree receiver to start receiving payments."
                      : "No payment notifications received this month."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="tv-panel-status">
        Latest 10 payment notifications this month · Times in IST · Contact
        details masked{payments.some(payment => !payment.verified) ? " · Includes unverified notifications" : ""}
      </div>
    </section>
  );
}
