"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError, type Account } from "../../lib/api";
import { useSalesLive } from "../../hooks/use-sales-live";
import { SalesList } from "./sales-list";
import type { SalesPage } from "./types";
export function SalesPanel({
  account,
  review = false,
  onSessionExpired,
  refreshKey = 0,
  adminQuery,
  onData,
}: {
  account: Account;
  review?: boolean;
  onSessionExpired: () => void;
  refreshKey?: number;
  adminQuery?: string;
  onData?: (data: SalesPage) => void;
}) {
  const [data, setData] = useState<SalesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const serial = useRef(0);
  const load = useCallback(() => {
    const current = ++serial.current;
    return api<SalesPage>(
      `${adminQuery !== undefined ? "/api/admin/sales" : review ? "/api/manager/sales" : "/api/employee/sales"}?page=${page}${adminQuery !== undefined ? `&${adminQuery}` : ""}`,
    )
      .then((result) => {
        if (current === serial.current) {
          const lastPage = Math.max(
            1,
            Math.ceil(result.total / result.pageSize),
          );
          if (page > lastPage) setPage(lastPage);
          else {
            setData(result);
            onData?.(result);
          }
        }
        return true;
      })
      .catch((error) => {
        if (current !== serial.current) return false;
        if (error instanceof ApiError && error.status === 401)
          onSessionExpired();
        if (error instanceof ApiError && [401, 403].includes(error.status))
          setData(null);
        toast.error(
          error instanceof Error ? error.message : "Could not load sales",
        );
        return false;
      })
      .finally(() => {
        if (current === serial.current) setLoading(false);
      });
  }, [page, review, onSessionExpired, adminQuery, onData]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  const refreshLive = useCallback(() => load(), [load]);
  const connected = useCallback(() => {
    void api<{ account: Account }>("/api/auth/me")
      .then((result) => {
        if (
          result.account.role !== account.role ||
          result.account.jobRole !== account.jobRole
        )
          window.location.reload();
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401)
          onSessionExpired();
      });
  }, [account.role, account.jobRole, onSessionExpired]);
  const accessChanged = useCallback(() => {
    ++serial.current;
    setData(null);
    connected();
  }, [connected]);
  const live = useSalesLive({
    accountId: account.id,
    refresh: refreshLive,
    onAccessChanged: accessChanged,
    onConnected: connected,
    onSessionExpired,
  });
  return (
    <div className="sales-workspace">
      <div className="sales-live-state" role="status" aria-live="polite">
        <span
          className={live.state === "Live" ? "live-dot" : "stale-dot"}
          aria-hidden="true"
        />
        <strong>{live.state}</strong>
        <span>
          {live.lastSync
            ? `Last synced ${new Date(live.lastSync).toLocaleTimeString("en-IN")}`
            : "Waiting for live sync"}
        </span>
        {live.state !== "Live" && data && (
          <span>Showing last loaded sales; they may be outdated.</span>
        )}
      </div>
      <SalesList
        data={data}
        allSales={adminQuery !== undefined}
        review={review}
        loading={loading}
        page={page}
        onPage={(next) => {
          setLoading(true);
          setPage(next);
        }}
        onRefresh={() => {
          setLoading(true);
          void load();
        }}
      />
    </div>
  );
}
