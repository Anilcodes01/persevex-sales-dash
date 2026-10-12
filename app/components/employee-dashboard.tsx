"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import EmployeeTeam from "./employee-team";
import { Account, ApiError, api } from "../lib/api";

type Props = {
  account: Account;
  statusMessage: string;
  onSessionExpired: () => void;
  onSignedOut: () => void;
  onPasswordChanged: () => void;
};
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function AccountSettings({
  account,
  onPasswordChanged,
  onSessionExpired,
}: Pick<Props, "account" | "onPasswordChanged" | "onSessionExpired">) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      form.reset();
      onPasswordChanged();
    } catch (err) {
      if (err instanceof ApiError && err.message === "Please sign in")
        onSessionExpired();
      setError(
        err instanceof Error ? err.message : "Unable to change your password",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="employee-account-grid">
      <section
        className="roster-panel profile-panel"
        aria-labelledby="profile-heading"
      >
        <div className="panel-title">
          <div>
            <h2 id="profile-heading">Your profile</h2>
            <p>Account details managed by your administrator.</p>
          </div>
        </div>
        <dl className="profile-details">
          <div>
            <dt>Full name</dt>
            <dd>{account.displayName}</dd>
          </div>
          <div>
            <dt>Email address</dt>
            <dd>{account.email}</dd>
          </div>
          <div>
            <dt>Access role</dt>
            <dd>Employee</dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>
              <span className="status-tag active">
                <span />
                Active
              </span>
            </dd>
          </div>
        </dl>
        <p className="profile-footnote">
          Contact your administrator to update your name or email address.
        </p>
      </section>
      <section className="roster-panel" aria-labelledby="security-heading">
        <div className="panel-title">
          <div>
            <h2 id="security-heading">Change password</h2>
            <p>Changing your password signs you out on every device.</p>
          </div>
        </div>
        <form
          onSubmit={changePassword}
          className="account-form employee-password-form"
        >
          <label>
            Current password
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
            />
            <span className="field-help">
              Use 15–128 characters. Choose a long, memorable passphrase.
            </span>
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
export default function EmployeeDashboard({
  account,
  statusMessage,
  onSessionExpired,
  onSignedOut,
  onPasswordChanged,
}: Props) {
  const [view, setView] = useState<"overview" | "account">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/logout", {});
      onSignedOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-shell employee-shell">
      <aside className="sidebar">
        <Link
          className="brand"
          href="/employee"
          aria-label="Employee dashboard"
        >
          <span className="brand-mark">P</span>persevex
          <span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">MY WORKSPACE</div>
        <nav className="employee-nav" aria-label="Employee workspace">
          <button
            className={`nav-item ${view === "overview" ? "selected" : ""}`}
            aria-current={view === "overview" ? "page" : undefined}
            onClick={() => setView("overview")}
          >
            <span aria-hidden="true">▦</span>Overview
          </button>
          <button
            className={`nav-item ${view === "account" ? "selected" : ""}`}
            aria-current={view === "account" ? "page" : undefined}
            onClick={() => setView("account")}
          >
            <span aria-hidden="true">◎</span>My account
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-dot" />
          Your personal workspace
          <p>Your account, your progress, and your next milestone.</p>
        </div>
        <div className="sidebar-account">
          <span className="avatar">{initials(account.displayName)}</span>
          <div>
            <strong>{account.displayName}</strong>
            <span>Employee</span>
          </div>
        </div>
        <button className="sidebar-link" onClick={() => setView("account")}>
          Account settings
        </button>
        <button className="sidebar-link" disabled={busy} onClick={logout}>
          {busy ? "Signing out…" : "Sign out ↗"}
        </button>
      </aside>
      <main className="admin-main">
        <header className="workspace-header">
          <span>
            My workspace<span className="breadcrumb-slash">/</span>
            <strong>{view === "overview" ? "Overview" : "My account"}</strong>
          </span>
          <span className="workspace-badge">EMPLOYEE WORKSPACE</span>
        </header>
        <div className="admin-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "overview" ? "MAKE EVERY WIN COUNT" : "YOUR ACCOUNT"}
              </p>
              <h1>
                {view === "overview"
                  ? `Welcome, ${account.displayName.split(" ")[0]}.`
                  : "Your profile & security."}
              </h1>
              <p className="page-subtitle">
                {view === "overview"
                  ? "A place to follow your progress and stay connected to your team."
                  : "Review your account details and keep your sign-in secure."}
              </p>
            </div>
            <span className="employee-access-badge">
              <span className="small-dot" />
              Account active
            </span>
          </div>
          {(statusMessage || error) && (
            <p className="notice error" role="alert">
              {error || statusMessage}
            </p>
          )}
          {view === "account" ? (
            <AccountSettings
              account={account}
              onSessionExpired={onSessionExpired}
              onPasswordChanged={onPasswordChanged}
            />
          ) : (
            <>
              <section className="employee-welcome">
                <div>
                  <p className="eyebrow">READY FOR WHAT&apos;S NEXT</p>
                  <h2>Your next win starts here.</h2>
                  <p>
                    Your account is ready. Sales entry and manager approvals are
                    the next features we&apos;re building.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setView("account")}
                  >
                    View my account <span aria-hidden="true">↗</span>
                  </button>
                </div>
                <div className="welcome-monogram" aria-hidden="true">
                  <span>{initials(account.displayName)}</span>
                  <small>PERSEVEX TEAM</small>
                </div>
              </section>
              <div className="employee-section-heading">
                <h2>Your performance</h2>
                <span>Available when sales tracking is enabled</span>
              </div>
              <section
                className="stat-grid employee-stats"
                aria-label="Performance availability"
              >
                {[
                  {
                    label: "Collected revenue",
                    caption: "Approved collections, less refunds",
                  },
                  {
                    label: "Sales count",
                    caption: "Your eligible, approved sales",
                  },
                  {
                    label: "Target achievement",
                    caption: "Progress against your assigned target",
                  },
                ].map((metric) => (
                  <div className="stat-card" key={metric.label}>
                    <p>{metric.label}</p>
                    <strong aria-label="Not available yet">—</strong>
                    <span>{metric.caption}</span>
                  </div>
                ))}
              </section>
              <EmployeeTeam />
              <div className="employee-overview-grid">
                <section
                  className="roster-panel"
                  aria-labelledby="activity-heading"
                >
                  <div className="panel-title">
                    <div>
                      <h2 id="activity-heading">Sales activity</h2>
                      <p>
                        Your submissions and approval updates will appear here.
                      </p>
                    </div>
                    <span className="feature-status">Coming next</span>
                  </div>
                  <div className="empty-state">
                    <span aria-hidden="true">◎</span>
                    <h3>Sales tracking is on the way</h3>
                    <p>
                      Once it&apos;s enabled, you&apos;ll be able to post sales,
                      track their status, and review your history from this
                      workspace.
                    </p>
                  </div>
                </section>
                <section className="roster-panel employee-profile-summary">
                  <div className="panel-title">
                    <div>
                      <h2>Your account</h2>
                      <p>Connected to your workspace.</p>
                    </div>
                  </div>
                  <div className="employee-profile-body">
                    <span className="avatar large-avatar">
                      {initials(account.displayName)}
                    </span>
                    <h3>{account.displayName}</h3>
                    <p>{account.email}</p>
                    <span className="role-tag">Employee</span>
                    <button
                      className="button ghost"
                      onClick={() => setView("account")}
                    >
                      Manage my account
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
          <p className="workspace-footer">
            PERSEVEX SALES WORKSPACE
            <span>Your personal account and performance.</span>
          </p>
        </div>
      </main>
    </div>
  );
}
