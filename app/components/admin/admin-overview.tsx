"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "../../lib/api";
import { useSalesLive } from "../../hooks/use-sales-live";
import { monthDates } from "../../../shared/targets";
import { money } from "../sales/types";
import { DatePicker } from "../forms/date-picker";
import { PageHeading } from "../layout/page-heading";

type Overview = {
  period: { from: string; to: string };
  sales: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    registrationPaise: number;
    overallPaise: number;
    remainingPaise: number;
    missingOverall: number;
    sellers: number;
  };
  workspace: {
    teams: number;
    accounts: number;
    activeAccounts: number;
    teamLeads: number;
  };
};
export function AdminOverview({
  accountId,
  onSessionExpired,
  onSales,
  onApprovals,
}: {
  accountId: string;
  onSessionExpired: () => void;
  onSales: () => void;
  onApprovals: () => void;
}) {
  const [range, setRange] = useState(() => monthDates());
  const [data, setData] = useState<Overview | null>(null);
  const serial = useRef(0);
  const load = useCallback(() => {
    const request = ++serial.current;
    return api<Overview>(`/api/admin/overview?${new URLSearchParams(range)}`)
      .then((result) => {
        if (request === serial.current) setData(result);
        return true;
      })
      .catch((error) => {
        if (request !== serial.current) return false;
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          setData(null);
          onSessionExpired();
        }
        toast.error(
          error instanceof Error ? error.message : "Could not load overview",
        );
        return false;
      });
  }, [range, onSessionExpired]);
  useEffect(() => {
    void load();
  }, [load]);
  const accessChanged = useCallback(() => {
    setData(null);
    void load();
  }, [load]);
  const live = useSalesLive({
    accountId,
    refresh: load,
    onAccessChanged: accessChanged,
    onConnected: () => {},
    onSessionExpired,
  });
  const shown =
    data?.period.from === range.from && data.period.to === range.to
      ? data
      : null;
  const sales = shown?.sales,
    workspace = shown?.workspace;
  const metrics = [
    ["Total sales", sales?.total, "All submitted sales"],
    ["Approved registrations", sales?.approved, "Approved sale records"],
    [
      "Registration amount",
      sales ? money(sales.registrationPaise) : undefined,
      "Approved initial collections",
    ],
    [
      "Overall sale value",
      sales ? money(sales.overallPaise) : undefined,
      "Approved total sale value",
    ],
    [
      "Remaining amount",
      sales ? money(sales.remainingPaise) : undefined,
      "Overall value less initial collections",
    ],
    [
      "Pending approval",
      sales?.pending,
      "Waiting for Team Lead or admin review",
    ],
    ["Rejected sales", sales?.rejected, "Excluded from approved totals"],
    [
      "Selling employees",
      sales?.sellers,
      "People who submitted sales this period",
    ],
  ];
  return (
    <>
      <PageHeading
        title="Overview"
        description="Sales, registrations and workspace performance."
      />
      <div className="targets-toolbar">
        <Label>
          From (IST)
          <DatePicker
            value={range.from}
            max={range.to}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </Label>
        <Label>
          To (inclusive)
          <DatePicker
            value={range.to}
            min={range.from}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </Label>
        <Button variant="outline" onClick={() => setRange(monthDates())}>
          Current month
        </Button>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
        <span role="status">
          {live.state} ·{" "}
          {live.state === "Live" ? "Live updates" : "Results may be outdated"}
        </span>
      </div>
      <section className="overview-stat-grid" aria-label="Sales statistics">
        {metrics.map(([label, value, caption]) => (
          <div className="stat-card" key={label}>
            <p>{label}</p>
            <strong>{value ?? "—"}</strong>
            <span>{caption}</span>
          </div>
        ))}
      </section>
      {!!sales?.missingOverall && (
        <p className="field-help">
          {sales.missingOverall} approved sales have no recorded overall value
          and are excluded from overall and remaining amounts.
        </p>
      )}
      <div className="overview-actions">
        <Button variant="outline" onClick={onSales}>
          View all sales
        </Button>
        <Button variant="outline" onClick={onApprovals}>
          Review pending sales
        </Button>
      </div>
      <section className="roster-panel">
        <div className="panel-title">
          <div>
            <h2>Workspace</h2>
            <p>
              Current account and team totals, independent of the selected
              period.
            </p>
          </div>
        </div>
        <div className="stat-grid">
          {[
            ["Total accounts", workspace?.accounts],
            ["Active accounts", workspace?.activeAccounts],
            ["Teams", workspace?.teams],
            ["Active Team Leads", workspace?.teamLeads],
          ].map(([label, value]) => (
            <div className="stat-card" key={label}>
              <p>{label}</p>
              <strong>{value ?? "—"}</strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
