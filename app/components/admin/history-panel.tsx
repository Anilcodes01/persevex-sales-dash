"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Account } from "../../lib/api";
import { PageHeading } from "../layout/page-heading";
import { AdminSalesPanel } from "./admin-sales-panel";
import { PaymentHistoryPanel } from "./payment-history-panel";
export function HistoryPanel({ account, onSessionExpired }: { account: Account; onSessionExpired: () => void }) {
  const [tab,setTab]=useState<"sales" | "payments">("sales");
  return <>
    <PageHeading title="History" description="Browse employee sales and Cashfree payment records." />
    <div className="history-tabs" role="group" aria-label="History type">
      <Button variant={tab==="sales" ? "default" : "outline"} aria-pressed={tab==="sales"} onClick={() => setTab("sales")}>Employee sales</Button>
      <Button variant={tab==="payments" ? "default" : "outline"} aria-pressed={tab==="payments"} onClick={() => setTab("payments")}>Payments</Button>
    </div>
    <div className="history-content">
    {tab==="sales" ? <AdminSalesPanel account={account} title="Employee sales" showHeading={false} onSessionExpired={onSessionExpired} /> : <PaymentHistoryPanel accountId={account.id} onSessionExpired={onSessionExpired} />}
    </div>
  </>;
}
