import type { ReactNode } from "react";
import { WorkspaceNavbar, type WorkspaceNavbarProps } from "./workspace-navbar";
export function WorkspaceShell({
  sidebar,
  navbar,
  className = "",
  children,
}: {
  sidebar: ReactNode;
  navbar: WorkspaceNavbarProps;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`admin-shell ${className}`.trim()}>
      <WorkspaceNavbar {...navbar} />
      <div className="workspace-body">
        {sidebar}
        <main className="admin-main">
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
