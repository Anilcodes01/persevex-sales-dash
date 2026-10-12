"use client";
import { useState } from "react";
import { api } from "../lib/api";
import { jobRoleLabel } from "../../shared/roles";
import { AccountSettings } from "./employee/account-settings";
import { EmployeeOverview } from "./employee/employee-overview";
import type { EmployeeDashboardProps } from "./employee/types";
import { WorkspaceShell } from "./layout/workspace-shell";
import { WorkspaceSidebar } from "./layout/workspace-sidebar";
import { PageHeading } from "./layout/page-heading";
import { WorkspaceFooter } from "./layout/workspace-footer";

export default function EmployeeDashboard({
  account,
  statusMessage,
  onSessionExpired,
  onSignedOut,
  onPasswordChanged,
}: EmployeeDashboardProps) {
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
  const sidebar = (
    <WorkspaceSidebar
      account={account}
      accountLabel={jobRoleLabel(account.jobRole)}
      homeHref="/employee"
      homeLabel="Employee dashboard"
      workspaceLabel="MY WORKSPACE"
      navigationLabel="Employee workspace"
      navigationClassName="employee-nav"
      items={[
        { id: "overview", label: "Overview", icon: "▦" },
        { id: "account", label: "My account", icon: "◎" },
      ]}
      activeItem={view}
      onNavigate={(id) => {
        if (id === "overview" || id === "account") setView(id);
      }}
      noteTitle="Your personal workspace"
      noteDescription="Your account and team."
      settingsLabel="Account settings"
      onSettings={() => setView("account")}
      onLogout={logout}
      signingOut={busy}
    />
  );
  return (
    <WorkspaceShell
      sidebar={sidebar}
      workspace="My workspace"
      page={view === "overview" ? "Overview" : "My account"}
      badge="MY WORKSPACE"
      className="employee-shell"
    >
      <PageHeading
        eyebrow={view === "overview" ? "WORKSPACE" : "YOUR ACCOUNT"}
        title={
          view === "overview"
            ? `Welcome, ${account.displayName.split(" ")[0]}.`
            : "Your profile & security."
        }
        description={
          view === "overview"
            ? "Your team, account and performance."
            : "Review your account details and keep your sign-in secure."
        }
        action={
          <span className="employee-access-badge">
            <span className="small-dot" />
            Account active
          </span>
        }
      />
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
        <EmployeeOverview
          account={account}
          onAccount={() => setView("account")}
        />
      )}
      <WorkspaceFooter description="Your personal account and performance." />
    </WorkspaceShell>
  );
}
