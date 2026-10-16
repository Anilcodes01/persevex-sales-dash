"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError, type Account } from "../../lib/api";
import { useSalesLive } from "../../hooks/use-sales-live";
import "./tv.css";

import { Rankings, type Standing } from "./rankings";
import { CashfreePayments, type PaymentRow } from "./cashfree-payments";
import { SalesSoundControl } from "../sounds/sales-sound-control";
import { FullscreenButton } from "./fullscreen-button";
type Board = {
  payments: PaymentRow[];
  paymentEnvironment: "sandbox" | "production" | null;
  paymentsConfigured: boolean;
  employees: Standing[];
  teams: Standing[];
  totals: { amountPaise: number; approved: number; pending: number };
  activity: {
    id: string;
    employeeName: string;
    teamName: string;
    amountPaise: number;
    status: string;
    time: number;
  }[];
  period: { from: string; to: string };
  generatedAt: number;
};
export function TvLeaderboard({
  account,
  onSessionExpired,
}: {
  account: Account;
  onSessionExpired: () => void;
}) {
  const [data, setData] = useState<Board | null>(null);
  const [cycle, setCycle] = useState(0);
  const [view, setView] = useState<"teams" | "employees">("teams");
  const serial = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++serial.current;
    try {
      const result = await api<Board>("/api/admin/tv");
      if (request !== serial.current) return false;
      setData(result);
      return true;
    } catch (error) {
      if (request !== serial.current) return false;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setData(null);
        onSessionExpired();
      }
      return false;
    }
  }, [onSessionExpired]);
  const accessChanged = useCallback(() => {
    ++serial.current;
    setData(null);
    void refresh();
  }, [refresh]);
  useSalesLive({
    accountId: account.id,
    refresh,
    onAccessChanged: accessChanged,
    onConnected: () => {},
    onSessionExpired,
  });
  useEffect(() => {
    const requests = serial;
    const initial = setTimeout(() => {
      void refresh();
    }, 0);
    // Recover failed reads and roll the reporting month over without another sale.
    const sync = setInterval(() => {
      void refresh();
    }, 60000);
    const rotate = setInterval(() => setCycle((c) => c + 1), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(sync);
      clearInterval(rotate);
      ++requests.current;
    };
  }, [refresh]);
  return (
    <main className="tv-display">
      <FullscreenButton />
      <SalesSoundControl key={account.id} accountId={account.id} floating />
      <Rankings
        key={`${view}:${data?.period.from ?? "loading"}`}
        title="Sales performance"
        showAvatars={view === "employees"}
        rows={data?.[view] ?? []}
        cycle={cycle}
        controls={
          <div
            className="tv-view-switch"
            role="group"
            aria-label="Leaderboard view"
          >
            <Button
              variant="ghost"
              aria-pressed={view === "teams"}
              onClick={() => {
                setView("teams");
                setCycle(0);
              }}
            >
              Team view
            </Button>
            <Button
              variant="ghost"
              aria-pressed={view === "employees"}
              onClick={() => {
                setView("employees");
                setCycle(0);
              }}
            >
              Individual view
            </Button>
          </div>
        }
      />
      <CashfreePayments
        payments={data?.payments ?? []}
        environment={data?.paymentEnvironment ?? null}
        configured={data?.paymentsConfigured ?? false}
        loading={!data}
      />
    </main>
  );
}
