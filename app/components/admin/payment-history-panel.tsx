"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError } from "../../lib/api";
import { monthDates } from "../../../shared/targets";
import { DatePicker } from "../forms/date-picker";
import { ListPagination } from "../layout/list-pagination";
import { useSalesLive } from "../../hooks/use-sales-live";
import { money } from "../sales/types";

type Payment = { paymentId: string; name: string; email: string; phone: string; amountPaise: number; paidAt: number };
type History = { payments: Payment[]; total: number; amountPaise: number; unverified: number; pageSize: number; environment: string | null };
const noop=() => {};
export function PaymentHistoryPanel({ accountId, onSessionExpired }: { accountId: string; onSessionExpired: () => void }) {
  const [range,setRange]=useState(monthDates);
  const [page,setPage]=useState(1);
  const [data,setData]=useState<History | null>(null);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const serial=useRef(0);
  const load=useCallback(async () => {
    const request=++serial.current; setLoading(true);
    try {
      const result=await api<History>(`/api/admin/payments?${new URLSearchParams({...range,page:String(page)})}`);
      if(request!==serial.current) return false;
      if(page>1 && result.total<=(page-1)*result.pageSize) { setPage(Math.max(1,Math.ceil(result.total/result.pageSize))); return true; }
      setData(result); setFailed(false); return true;
    } catch(error) {
      if(request!==serial.current) return false;
      setData(null); setFailed(true);
      if(error instanceof ApiError && error.status===401) onSessionExpired();
      toast.error(error instanceof Error ? error.message : "Could not load payments"); return false;
    } finally { if(request===serial.current) setLoading(false); }
  },[range,page,onSessionExpired]);
  useEffect(() => { const requests=serial; const timer=setTimeout(() => { void load(); },0); return () => { clearTimeout(timer); ++requests.current; }; },[load]);
  useSalesLive({accountId,refresh:load,onAccessChanged:load,onConnected:noop,onSessionExpired});
  function change(field: "from" | "to", value: string) { setData(null); setPage(1); setRange(previous => ({...previous,[field]:value})); }
  return <div className="sales-workspace">
    <section className="roster-panel admin-sales-filters" aria-label="Payment history filters">
      <Label>From<DatePicker value={range.from} max={range.to} onChange={event => change("from",event.target.value)} /></Label>
      <Label>To<DatePicker value={range.to} min={range.from} onChange={event => change("to",event.target.value)} /></Label>
      <Button variant="outline" onClick={() => { setData(null); setPage(1); setRange(monthDates()); }}>Current month</Button>
    </section>
    <section className="roster-panel" aria-label="Payment history">
      <div className="panel-title"><div><h2>Cashfree payments</h2><p>{data?.total ?? 0} payments · Total {money(data?.amountPaise ?? 0)}{data?.environment ? ` · ${data.environment}` : ""}</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}>{loading ? "Loading…" : "Refresh"}</Button></div>
      {!!data?.unverified && <p className="payment-history-note">Includes unverified payment notifications.</p>}
      {data && !data.environment && <p className="payment-history-note">Configure CASHFREE_ENV to view payments.</p>}
      <div className="table-scroll" aria-busy={loading}><Table><TableHeader><TableRow>{["Time","Name","Email","Phone","Amount","Payment ID"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data?.payments.map(payment => <TableRow key={payment.paymentId}>
          <TableCell>{new Date(payment.paidAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</TableCell><TableCell>{payment.name || "—"}</TableCell><TableCell>{payment.email || "—"}</TableCell><TableCell>{payment.phone || "—"}</TableCell><TableCell className="whitespace-nowrap">{money(payment.amountPaise)}</TableCell><TableCell>{payment.paymentId}</TableCell>
        </TableRow>)}</TableBody></Table></div>
      {!loading && !failed && !data?.payments.length && <p className="sales-panel">No payments received for these dates.</p>}
      <ListPagination total={data?.total ?? 0} page={page} pageSize={25} loading={loading} onPage={setPage} noun="payments" />
    </section>
  </div>;
}
