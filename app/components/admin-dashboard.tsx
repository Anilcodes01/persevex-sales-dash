"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Account } from "../lib/api";
import { usePeopleDirectory } from "../hooks/use-people-directory";
import { TargetsPanel } from "./targets/targets-panel";
import { SalesPanel } from "./sales/sales-panel";
import TeamsPanel from "./teams-panel";
import { AccountDialog } from "./admin/account-dialog";
import { PeoplePanel } from "./admin/people-panel";
import { AdminSalesPanel } from "./admin/admin-sales-panel";
import { AdminProfile } from "./admin/admin-profile";
import { HistoryPanel } from "./admin/history-panel";
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
    "overview" | "people" | "teams" | "approvals" | "targets" | "sales" | "history"
  >("overview");
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("development-reset-result");
      if (!saved) return;
      sessionStorage.removeItem("development-reset-result");
      const result = JSON.parse(saved);
      if (result.avatarCleanupPending) toast.warning("Data cleared. Some R2 avatar files could not be removed. Retry the reset to finish cleanup.");
      else toast.success(`Data cleared. Your admin account and ${result.preservedPayments} Cashfree payments were kept.`);
    } catch { /* Storage may be disabled. */ }
  }, []);
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
          id === "history" ||
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

          action: <Button asChild variant="outline"><Link href="/tv">Leaderboard</Link></Button>,
          settingsLabel: "Admin profile",
          onSettings: () => setProfileOpen(true),
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
        ) : view === "history" ? (
          <HistoryPanel account={props.account} onSessionExpired={props.onSessionExpired} />
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
      {profileOpen && <AdminProfile account={props.account} onClose={() => setProfileOpen(false)} onPassword={props.onPassword} />}
    </>
  );
}
