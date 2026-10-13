"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type Account } from "../lib/api";
import { TvLeaderboard } from "../components/tv/tv-leaderboard";
import { Button } from "@/components/ui/button";

export default function TvPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [message, setMessage] = useState("Checking your session…");
  const load = useCallback(async () => {
    try {
      const result = await api<{ account: Account }>("/api/auth/me");
      if (
        result.account.role !== "admin" ||
        result.account.mustChangePassword
      ) {
        setAccount(null);
        setMessage(
          "Sign in with an administrator account to open the TV leaderboard.",
        );
      } else setAccount(result.account);
    } catch (error) {
      setAccount(null);
      setMessage(
        error instanceof ApiError && error.status === 401
          ? "Sign in with an administrator account, then open /tv."
          : "Unable to connect. Try again.",
      );
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initial);
  }, [load]);
  if (!account)
    return (
      <main className="session-screen">
        <section>
          <h1>Sales leaderboard</h1>
          <p>{message}</p>
          <Button variant="outline" onClick={load}>
            Retry
          </Button>
          <Link className="session-home-link" href="/">
            Go to sign in
          </Link>
        </section>
      </main>
    );
  return (
    <TvLeaderboard
      account={account}
      onSessionExpired={() => {
        setAccount(null);
        setMessage(
          "Session ended. Sign in again to resume the live leaderboard.",
        );
      }}
    />
  );
}
