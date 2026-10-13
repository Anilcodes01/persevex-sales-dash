"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "../forms/date-picker";
import { Label } from "@/components/ui/label";
import { monthDates, TARGET_BASES } from "../../../shared/targets";
import { api, ApiError } from "../../lib/api";
import { useSalesLive } from "../../hooks/use-sales-live";
import { money } from "../sales/types";
import type { Performance } from "./types";
type ResponseData = {
  from: string;
  to: string;
  performance: Performance;
  targets: Performance[];
};
export function PersonalPerformance({
  accountId,
  onSessionExpired,
}: {
  accountId: string;
  onSessionExpired: () => void;
}) {
  const [range, setRange] = useState(() => monthDates());
  const [data, setData] = useState<ResponseData | null>(null);
  const serial = useRef(0);
  const load = useCallback(() => {
    const request = ++serial.current;
    return api<ResponseData>(
      `/api/employee/performance?from=${range.from}&to=${range.to}`,
    )
      .then((result) => {
        if (request === serial.current) setData(result);
        return true;
      })
      .catch((error) => {
        if (request !== serial.current) return false;
        if (error instanceof ApiError && error.status === 401) {
          setData(null);
          onSessionExpired();
        }
        toast.error(
          error instanceof Error ? error.message : "Could not load performance",
        );
        return false;
      });
  }, [range.from, range.to, onSessionExpired]);
  useEffect(() => {
    void load();
  }, [load]);
  const accessChanged = useCallback(() => {
    setData(null);
    void load();
  }, [load]);
  const connected = useCallback(() => {}, []);
  const live = useSalesLive({
    accountId,
    refresh: load,
    onAccessChanged: accessChanged,
    onConnected: connected,
    onSessionExpired,
  });
  const shown = data?.from === range.from && data.to === range.to ? data : null;
  const performance = shown?.performance;
  return (
    <>
      <div className="employee-section-heading">
        <h2>Your performance</h2>
        <span role="status">{live.state} · Approved sales only</span>
      </div>
      <div className="targets-toolbar">
        <Label>
          From (IST)
          <DatePicker
            aria-label="View from date"
            min="2000-01-01"
            max="2099-12-31"
            value={range.from}
            onChange={(e) => {
              if (e.target.value)
                setRange((r) => ({
                  from: e.target.value,
                  to: e.target.value > r.to ? e.target.value : r.to,
                }));
            }}
          />
        </Label>
        <Label>
          To (inclusive)
          <DatePicker
            aria-label="View to date"
            min={range.from}
            max="2099-12-31"
            value={range.to}
            onChange={(e) => {
              if (e.target.value)
                setRange((r) => ({ ...r, to: e.target.value }));
            }}
          />
        </Label>
        <Button variant="outline" onClick={() => setRange(monthDates())}>
          Current month
        </Button>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <section
        className="stat-grid employee-stats"
        aria-label="Date-range performance"
      >
        {[
          {
            label: "Registration amount",
            value: performance ? money(performance.registrationPaise) : "—",
            caption: "Initial money collected in the selected dates",
          },
          {
            label: "Overall amount",
            value: performance ? money(performance.overallPaise) : "—",
            caption: "Total sale value, including remaining",
          },
          {
            label: "Approved sales",
            value: performance ? String(performance.approvedCount) : "—",
            caption: "Sales recorded in the selected IST dates",
          },
          {
            label: "Target achievement",
            value: performance
              ? performance.achievement !== null
                ? `${performance.achievement.toFixed(1)}%`
                : shown?.targets.length
                  ? "See targets"
                  : "Not set"
              : "—",
            caption: performance?.basis
              ? TARGET_BASES.find((b) => b.value === performance.basis)!.label
              : "Assigned targets use their own full periods",
          },
        ].map((metric) => (
          <div className="stat-card" key={metric.label}>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <span>{metric.caption}</span>
          </div>
        ))}
      </section>
      <section className="roster-panel targets-assigned">
        <div className="panel-title">
          <div>
            <h2>Your assigned targets</h2>
            <p>
              Targets overlapping the view dates. Each achievement uses the
              target’s full period.
            </p>
          </div>
        </div>
        {shown?.targets.map((target) => (
          <div className="sales-summary" key={target.targetId}>
            <span>
              <strong>
                {target.fromDate} → {target.toDate}
              </strong>
              <p>{TARGET_BASES.find((b) => b.value === target.basis)?.label}</p>
            </span>
            <span>
              Target: <strong>{money(target.targetPaise ?? 0)}</strong>
            </span>
            <span>
              Achieved: <strong>{money(target.achievedPaise)}</strong>
            </span>
            <span>
              Achievement: <strong>{target.achievement?.toFixed(1)}%</strong>
            </span>
            <span>
              Remaining to target:{" "}
              <strong>{money(target.remainingPaise ?? 0)}</strong>
            </span>
            {target.basis === "overall" && target.missingOverallCount > 0 && (
              <small>
                {target.missingOverallCount} historical sales have no overall
                value recorded.
              </small>
            )}
          </div>
        ))}
        {shown && !shown.targets.length && (
          <p className="sales-panel">No target assigned for these dates.</p>
        )}
      </section>
      {!!performance?.missingOverallCount && (
        <p className="field-help">
          {performance.missingOverallCount} historical approved sales have no
          overall value and are excluded from overall amount progress.
        </p>
      )}
    </>
  );
}
