"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Account, ApiError, api } from "../lib/api";
import EmployeeDashboard from "../components/employee-dashboard";

export default function EmployeePage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const loadSession = useCallback(() => {
    return api<{ account: Account }>("/api/auth/me")
      .then(({ account }) => {
        if (account.role !== "employee" || account.mustChangePassword) {
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
  }, [router]);
  useEffect(() => {
    void loadSession();
  }, [loadSession]);
  useEffect(() => {
    if (!account || passwordChanged) return;
    const refresh = () => {
      void loadSession();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [account, passwordChanged, loadSession]);

  if (passwordChanged)
    return (
      <main className="session-screen">
        <section>
          <span className="brand-mark">P</span>
          <h1>Password updated</h1>
          <p>
            You have been signed out on all devices. Sign in with your new
            password to continue.
          </p>
          <Link className="button primary" href="/">
            Back to sign in
          </Link>
        </section>
      </main>
    );
  if (!account)
    return (
      <main className="session-screen">
        <section>
          <span className="brand-mark">P</span>
          <h1>{error ? "Unable to connect" : "Opening your workspace"}</h1>
          <p role="status">{error || "Checking your session…"}</p>
          {error && (
            <button className="button primary" onClick={loadSession}>
              Try again
            </button>
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
      onPasswordChanged={() => {
        setAccount(null);
        setPasswordChanged(true);
      }}
    />
  );
}
