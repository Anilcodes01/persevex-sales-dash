"use client";
import { useState } from "react";
import type { Account } from "../lib/api";
import { usePeopleDirectory } from "../hooks/use-people-directory";
import { TargetsPanel } from "./targets/targets-panel";
import { SalesPanel } from "./sales/sales-panel";
import TeamsPanel from "./teams-panel";
import { AccountDialog } from "./admin/account-dialog";
import { PeoplePanel } from "./admin/people-panel";
import { AdminSalesPanel } from "./admin/admin-sales-panel";
import { AdminOverview } from "./admin/admin-overview";
import { WorkspaceShell } from "./layout/workspace-shell";
import { WorkspaceSidebar } from "./layout/workspace-sidebar";
import {
  RotateCcwClock,
  User2,
  UserRoundGroup,
  CheckSquare,
  Receipt,
  LayoutDashboard,
} from "lucide-react";

type AdminDashboardProps = {
  account: Account;
  onSessionExpired: () => void;
  onPassword: () => void;
  onLogout: () => void;
  onAccountUpdated: () => void;
  statusMessage: string;
};
export default function AdminDashboard(props: AdminDashboardProps) {
  const [view, setView] = useState<
    "overview" | "people" | "teams" | "approvals" | "targets" | "sales"
  >("overview");
  const directory = usePeopleDirectory(props);
  const sidebar = (
    <WorkspaceSidebar
      navigationLabel="Administration"
      navigationClassName="admin-navigation"
      items={[
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        {
          id: "people",
          label: "People",
          icon: User2,
          count: directory.roster?.stats.total ?? "—",
        },
        { id: "teams", label: "Teams", icon: UserRoundGroup },
        { id: "sales", label: "Sales", icon: Receipt },
        { id: "approvals", label: "Approvals", icon: CheckSquare },
        { id: "targets", label: "Targets", icon: CheckSquare },
        { id: "history", label: "History", icon: RotateCcwClock },
      ]}
      activeItem={view}
      onNavigate={(id) => {
        if (
          id === "overview" ||
          id === "people" ||
          id === "teams" ||
          id === "sales" ||
          id === "approvals" ||
          id === "targets"
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
          account: props.account,
          accountLabel: "Administrator",
          homeHref: "/",
          homeLabel: "Persevex home",

          settingsLabel: "Change password",
          onSettings: props.onPassword,
          onLogout: props.onLogout,
        }}
      >
        {view === "overview" ? (
          <AdminOverview
            accountId={props.account.id}
            onSessionExpired={props.onSessionExpired}
            onSales={() => setView("sales")}
            onApprovals={() => setView("approvals")}
          />
        ) : view === "sales" ? (
          <AdminSalesPanel
            account={props.account}
            onSessionExpired={props.onSessionExpired}
          />
        ) : view === "targets" ? (
          <TargetsPanel
            account={props.account}
            onSessionExpired={props.onSessionExpired}
          />
        ) : view === "approvals" ? (
          <SalesPanel
            account={props.account}
            review
            onSessionExpired={props.onSessionExpired}
          />
        ) : view === "teams" ? (
          <TeamsPanel onSessionExpired={props.onSessionExpired} />
        ) : (
          <PeoplePanel
            account={props.account}
            directory={directory}
            statusMessage={props.statusMessage}
          />
        )}
      </WorkspaceShell>
      <AccountDialog directory={directory} />
    </>
  );
}
