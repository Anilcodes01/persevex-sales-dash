"use client";
import { useNotificationState } from "../hooks/use-notification-state";
import { useState } from "react";
import { api } from "../lib/api";
import { jobRoleLabel } from "../../shared/roles";
import { AccountSettings } from "./employee/account-settings";
import { EmployeeOverview } from "./employee/employee-overview";
import type { EmployeeDashboardProps } from "./employee/types";
import { WorkspaceShell } from "./layout/workspace-shell";
import { WorkspaceSidebar } from "./layout/workspace-sidebar";
import { PageHeading } from "./layout/page-heading";
import { TargetsPanel } from "./targets/targets-panel";
import { CreateSaleDialog } from "./sales/create-sale-dialog";
import { Button } from "@/components/ui/button";
import { SalesPanel } from "./sales/sales-panel";
import {
  LayoutDashboard,
  User2,
  Receipt,
  CheckSquare,
  Plus,
} from "lucide-react";

export default function EmployeeDashboard({
  account,
  onSessionExpired,
  onSignedOut,
}: EmployeeDashboardProps) {
  const [view, setView] = useState<
    "overview" | "account" | "sales" | "approvals" | "targets"
  >("overview");
  const [creatingSale, setCreatingSale] = useState(false);
  const [salesRevision, setSalesRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, setError] = useNotificationState();
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
      navigationLabel="Employee workspace"
      navigationClassName="employee-nav"
      items={[
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "sales", label: "My sales", icon: Receipt },
        ...(account.jobRole === "team_lead"
          ? [
              { id: "approvals", label: "Approvals", icon: CheckSquare },
              { id: "targets", label: "Targets", icon: CheckSquare },
            ]
          : []),
        { id: "account", label: "My account", icon: User2 },
      ]}
      activeItem={view}
      onNavigate={(id) => {
        if (
          id === "overview" ||
          id === "account" ||
          id === "sales" ||
          ((id === "approvals" || id === "targets") &&
            account.jobRole === "team_lead")
        )
          setView(id);
      }}
    />
  );
  return (
    <>
      <WorkspaceShell
        sidebar={sidebar}
        navbar={{
          account,
          accountLabel: jobRoleLabel(account.jobRole),
          homeHref: "/employee",
          homeLabel: "Employee dashboard",
          action: (
            <Button
              className="button primary navbar-create-sale"
              aria-label="Create sale"
              title="Create sale"
              disabled={busy}
              onClick={() => setCreatingSale(true)}
            >
              <Plus size={16} />
              <span className="navbar-create-sale-label">Create sale</span>
            </Button>
          ),

          settingsLabel: "Account settings",
          onSettings: () => setView("account"),
          onLogout: logout,
          signingOut: busy,
        }}
        className="employee-shell"
      >
        <PageHeading
          title={
            view === "overview"
              ? `Welcome, ${account.displayName.split(" ")[0]}.`
              : view === "account"
                ? "Your profile."
                : view === "sales"
                  ? "Your sales."
                  : view === "targets"
                    ? "Employee targets."
                    : "Review team sales."
          }
          description={
            view === "overview"
              ? "Your team, account and performance."
              : view === "account"
                ? "Review your account details."
                : "Every sale requires approval before it counts."
          }
          action={
            <span className="employee-access-badge">
              <span className="small-dot" />
              Account active
            </span>
          }
        />

        {view === "targets" ? (
          <TargetsPanel account={account} onSessionExpired={onSessionExpired} />
        ) : view === "sales" || view === "approvals" ? (
          <SalesPanel
            key={view}
            account={account}
            review={view === "approvals"}
            refreshKey={salesRevision}
            onSessionExpired={onSessionExpired}
          />
        ) : view === "account" ? (
          <AccountSettings account={account} />
        ) : (
          <EmployeeOverview
            account={account}
            onAccount={() => setView("account")}
            onSales={() => setView("sales")}
            onSessionExpired={onSessionExpired}
          />
        )}
      </WorkspaceShell>
      {creatingSale && (
        <CreateSaleDialog
          accountId={account.id}
          onClose={() => setCreatingSale(false)}
          onSessionExpired={onSessionExpired}
          onSaved={() => {
            setCreatingSale(false);
            setSalesRevision((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
