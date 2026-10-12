import type { ReactNode } from "react";
import { WorkspaceNavbar } from "./workspace-navbar";
export function WorkspaceShell({
  sidebar,
  workspace,
  page,
  badge,
  className = "",
  children,
}: {
  sidebar: ReactNode;
  workspace: string;
  page: string;
  badge: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`admin-shell ${className}`.trim()}>
      {sidebar}
      <main className="admin-main">
        <WorkspaceNavbar workspace={workspace} page={page} badge={badge} />
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
