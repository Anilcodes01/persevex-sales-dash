"use client";
import { useNotificationState } from "../hooks/use-notification-state";

import { Button } from "@/components/ui/button";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Account, ApiError, api } from "../lib/api";
import EmployeeDashboard from "../components/employee-dashboard";

export default function EmployeePage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useNotificationState();
  const loadSession = useCallback(() => {
    return api<{ account: Account }>("/api/auth/me")
      .then(({ account }) => {
        if (account.role === "admin" || account.mustChangePassword) {
          router.replace("/");
          return;
        }
        setError("");
        setAccount(account);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAccount(null);
          router.replace("/");
        } else {
          setError(
            err instanceof Error ? err.message : "Unable to load your account",
          );
        }
      });
  }, [router, setError]);
  useEffect(() => {
    void loadSession();
  }, [loadSession]);
  useEffect(() => {
    if (!account) return;
    const refresh = () => {
      void loadSession();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [account, loadSession]);

  if (!account)
    return (
      <main className="session-screen">
        <section>
          <span className="brand-mark">P</span>
          <h1>{error ? "Unable to connect" : "Opening your workspace"}</h1>
          <p role="status">
            {error
              ? "Try again to load your workspace."
              : "Checking your session…"}
          </p>
          {error && (
            <Button className="button primary" onClick={loadSession}>
              Try again
            </Button>
          )}
          <Link className="session-home-link" href="/">
            Back to sign in
          </Link>
        </section>
      </main>
    );
  return (
    <EmployeeDashboard
      account={account}
      statusMessage={error}
      onSessionExpired={() => {
        setAccount(null);
        router.replace("/");
      }}
      onSignedOut={() => {
        setAccount(null);
        router.replace("/");
      }}
    />
  );
}
