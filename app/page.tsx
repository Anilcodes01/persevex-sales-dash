"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Account, ApiError, api } from "./lib/api";
import AdminDashboard from "./components/admin-dashboard";
const input =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-zinc-950 focus:outline-2 focus:outline-orange-600";
const primary =
  "w-full rounded-lg bg-orange-600 px-4 py-3 font-medium text-white disabled:opacity-50";
const secondary =
  "rounded-lg border border-zinc-300 px-4 py-3 text-sm disabled:opacity-50";

export default function Home() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const passwordMode = Boolean(
    account && (account.mustChangePassword || changingPassword),
  );
  useEffect(() => {
    let active = true;
    api<{ account: Account }>("/api/auth/me")
      .then((data) => {
        if (active) setAccount(data.account);
      })
      .catch((error) => {
        if (active && !(error instanceof ApiError && error.status === 401))
          setMessage(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (account?.role === "employee" && !passwordMode)
      router.replace("/employee");
  }, [account, passwordMode, router]);
  const sessionExpired = useCallback(() => {
    setAccount(null);
    setChangingPassword(false);
    setMessage("Your session has ended. Please sign in again.");
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (passwordMode && values.newPassword !== values.confirmPassword) {
      setMessage("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (passwordMode) {
        await api("/api/auth/password", {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
        setAccount(null);
        setChangingPassword(false);
        setMessage("Password changed. Sign in with your new password.");
      } else {
        const result = await api<{ account: Account }>(
          "/api/auth/login",
          values,
        );
        setAccount(result.account);
      }
      form.reset();
    } catch (error) {
      if (error instanceof ApiError && error.message === "Please sign in")
        sessionExpired();
      else
        setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/auth/logout", {});
      setAccount(null);
      setChangingPassword(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not sign out. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (account?.role === "employee" && !passwordMode) {
    return (
      <main className="session-screen">
        <p role="status">Opening your workspace…</p>
      </main>
    );
  }
  if (account?.role === "admin" && !passwordMode) {
    return (
      <AdminDashboard
        account={account}
        onSessionExpired={sessionExpired}
        onPassword={() => {
          setChangingPassword(true);
          setMessage("");
        }}
        onLogout={logout}
        statusMessage={message}
        onAccountUpdated={() => {
          api<{ account: Account }>("/api/auth/me")
            .then((result) => setAccount(result.account))
            .catch(sessionExpired);
        }}
      />
    );
  }
  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Link className="brand" href="/">
          <span className="brand-mark">P</span>persevex
          <span className="brand-dot">.</span>
        </Link>
        <div>
          <p className="eyebrow">THE NEXT WIN STARTS HERE</p>
          <h2>
            Great teams.
            <br />
            Greater possibilities.
          </h2>
          <p>
            A shared workspace for your people, performance, and every sale
            along the way.
          </p>
        </div>
        <span className="story-footer">PERSEVEX · SALES WORKSPACE</span>
      </aside>
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">WELCOME TO YOUR WORKSPACE</p>
        <h1 id="page-title" className="mt-3 text-3xl font-semibold">
          {loading
            ? "Sales dashboard"
            : passwordMode
              ? "Change your password"
              : account
                ? `Welcome, ${account.displayName}`
                : "Sign in"}
        </h1>
        {loading ? (
          <p className="mt-6" role="status">
            Checking your session…
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-zinc-600">
              {account
                ? account.mustChangePassword
                  ? "Choose your own password before continuing."
                  : passwordMode
                    ? "Changing your password signs you out on all devices."
                    : "Your account is ready. Sales and approvals are coming next."
                : "Use the account provided by your administrator. Need a password reset? Contact your administrator."}
            </p>
            {account && (
              <p className="mt-4 text-sm">
                {account.email} · {account.role}
              </p>
            )}
            {(!account || passwordMode) && (
              <form
                key={passwordMode ? "password" : "login"}
                onSubmit={submit}
                className="mt-6 space-y-5"
              >
                {!account && (
                  <label className="block text-sm font-medium">
                    Email
                    <input
                      className={input}
                      name="email"
                      type="email"
                      autoComplete="username"
                      maxLength={254}
                      required
                    />
                  </label>
                )}
                <label className="block text-sm font-medium">
                  {passwordMode ? "Current password" : "Password"}
                  <input
                    className={input}
                    name={passwordMode ? "currentPassword" : "password"}
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    required
                  />
                </label>
                {passwordMode && (
                  <>
                    <label className="block text-sm font-medium">
                      New password
                      <input
                        className={input}
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={15}
                        maxLength={128}
                        required
                      />
                      <span className="mt-2 block text-xs text-zinc-500">
                        Use 15–128 characters. A long passphrase works well.
                      </span>
                    </label>
                    <label className="block text-sm font-medium">
                      Confirm new password
                      <input
                        className={input}
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={15}
                        maxLength={128}
                        required
                      />
                    </label>
                  </>
                )}
                <button disabled={busy} className={primary}>
                  {busy
                    ? "Please wait…"
                    : passwordMode
                      ? "Save new password"
                      : "Sign in"}
                </button>
              </form>
            )}
            {account && (
              <div className="mt-5 flex flex-wrap gap-3">
                {!account.mustChangePassword && (
                  <button
                    className={secondary}
                    disabled={busy}
                    onClick={() => {
                      setChangingPassword(!changingPassword);
                      setMessage("");
                    }}
                  >
                    {passwordMode ? "Cancel" : "Change password"}
                  </button>
                )}
                <button onClick={logout} disabled={busy} className={secondary}>
                  Sign out
                </button>
              </div>
            )}
          </>
        )}
        {message && (
          <p role="status" className="mt-5 text-sm">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
