"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError, type Account } from "../../lib/api";
import { useSalesLive } from "../../hooks/use-sales-live";
import { money } from "../sales/types";
import { Brand } from "../layout/brand";
import "./tv.css";

import { Rankings, type Standing } from "./rankings";
type Board = {
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
  const [clock, setClock] = useState("");
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
  const live = useSalesLive({
    accountId: account.id,
    refresh,
    onAccessChanged: accessChanged,
    onConnected: () => {},
    onSessionExpired,
  });
  useEffect(() => {
    const update = () =>
      setClock(
        new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    const requests = serial;
    const initial = setTimeout(() => {
      update();
      void refresh();
    }, 0);
    // Recover failed reads and roll the reporting month over without another sale.
    const sync = setInterval(() => {
      update();
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
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error("Fullscreen is unavailable in this browser.");
    }
  }
  const period = data
    ? new Date(`${data.period.from}T12:00:00+05:30`).toLocaleDateString(
        "en-IN",
        { timeZone: "Asia/Kolkata", month: "long", year: "numeric" },
      )
    : "Current month";
  return (
    <main className="tv-screen">
      <header className="tv-header">
        <Brand href="/" label="Persevex home" />
        <div>
          <h1>Sales leaderboard</h1>
          <p>{period} · Approved registration amount</p>
        </div>
        <div className="tv-connection">
          <span className={live.state === "Live" ? "live-dot" : "stale-dot"} />
          <strong>{live.state}</strong>
          <span>{clock} IST</span>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fullscreen}
          aria-label="Toggle fullscreen"
        >
          <Maximize />
        </Button>
      </header>
      <section className="tv-metrics" aria-label="Monthly totals">
        <div>
          <span>Approved registration</span>
          <strong>{data ? money(data.totals.amountPaise) : "—"}</strong>
        </div>
        <div>
          <span>Approved sales</span>
          <strong>{data?.totals.approved ?? "—"}</strong>
        </div>
        <div>
          <span>Awaiting approval</span>
          <strong>{data?.totals.pending ?? "—"}</strong>
        </div>
      </section>
      {live.state !== "Live" && (
        <p className="tv-sync-message" role="status">
          {data
            ? "Showing last loaded results. Reconnecting to live sales…"
            : "Connecting to the live leaderboard…"}
        </p>
      )}
      <div className="tv-boards">
        <Rankings
          key={`employees:${data?.period.from ?? "loading"}`}
          title="Employee leaderboard"
          rows={data?.employees ?? []}
          cycle={cycle}
        />
        <Rankings
          key={`teams:${data?.period.from ?? "loading"}`}
          title="Team leaderboard"
          rows={data?.teams ?? []}
          cycle={cycle}
        />
      </div>
      <section className="tv-activity">
        <div className="tv-section-title">
          <h2>Recent sale activity</h2>
          <span>Pending sales join rankings after approval</span>
        </div>
        <div className="tv-activity-grid">
          {data?.activity.map((sale) => (
            <article key={`${sale.id}:${sale.status}`}>
              <span className="tv-activity-status">
                {sale.status} ·{" "}
                {new Date(sale.time).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <strong>{sale.employeeName}</strong>
              <span>{sale.teamName}</span>
              <b>{money(sale.amountPaise)}</b>
            </article>
          ))}
          {data && !data.activity.length && <p>No sales this month yet.</p>}
        </div>
      </section>
      <footer className="tv-footer">
        <span>Self-reported sales · Approval is not payment verification</span>
        <span>
          Pages rotate every 15 seconds ·{" "}
          {live.lastSync
            ? `Synced ${new Date(live.lastSync).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
            : "Waiting for sync"}
        </span>
      </footer>
    </main>
  );
}
