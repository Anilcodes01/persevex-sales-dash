"use client";
import { useState } from "react";
import type { Account } from "../lib/api";
import { usePeopleDirectory } from "../hooks/use-people-directory";
import TeamsPanel from "./teams-panel";
import { AccountDialog } from "./admin/account-dialog";
import { PeoplePanel } from "./admin/people-panel";
import { WorkspaceShell } from "./layout/workspace-shell";
import { WorkspaceSidebar } from "./layout/workspace-sidebar";

type AdminDashboardProps = {
  account: Account;
  onSessionExpired: () => void;
  onPassword: () => void;
  onLogout: () => void;
  onAccountUpdated: () => void;
  statusMessage: string;
};
export default function AdminDashboard(props: AdminDashboardProps) {
  const [view, setView] = useState<"people" | "teams">("people");
  const directory = usePeopleDirectory(props);
  const sidebar = (
    <WorkspaceSidebar
      account={props.account}
      accountLabel="Administrator"
      homeHref="/"
      homeLabel="Persevex home"
      workspaceLabel="SALES WORKSPACE"
      navigationLabel="Administration"
      navigationClassName="admin-navigation"
      items={[
        {
          id: "people",
          label: "People",
          icon: "▦",
          count: directory.roster?.stats.total ?? "—",
        },
        { id: "teams", label: "Teams", icon: "◎" },
      ]}
      activeItem={view}
      onNavigate={(id) => {
        if (id === "people" || id === "teams") setView(id);
      }}
      noteTitle="Administration"
      noteDescription="Manage who has access to your sales workspace."
      settingsLabel="Change password"
      onSettings={props.onPassword}
      onLogout={props.onLogout}
    />
  );
  return (
    <>
      <WorkspaceShell
        sidebar={sidebar}
        workspace="Workspace"
        page={view === "teams" ? "Teams" : "People"}
        badge="ADMIN CONSOLE"
      >
        {view === "teams" ? (
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
