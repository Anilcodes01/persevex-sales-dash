"use client";
import { toast } from "sonner";
import { useNotificationState } from "./hooks/use-notification-state";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Brand } from "./components/layout/brand";
import { useRouter } from "next/navigation";

import { jobRoleLabel, accessLabel } from "../shared/roles";
import { Account, ApiError, api } from "./lib/api";
import AdminDashboard from "./components/admin-dashboard";
const input =
  "mt-2 w-full border border-input bg-background px-3 py-3 text-foreground focus:outline-2 focus:outline-ring";
const primary =
  "w-full bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50";
const secondary = "border border-input px-4 py-3 text-sm disabled:opacity-50";

export default function Home() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useNotificationState();
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
  }, [setMessage]);
  useEffect(() => {
    if (account && account.role !== "admin" && !passwordMode)
      router.replace("/employee");
  }, [account, passwordMode, router]);
  const sessionExpired = useCallback(() => {
    setAccount(null);
    setChangingPassword(false);
    setMessage("Your session has ended. Please sign in again.");
  }, [setMessage]);
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
        toast.success("Password changed. Sign in with your new password.");
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
  if (account && account.role !== "admin" && !passwordMode) {
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
        <Brand />
        <div>
          <p className="eyebrow">PERSEVEX</p>
          <h2>
            One workspace.
            <br />
            Your team.
          </h2>
          <p>Manage your people and follow your team’s performance.</p>
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
            <p className="mt-3 text-sm text-muted-foreground">
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
                {account.email} · {jobRoleLabel(account.jobRole)} ·{" "}
                {accessLabel(account.role)}
              </p>
            )}
            {(!account || passwordMode) && (
              <form
                key={passwordMode ? "password" : "login"}
                onSubmit={submit}
                className="mt-6 space-y-5"
              >
                {!account && (
                  <Label className="block text-sm font-medium">
                    Email
                    <Input
                      className={input}
                      name="email"
                      type="email"
                      autoComplete="username"
                      maxLength={254}
                      required
                    />
                  </Label>
                )}
                <Label className="block text-sm font-medium">
                  {passwordMode ? "Current password" : "Password"}
                  <Input
                    className={input}
                    name={passwordMode ? "currentPassword" : "password"}
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    required
                  />
                </Label>
                {passwordMode && (
                  <>
                    <Label className="block text-sm font-medium">
                      New password
                      <Input
                        className={input}
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        required
                      />
                      <span className="mt-2 block text-xs text-muted-foreground">
                        Use 6–128 characters. A long passphrase works well.
                      </span>
                    </Label>
                    <Label className="block text-sm font-medium">
                      Confirm new password
                      <Input
                        className={input}
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        required
                      />
                    </Label>
                  </>
                )}
                <Button disabled={busy} className={primary}>
                  {busy
                    ? "Please wait…"
                    : passwordMode
                      ? "Save new password"
                      : "Sign in"}
                </Button>
              </form>
            )}
            {account && (
              <div className="mt-5 flex flex-wrap gap-3">
                {!account.mustChangePassword && (
                  <Button
                    className={secondary}
                    disabled={busy}
                    onClick={() => {
                      setChangingPassword(!changingPassword);
                      setMessage("");
                    }}
                  >
                    {passwordMode ? "Cancel" : "Change password"}
                  </Button>
                )}
                <Button onClick={logout} disabled={busy} className={secondary}>
                  Sign out
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
