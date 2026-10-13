"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ListPagination } from "../layout/list-pagination";
import { WorkspaceDialog } from "../layout/workspace-dialog";
import { api } from "../../lib/api";
import { money, type Sale, type SalesPage } from "./types";
export function SalesList({
  data,
  review,
  loading,
  page,
  onPage,
  onRefresh,
  allSales = false,
}: {
  data: SalesPage | null;
  review: boolean;
  loading: boolean;
  page: number;
  onPage: (page: number) => void;
  onRefresh: () => void;
  allSales?: boolean;
}) {
  const [selection, setSelection] = useState<{
    sale: Sale;
    status: "approved" | "rejected";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide() {
    if (!selection) return;
    setBusy(true);
    try {
      await api("/api/manager/sales/review", {
        saleId: selection.sale.id,
        status: selection.status,
        reason,
      });
      toast.success(`Sale ${selection.status}.`);
      setSelection(null);
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="roster-panel sales-history">
      <div className="panel-title">
        <div>
          <h2>
            {review ? "Pending approvals" : allSales ? "All sales" : "My sales"}
          </h2>
          <p>
            {review
              ? "Review sales from your assigned teams. Administrators can review all teams."
              : "Only approved sales count toward your totals."}
          </p>
        </div>
        <div className="sales-list-actions">
          {allSales && (
            <span className="sales-list-count" aria-live="polite">
              {data
                ? `${data.total} ${data.total === 1 ? "sale" : "sales"}`
                : "— sales"}
            </span>
          )}
          <Button variant="outline" disabled={loading} onClick={onRefresh}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>
      {!review && data && (
        <div className="sales-summary">
          <span>
            Approved registration amount:{" "}
            <strong>{money(data.totals.approvedAmountPaise)}</strong>
          </span>
          <span>
            Approved sales: <strong>{data.totals.approvedCount}</strong>
          </span>
          <small>
            {allSales
              ? "Selected period and filters · All approval statuses shown"
              : "All time · reporting-period rankings come next"}
          </small>
        </div>
      )}
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Sale details</TableHead>
              <TableHead>Amounts</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{review ? "Review" : "Receipt"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell>
                  <strong>{sale.studentName}</strong>
                  <p>{sale.phone}</p>
                  <p>{sale.domain}</p>
                </TableCell>
                <TableCell>
                  <strong>
                    {sale.employeeName} · {sale.teamName}
                  </strong>
                  <p>
                    {new Date(sale.createdAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </p>
                  {sale.note && <p>{sale.note}</p>}
                </TableCell>
                <TableCell>
                  <p>Registration: {money(sale.amountPaise)}</p>
                  <p>
                    Overall:{" "}
                    {sale.overallAmountPaise === null
                      ? "Not recorded"
                      : money(sale.overallAmountPaise)}
                  </p>
                  <p>
                    Remaining:{" "}
                    {sale.remainingAmountPaise === null
                      ? "Not recorded"
                      : money(sale.remainingAmountPaise)}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{sale.status}</Badge>
                  {sale.reviewerName && <p>Reviewed by {sale.reviewerName}</p>}
                  {sale.reviewReason && <p>{sale.reviewReason}</p>}
                </TableCell>
                <TableCell>
                  {review ? (
                    <div className="sales-buttons">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReason("");
                          setSelection({ sale, status: "approved" });
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReason("");
                          setSelection({ sale, status: "rejected" });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <small className="sale-id">{sale.id}</small>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!loading && data && !data.sales.length && (
        <p className="sales-panel">
          {review
            ? "No pending sales to review."
            : allSales
              ? "No sales match these filters."
              : "No sales recorded yet."}
        </p>
      )}
      <ListPagination
        total={data?.total ?? 0}
        page={page}
        pageSize={data?.pageSize ?? 25}
        loading={loading}
        onPage={onPage}
        noun="sales"
      />
      {selection && (
        <WorkspaceDialog
          title={
            selection.status === "approved" ? "Approve sale" : "Reject sale"
          }
          locked={busy}
          description="Review the collected amount before confirming."
          onClose={() => setSelection(null)}
        >
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void decide();
            }}
          >
            <p>
              {selection.sale.studentName} · {money(selection.sale.amountPaise)}{" "}
              · {selection.sale.teamName}
            </p>
            <p>
              {selection.status === "approved"
                ? "This self-reported sale will count in approved totals. Approval is not payment verification."
                : "This sale will remain excluded from approved totals."}
            </p>
            <Label>
              {selection.status === "rejected"
                ? "Rejection reason"
                : "Review note (optional)"}
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required={selection.status === "rejected"}
              />
            </Label>
            <div className="dialog-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelection(null)}
              >
                Cancel
              </Button>
              <Button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </form>
        </WorkspaceDialog>
      )}
    </section>
  );
}
