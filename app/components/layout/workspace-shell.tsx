import type { ReactNode, ReactElement } from "react";
import type { WorkspaceSidebarProps } from "./workspace-sidebar";
import { WorkspaceNavbar, type WorkspaceNavbarProps } from "./workspace-navbar";
export function WorkspaceShell({
  sidebar,
  navbar,
  className = "",
  children,
}: {
  sidebar: ReactElement<WorkspaceSidebarProps>;
  navbar: WorkspaceNavbarProps;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`admin-shell ${className}`.trim()}>
      <WorkspaceNavbar {...navbar} mobileNavigation={sidebar.props} />
      <div className="workspace-body">
        {sidebar}
        <main className="admin-main">
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
